import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyPassword, createToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    let client;
    try {
      client = getSupabaseClient();
    } catch (initErr) {
      console.error('Supabase client init error:', initErr);
      return NextResponse.json({ 
        error: '数据库连接失败，请检查环境变量配置（COZE_SUPABASE_URL 和 COZE_SUPABASE_ANON_KEY）' 
      }, { status: 500 });
    }

    let user;
    try {
      const result = await client
        .from('users')
        .select('id, username, password, role, real_name, status')
        .eq('username', username)
        .maybeSingle();
      
      if (result.error) {
        console.error('Database query error:', result.error);
        return NextResponse.json({ 
          error: '数据库查询失败，请确保已执行数据库初始化脚本（init-database.sql）创建users表' 
        }, { status: 500 });
      }
      user = result.data;
    } catch (queryErr) {
      console.error('Database query exception:', queryErr);
      const msg = queryErr instanceof Error ? queryErr.message : '';
      if (msg.includes('fetch failed') || msg.includes('Failed to fetch')) {
        return NextResponse.json({ 
          error: '无法连接到数据库服务器，请检查网络连接和Supabase配置' 
        }, { status: 500 });
      }
      return NextResponse.json({ 
        error: `数据库错误: ${msg || '未知错误'}` 
      }, { status: 500 });
    }

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
    console.error('Login error:', err);
    const message = err instanceof Error ? err.message : '登录失败';
    return NextResponse.json({ error: `服务器错误: ${message}` }, { status: 500 });
  }
}
