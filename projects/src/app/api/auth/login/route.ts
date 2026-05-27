import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyPassword, createToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: user, error } = await client
      .from('users')
      .select('id, username, password, role, real_name, status')
      .eq('username', username)
      .maybeSingle();

    if (error) throw new Error(`查询失败: ${error.message}`);
    if (!user) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }
    if (user.status === 'disabled') {
      return NextResponse.json({ error: '账号已被禁用' }, { status: 403 });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const token = await createToken({
      id: user.id,
      username: user.username,
      role: user.role,
      real_name: user.real_name,
    });

    const response = NextResponse.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, real_name: user.real_name },
    });

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : '登录失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
