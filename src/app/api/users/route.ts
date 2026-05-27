import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/auth';
import { getSessionUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const keyword = searchParams.get('keyword');

    let query = client
      .from('users')
      .select('id, username, email, real_name, role, status, created_at, updated_at', { count: 'exact' })
      .order('id', { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (role) query = query.eq('role', role);
    if (status) query = query.eq('status', status);
    if (keyword) query = query.or(`username.ilike.%${keyword}%,real_name.ilike.%${keyword}%,email.ilike.%${keyword}%`);

    const { data, error, count } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({
      data,
      total: count,
      page,
      pageSize,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可创建用户' }, { status: 403 });
    }

    const body = await request.json();
    const { username, password, email, real_name, role } = body;

    if (!username || !password || !email || !real_name || !role) {
      return NextResponse.json({ error: '所有字段为必填' }, { status: 400 });
    }

    if (!['admin', 'pm', 'user'].includes(role)) {
      return NextResponse.json({ error: '无效的角色类型' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('users')
      .insert({ username, password: hashedPassword, email, real_name, role })
      .select('id, username, email, real_name, role, status, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '用户名或邮箱已存在' }, { status: 409 });
      }
      throw new Error(`创建失败: ${error.message}`);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
