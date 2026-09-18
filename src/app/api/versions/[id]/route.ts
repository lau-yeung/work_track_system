import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables } from '@/lib/product-init';

// 更新版本（仅管理员/PM）：改名、描述、发布日期、状态
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      return NextResponse.json({ error: '仅PM或管理员可编辑版本' }, { status: 403 });
    }

    await ensureProductTables();

    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, string | null> = {};

    if (body.name !== undefined) {
      if (!String(body.name).trim()) {
        return NextResponse.json({ error: '版本名称不能为空' }, { status: 400 });
      }
      updates.name = String(body.name).trim();
    }
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.release_date !== undefined) updates.release_date = body.release_date || null;
    if (body.status !== undefined && ['active', 'closed'].includes(body.status)) {
      updates.status = body.status;
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('project_versions')
      .update(updates)
      .eq('id', id)
      .select('*, projects(id, name)')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '该项目下已存在同名版本' }, { status: 400 });
      }
      throw new Error(`更新失败: ${error.message}`);
    }
    if (!data) return NextResponse.json({ error: '版本不存在' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 删除版本（仅管理员/PM）
// 已被任务引用的版本不可删除（保留任务-版本绑定历史），请改为"关闭"
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      return NextResponse.json({ error: '仅PM或管理员可删除版本' }, { status: 403 });
    }

    await ensureProductTables();

    const { id } = await params;
    const client = getSupabaseClient();

    // 校验是否有任务引用此版本（N:N 关联表）
    const { data: linkedTasks, error: countError } = await client
      .from('project_task_versions')
      .select('task_id')
      .eq('version_id', id)
      .limit(1);
    if (countError) throw new Error(`校验任务引用失败: ${countError.message}`);

    if (linkedTasks && linkedTasks.length > 0) {
      return NextResponse.json(
        {
          error: '该版本已被任务引用，不可删除（可将版本状态改为"关闭"，关闭后新建任务不再默认显示）',
        },
        { status: 400 }
      );
    }

    const { error } = await client.from('project_versions').delete().eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ message: '删除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
