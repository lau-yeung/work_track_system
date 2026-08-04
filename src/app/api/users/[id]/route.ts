import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/auth';
import { getSessionUser } from '@/lib/session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('users')
      .select('id, username, email, real_name, role, status, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`查询失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可修改用户' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, string> = {};

    if (body.email) updates.email = body.email;
    if (body.real_name) updates.real_name = body.real_name;
    if (body.role && ['admin', 'pm', 'user'].includes(body.role)) updates.role = body.role;
    if (body.status && ['active', 'disabled'].includes(body.status)) updates.status = body.status;
    if (body.password) updates.password = await hashPassword(body.password);

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, username, email, real_name, role, status, updated_at')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '邮箱已存在' }, { status: 409 });
      }
      throw new Error(`更新失败: ${error.message}`);
    }
    if (!data) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    return NextResponse.json({ data });
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
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可删除用户' }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);
    
    // Cannot delete self
    if (currentUser.id === userId) {
      return NextResponse.json({ error: '不能删除自己的账号' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // Step 1: Delete time entries associated with this user
    const { error: teError } = await client
      .from('time_entries')
      .delete()
      .eq('user_id', userId);
    if (teError) throw new Error(`删除工时记录失败: ${teError.message}`);

    // Step 2: Delete project memberships
    const { error: pmError } = await client
      .from('project_members')
      .delete()
      .eq('user_id', userId);
    if (pmError) throw new Error(`删除项目成员关系失败: ${pmError.message}`);

    // Step 3: Handle projects owned by this user - transfer ownership or set to NULL
    // First check if there are owned projects
    const { data: ownedProjects, error: opError } = await client
      .from('projects')
      .select('id')
      .eq('owner_id', userId);
    
    if (opError) throw new Error(`查询负责项目失败: ${opError.message}`);

    if (ownedProjects && ownedProjects.length > 0) {
      // Transfer ownership to the current admin user
      const { error: updateError } = await client
        .from('projects')
        .update({ owner_id: currentUser.id })
        .eq('owner_id', userId);
      if (updateError) throw new Error(`转移项目负责人失败: ${updateError.message}`);
    }

    // Step 4: Delete the user
    const { error: deleteError } = await client
      .from('users')
      .delete()
      .eq('id', userId);
    if (deleteError) throw new Error(`删除用户失败: ${deleteError.message}`);

    return NextResponse.json({ 
      message: '删除成功',
      transferredProjects: ownedProjects?.length || 0
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
