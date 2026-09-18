import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables } from '@/lib/product-init';

// 更新任务（仅管理员/PM）：改名、描述、状态（active/closed）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      return NextResponse.json({ error: '仅PM或管理员可编辑任务' }, { status: 403 });
    }

    await ensureProductTables();

    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, string | number | null> = {};

    if (body.name !== undefined) {
      if (!String(body.name).trim()) {
        return NextResponse.json({ error: '任务名称不能为空' }, { status: 400 });
      }
      updates.name = String(body.name).trim();
    }
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.status !== undefined && ['active', 'closed'].includes(body.status)) {
      updates.status = body.status;
    }
    // 任务-版本 N:N 关系通过 /api/tasks/[id]/versions 单独维护，此处不再处理 version_id

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('project_tasks')
      .update(updates)
      .eq('id', id)
      .select(
        '*, projects(id, name, product_id, products!projects_product_id_fkey(id, name)), project_task_versions(version_id, project_versions(id, name))'
      )
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '该项目下已存在同名任务' }, { status: 400 });
      }
      throw new Error(`更新失败: ${error.message}`);
    }
    if (!data) return NextResponse.json({ error: '任务不存在' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 删除任务（仅管理员/PM）
// 已被工时记录引用的任务不可删除（避免历史日报失去任务归属），请改为"关闭"
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      return NextResponse.json({ error: '仅PM或管理员可删除任务' }, { status: 403 });
    }

    await ensureProductTables();

    const { id } = await params;
    const client = getSupabaseClient();

    const { data: linkedEntries, error: countError } = await client
      .from('time_entries')
      .select('id')
      .eq('task_id', id)
      .limit(1);
    if (countError) throw new Error(`校验工时引用失败: ${countError.message}`);

    if (linkedEntries && linkedEntries.length > 0) {
      return NextResponse.json(
        { error: '该任务已被工时记录引用，不可删除（可将任务状态改为"关闭"，关闭后填报时不再显示）' },
        { status: 400 }
      );
    }

    const { error } = await client.from('project_tasks').delete().eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ message: '删除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
