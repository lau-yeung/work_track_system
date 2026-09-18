import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables } from '@/lib/product-init';

// 工时列表/详情统一嵌入：项目(含产品)、任务、版本、用户
const ENTRY_SELECT =
  '*, projects(id, name, product_id, products!projects_product_id_fkey(id, name)), ' +
  'project_tasks!time_entries_task_id_fkey(id, name, status), ' +
  'project_versions!time_entries_version_id_fkey(id, name), ' +
  'users(id, real_name, username)';

// 将 newItem 追加到 existing 之后，按 "1. xxx\n2. xxx" 编号列表格式合并。
// 若 existing 为空则直接作为第 1 项；若 existing 不是编号列表，则把旧内容作为第 1 项。
function appendNumberedItem(existing: string | null, newItem: string | null): string {
  const trimmedNew = (newItem ?? '').trim();
  if (!trimmedNew) return existing ?? '';
  const trimmedExisting = (existing ?? '').trim();
  if (!trimmedExisting) return `1. ${trimmedNew}`;
  const idxMatches = [...trimmedExisting.matchAll(/(?:^|\n)\s*(\d+)\.\s/g)];
  if (idxMatches.length > 0) {
    const maxIdx = idxMatches.reduce((max, m) => Math.max(max, parseInt(m[1], 10)), 0);
    return `${trimmedExisting.replace(/\n+$/, '')}\n${maxIdx + 1}. ${trimmedNew}`;
  }
  return `1. ${trimmedExisting}\n2. ${trimmedNew}`;
}

