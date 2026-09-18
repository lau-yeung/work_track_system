import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables } from '@/lib/product-init';

// 工时详情统一嵌入：项目(含产品)、任务、版本、用户
const ENTRY_SELECT =
  '*, projects(id, name, product_id, products!projects_product_id_fkey(id, name)), ' +
  'project_tasks!time_entries_task_id_fkey(id, name, status), ' +
  'project_versions!time_entries_version_id_fkey(id, name), ' +
  'users(id, real_name, username)';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureProductTables();

    const { id } = await params;
    const client = getSupabaseClient();

    // Get existing entry
    const { data: existing, error: fetchError } = await client
      .from('time_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw new Error(`查询失败: ${fetchError.message}`);
    if (!existing) return NextResponse.json({ error: '记录不存在' }, { status: 404 });

    // Only owner or admin can edit
    if (existing.user_id !== currentUser.id && currentUser.role !== 'admin') {
      return NextResponse.json({ error: '只能编辑自己的工时记录' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, string | number | null> = {};

    if (body.hours !== undefined) {
      const hoursNum = parseFloat(body.hours);
      if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
        return NextResponse.json({ error: '工时必须在0-24之间' }, { status: 400 });
      }
      updates.hours = String(hoursNum);
    }
    if (body.remarks !== undefined) updates.remarks = body.remarks;
    if (body.completed_work !== undefined) updates.completed_work = body.completed_work;
    if (body.coordination_matters !== undefined) updates.coordination_matters = body.coordination_matters;
    if (body.tomorrow_plan !== undefined) updates.tomorrow_plan = body.tomorrow_plan;
    // progress 由用户手动录入，校验为 0-100 整数
    if (body.progress !== undefined && body.progress !== null) {
      const progressNum = parseInt(body.progress, 10);
      if (isNaN(progressNum) || progressNum < 0 || progressNum > 100) {
        return NextResponse.json({ error: '任务进度必须为 0-100 之间的整数' }, { status: 400 });
      }
      updates.progress = progressNum;
    }

    // 可选修改所属任务：校验任务存在、归属同一项目、未关闭、且不与其它记录冲突
    if (body.task_id !== undefined && body.task_id !== null) {
      const { data: task, error: taskError } = await client
        .from('project_tasks')
        .select('id, project_id, status')
        .eq('id', body.task_id)
        .maybeSingle();
      if (taskError) throw new Error(`校验任务失败: ${taskError.message}`);
      if (!task) {
        return NextResponse.json({ error: '所选任务不存在' }, { status: 400 });
      }
      if (Number(task.project_id) !== Number(existing.project_id)) {
        return NextResponse.json({ error: '所选任务不属于该项目，不可跨项目调整任务' }, { status: 400 });
      }
      if (task.status === 'closed') {
        return NextResponse.json({ error: '该任务已关闭，请选择其他任务' }, { status: 400 });
      }
      // 冲突查询：同 user+project+task+date+version（version 用更新后的最终值判断）
      let conflictQuery = client
        .from('time_entries')
        .select('id')
        .eq('user_id', existing.user_id)
        .eq('project_id', existing.project_id)
        .eq('task_id', body.task_id)
        .eq('work_date', existing.work_date)
        .neq('id', parseInt(id));
      // 用最终生效的 version_id 判断冲突
      const finalVersionId =
        body.version_id !== undefined
          ? (body.version_id === null || body.version_id === 0 || body.version_id === ''
              ? null
              : Number(body.version_id))
          : existing.version_id;
      if (finalVersionId) {
        conflictQuery = conflictQuery.eq('version_id', finalVersionId);
      } else {
        conflictQuery = conflictQuery.is('version_id', null);
      }
      const { data: conflict } = await conflictQuery.maybeSingle();
      if (conflict) {
        return NextResponse.json(
          { error: '该日期下已存在相同项目+任务+版本的工时记录，请勿重复' },
          { status: 400 }
        );
      }
      updates.task_id = body.task_id;
    }

    // 可选修改所属版本：传 null/0/'' 解绑，传正整数绑定（校验归属项目）
    if (body.version_id !== undefined) {
      const v = body.version_id;
      if (v === null || v === 0 || v === '') {
        updates.version_id = null;
      } else {
        const { data: version, error: vError } = await client
          .from('project_versions')
          .select('id, project_id')
          .eq('id', Number(v))
          .maybeSingle();
        if (vError) throw new Error(`校验版本失败: ${vError.message}`);
        if (!version) {
          return NextResponse.json({ error: '所选版本不存在' }, { status: 400 });
        }
        if (Number(version.project_id) !== Number(existing.project_id)) {
          return NextResponse.json({ error: '所选版本不属于该项目' }, { status: 400 });
        }
        updates.version_id = version.id;
      }
    }

    // Check daily hour limit
    if (updates.hours) {
      const { data: dailyEntries } = await client
        .from('time_entries')
        .select('hours')
        .eq('user_id', existing.user_id)
        .eq('work_date', existing.work_date)
        .neq('id', parseInt(id));

      const otherDailyTotal = dailyEntries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;
      if (otherDailyTotal + Number(updates.hours) > 8) {
        return NextResponse.json({ error: '单日工时总计不能超过8小时' }, { status: 400 });
      }
    }

    const { data, error } = await client
      .from('time_entries')
      .update(updates)
      .eq('id', id)
      .select(ENTRY_SELECT)
      .maybeSingle();

    if (error) throw new Error(`更新失败: ${error.message}`);

    // Query daily total after update for reminder
    const { data: dailyAfter } = await client
      .from('time_entries')
      .select('hours')
      .eq('user_id', existing.user_id)
      .eq('work_date', existing.work_date);
    const dailyTotal = (dailyAfter || []).reduce(
      (sum: number, e: { hours: string }) => sum + parseFloat(e.hours),
      0
    );

    return NextResponse.json({
      data,
      daily_total: Math.round(dailyTotal * 10) / 10,
      is_below_minimum: dailyTotal < 8,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const client = getSupabaseClient();

    const { data: existing } = await client
      .from('time_entries')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    if (existing.user_id !== currentUser.id && currentUser.role !== 'admin') {
      return NextResponse.json({ error: '只能删除自己的工时记录' }, { status: 403 });
    }

    const { error } = await client.from('time_entries').delete().eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ message: '删除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
