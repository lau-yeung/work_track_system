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
    const client = getSupabaseClient();
    const { error } = await client.from('users').delete().eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ message: '删除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
