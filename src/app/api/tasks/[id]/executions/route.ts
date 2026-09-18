import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables, recalcTaskProgress } from '@/lib/product-init';

interface ExecutionRow {
  id: number;
  task_id: number;
  name: string;
  description: string | null;
  status: string;
  sort_order: number;
  completed_at: string | null;
  completed_by: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  users?: { id: number; real_name: string } | null;
  completer?: { id: number; real_name: string } | null;
}

// 查询任务下所有执行（按 sort_order, created_at 排序）
// 普通用户只能看自己参与项目下的任务执行
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureProductTables();

    const { id } = await params;
    const client = getSupabaseClient();

    // 校验任务存在 + 可见性
    const { data: task, error: tError } = await client
      .from('project_tasks')
      .select('id, project_id, projects!project_tasks_project_id_fkey(id, owner_id)')
      .eq('id', id)
      .maybeSingle();
    if (tError) throw new Error(`查询任务失败: ${tError.message}`);
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });

    // 非管理员校验可见性
    if (currentUser.role !== 'admin') {
      const projectId = (task as { project_id: number }).project_id;
      const { data: membership } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      const ownerId = (
        task.projects as unknown as { owner_id: number } | null
      )?.owner_id;
      if (!membership && ownerId !== currentUser.id) {
        return NextResponse.json({ error: '无权访问该任务' }, { status: 403 });
      }
    }

    const { data, error } = await client
      .from('task_executions')
      .select(
        '*, users:created_by(id, real_name), completer:completed_by(id, real_name)'
      )
      .eq('task_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(`查询执行失败: ${error.message}`);

    return NextResponse.json({ data: (data || []) as ExecutionRow[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 创建执行（仅管理员/PM 或任务所属项目成员）
// 请求体：{ name: string, description?: string, sort_order?: number }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureProductTables();

    const { id } = await params;
    const client = getSupabaseClient();

    // 校验任务存在
    const { data: task, error: tError } = await client
      .from('project_tasks')
      .select('id, project_id, status')
      .eq('id', id)
      .maybeSingle();
    if (tError) throw new Error(`查询任务失败: ${tError.message}`);
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    if (task.status === 'closed') {
      return NextResponse.json({ error: '任务已关闭，无法添加执行' }, { status: 400 });
    }

    // 权限：管理员/PM，或任务所属项目成员
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      const { data: membership } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', task.project_id)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: '无权为该任务添加执行' }, { status: 403 });
      }
    }

    const body = await request.json();
    const name = String(body.name ?? '').trim();
    if (!name) {
      return NextResponse.json({ error: '执行名称为必填' }, { status: 400 });
    }
    const description = body.description ? String(body.description) : null;
    const sortOrder =
      Number.isInteger(body.sort_order) && (body.sort_order as number) >= 0
        ? Number(body.sort_order)
        : 0;

    const { data, error } = await client
      .from('task_executions')
      .insert({
        task_id: Number(id),
        name,
        description,
        sort_order: sortOrder,
        created_by: currentUser.id,
      })
      .select('*, users:created_by(id, real_name), completer:completed_by(id, real_name)')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '该任务下已存在同名执行' }, { status: 400 });
      }
      throw new Error(`创建执行失败: ${error.message}`);
    }

    // 创建执行后总执行数变化，重算任务进度
    await recalcTaskProgress(Number(id));

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