// 备注类字段：以换行简单追加，保留两段原文
function appendRemarks(existing: string | null, newItem: string | null): string {
  const trimmedNew = (newItem ?? '').trim();
  if (!trimmedNew) return existing ?? '';
  const trimmedExisting = (existing ?? '').trim();
  if (!trimmedExisting) return trimmedNew;
  return `${trimmedExisting}\n${trimmedNew}`;
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureProductTables();

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const projectId = searchParams.get('projectId');
    const taskId = searchParams.get('taskId');
    const userIdParam = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    // admin 传 mine=1 时只看自己（用于填报弹窗默认值预填，避免取到他人记录）
    const mine = searchParams.get('mine') === '1';

    let query = client
      .from('time_entries')
      .select(ENTRY_SELECT, { count: 'exact' })
      .order('work_date', { ascending: false })
      .order('id', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    // Non-admin users only see their own entries
    // admin 传 mine=1 时也只看自己
    if (currentUser.role === 'user' || mine) {
      query = query.eq('user_id', currentUser.id);
    } else if (userIdParam) {
      // admin 可按 userId 筛选特定成员的工时
      query = query.eq('user_id', parseInt(userIdParam, 10));
    }

    if (projectId) query = query.eq('project_id', projectId);
    if (taskId) query = query.eq('task_id', taskId);
    if (startDate) query = query.gte('work_date', startDate);
    if (endDate) query = query.lte('work_date', endDate);

    const { data, error, count } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ data, total: count, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureProductTables();

    const body = await request.json();
    const { project_id, task_id, work_date, hours, remarks, completed_work, coordination_matters, tomorrow_plan, version_id, progress } = body;

    if (!project_id || !work_date || !hours) {
      return NextResponse.json({ error: '项目、工作日期和工时为必填' }, { status: 400 });
    }
    if (!task_id) {
      return NextResponse.json({ error: '请选择所属任务（产品-项目-任务）' }, { status: 400 });
    }

    const hoursNum = parseFloat(hours);
    if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
      return NextResponse.json({ error: '工时必须在0-24之间' }, { status: 400 });
    }

    // 进度由用户手动录入，校验为 0-100 整数
    let progressNum = 0;
    if (progress !== undefined && progress !== null && progress !== '') {
      progressNum = parseInt(progress, 10);
      if (isNaN(progressNum) || progressNum < 0 || progressNum > 100) {
        return NextResponse.json({ error: '任务进度必须为 0-100 之间的整数' }, { status: 400 });
      }
    }

    const client = getSupabaseClient();

    // 校验任务：存在、归属所选项目、未关闭
    const { data: task, error: taskError } = await client
      .from('project_tasks')
      .select('id, project_id, status')
      .eq('id', task_id)
      .maybeSingle();
    if (taskError) throw new Error(`校验任务失败: ${taskError.message}`);
    if (!task) {
      return NextResponse.json({ error: '所选任务不存在' }, { status: 400 });
    }
    if (Number(task.project_id) !== Number(project_id)) {
      return NextResponse.json({ error: '所选任务不属于该项目，请重新选择产品-项目-任务' }, { status: 400 });
    }
    if (task.status === 'closed') {
      return NextResponse.json({ error: '该任务已关闭，请选择其他任务' }, { status: 400 });
    }

    // 校验版本（可选）：若指定，必须归属所选项目
    let validatedVersionId: number | null = null;
    if (version_id) {
      const { data: version, error: vError } = await client
        .from('project_versions')
        .select('id, project_id')
        .eq('id', version_id)
        .maybeSingle();
      if (vError) throw new Error(`校验版本失败: ${vError.message}`);
      if (!version) {
        return NextResponse.json({ error: '所选版本不存在' }, { status: 400 });
      }
      if (Number(version.project_id) !== Number(project_id)) {
        return NextResponse.json({ error: '所选版本不属于该项目' }, { status: 400 });
      }
      validatedVersionId = version.id;
    }

    // Check project membership
    const { data: membership } = await client
      .from('project_members')
      .select('id')
      .eq('project_id', project_id)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (!membership && currentUser.role !== 'admin') {
      return NextResponse.json({ error: '您不是该项目成员，无法填报工时' }, { status: 403 });
    }

    // Check daily hour limit (8h)
    const { data: dailyEntries } = await client
      .from('time_entries')
      .select('hours')
      .eq('user_id', currentUser.id)
      .eq('work_date', work_date);

    const currentDailyTotal = dailyEntries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;
    if (currentDailyTotal + hoursNum > 8) {
      return NextResponse.json(
        { error: `单日工时总计不能超过8小时（当前已填报${currentDailyTotal}小时）` },
        { status: 400 }
      );
    }

    // Check project hour limit
    const { data: project } = await client
      .from('projects')
      .select('estimated_hours')
      .eq('id', project_id)
      .maybeSingle();

    if (project) {
      const { data: projectEntries } = await client
        .from('time_entries')
        .select('hours')
        .eq('project_id', project_id);

      const currentProjectTotal = projectEntries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;
      if (currentProjectTotal + hoursNum > parseFloat(project.estimated_hours)) {
        return NextResponse.json(
          { error: `项目工时已超出预估（预估${project.estimated_hours}小时，已用${currentProjectTotal}小时）` },
          { status: 400 }
        );
      }
    }

    // Check if entry already exists for this user+project+task+date+version - merge if so
    // （三级结构后，同日同项目但不同任务/不同版本视为不同记录，不再跨版本合并）
    let existingQuery = client
      .from('time_entries')
      .select('id, hours, progress, remarks, completed_work, coordination_matters, tomorrow_plan, version_id')
      .eq('user_id', currentUser.id)
      .eq('project_id', project_id)
      .eq('task_id', task_id)
      .eq('work_date', work_date);
    if (validatedVersionId) {
      existingQuery = existingQuery.eq('version_id', validatedVersionId);
    } else {
      existingQuery = existingQuery.is('version_id', null);
    }
    const { data: existing } = await existingQuery.maybeSingle();

    let result: { id: number } | null = null;
    let merged = false;
    if (existing) {
      // 同一天同一项目同一任务同一版本已存在记录：工时累加，详情按编号列表合并（而非覆盖）
      // 进度取本次传入与已存值的较大者，避免合并覆盖回退进度
      const existingProgress = typeof existing.progress === 'number' ? existing.progress : 0;
      const mergedProgress = Math.max(existingProgress, progressNum);
      const mergedHours = parseFloat(existing.hours) + hoursNum;
      const { data, error } = await client
        .from('time_entries')
        .update({
          hours: String(mergedHours),
          progress: mergedProgress,
          remarks: appendRemarks(existing.remarks, remarks),
          completed_work: appendNumberedItem(existing.completed_work, completed_work),
          coordination_matters: appendNumberedItem(existing.coordination_matters, coordination_matters),
          tomorrow_plan: appendNumberedItem(existing.tomorrow_plan, tomorrow_plan),
        })
        .eq('id', existing.id)
        .select(ENTRY_SELECT)
        .maybeSingle();
      if (error) throw new Error(`合并工时失败: ${error.message}`);
      result = (data as { id: number } | null) ?? null;
      merged = true;
    } else {
      // Create new entry
      const { data, error } = await client
        .from('time_entries')
        .insert({
          user_id: currentUser.id,
          project_id,
          task_id,
          version_id: validatedVersionId,
          work_date,
          hours: String(hoursNum),
          progress: progressNum,
          remarks,
          completed_work,
          coordination_matters,
          tomorrow_plan,
        })
        .select(ENTRY_SELECT)
        .maybeSingle();
      if (error) throw new Error(`创建工时失败: ${error.message}`);
      result = (data as { id: number } | null) ?? null;
    }

    // Query daily total after save for reminder
    const { data: dailyAfter } = await client
      .from('time_entries')
      .select('hours')
      .eq('user_id', currentUser.id)
      .eq('work_date', work_date);
    const dailyTotal = (dailyAfter || []).reduce(
      (sum: number, e: { hours: string }) => sum + parseFloat(e.hours),
      0
    );

    return NextResponse.json(
      {
        data: result,
        daily_total: Math.round(dailyTotal * 10) / 10,
        is_below_minimum: dailyTotal < 8,
        merged,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '填报失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
