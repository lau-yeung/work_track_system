import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables, recalcTaskProgress } from '@/lib/product-init';

// 编辑执行：name/description/sort_order
// 仅 admin/pm，或执行所属任务的创建者/项目成员
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

    const { data: execution, error: eError } = await client
      .from('task_executions')
      .select('id, task_id, project_tasks!task_executions_task_id_fkey(project_id)')
      .eq('id', id)
      .maybeSingle();
    if (eError) throw new Error(`查询执行失败: ${eError.message}`);
    if (!execution) return NextResponse.json({ error: '执行不存在' }, { status: 404 });

    const projectId = (
      execution.project_tasks as unknown as { project_id: number } | null
    )?.project_id;
    if (projectId == null) {
      return NextResponse.json({ error: '执行所属任务不存在' }, { status: 400 });
    }

    // 权限：admin/pm 或项目成员
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      const { data: membership } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: '无权编辑该执行' }, { status: 403 });
      }
    }

    const body = await request.json();
    const updates: Record<string, string | number | null> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: '执行名称不能为空' }, { status: 400 });
      }
      updates.name = name;
    }
    if (body.description !== undefined) {
      updates.description = body.description ? String(body.description) : null;
    }
    if (body.sort_order !== undefined && Number.isInteger(body.sort_order)) {
      updates.sort_order = Number(body.sort_order);
    }

    const { data, error } = await client
      .from('task_executions')
      .update(updates)
      .eq('id', id)
      .select('*, users:created_by(id, real_name), completer:completed_by(id, real_name)')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '该任务下已存在同名执行' }, { status: 400 });
      }
      throw new Error(`更新失败: ${error.message}`);
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 删除执行
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureProductTables();

    const { id } = await params;
    const client = getSupabaseClient();

    const { data: execution, error: eError } = await client
      .from('task_executions')
      .select('id, task_id, project_tasks!task_executions_task_id_fkey(project_id)')
      .eq('id', id)
      .maybeSingle();
    if (eError) throw new Error(`查询执行失败: ${eError.message}`);
    if (!execution) return NextResponse.json({ error: '执行不存在' }, { status: 404 });

    const taskId = (execution as { task_id: number }).task_id;
    const projectId = (
      execution.project_tasks as unknown as { project_id: number } | null
    )?.project_id;
    if (projectId == null) {
      return NextResponse.json({ error: '执行所属任务不存在' }, { status: 400 });
    }

    // 权限：admin/pm 或项目成员
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      const { data: membership } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: '无权删除该执行' }, { status: 403 });
      }
    }

    const { error } = await client.from('task_executions').delete().eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);

    // 删除后总执行数变化，重算任务进度
    await recalcTaskProgress(taskId);

    return NextResponse.json({ message: '删除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
