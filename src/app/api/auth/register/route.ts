import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const client = getSupabaseClient();
    
    // Check if registration is allowed
    const { data: config } = await client
      .from('system_configs')
      .select('config_value')
      .eq('config_key', 'allow_user_registration')
      .maybeSingle();
    
    if (config?.config_value !== 'true') {
      return NextResponse.json({ error: '当前系统不允许用户注册' }, { status: 403 });
    }
    
    // Get approval required setting
    const { data: approvalConfig } = await client
      .from('system_configs')
      .select('config_value')
      .eq('config_key', 'registration_approval_required')
      .maybeSingle();
    
    const approvalRequired = approvalConfig?.config_value === 'true';
    
    const { username, password, email, real_name } = await request.json();
    
    if (!username || !password || !email || !real_name) {
      return NextResponse.json({ error: '所有字段为必填' }, { status: 400 });
    }
    
    // Check if username already exists
    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    
    if (existingUser) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 400 });
    }
    
    // Check if email already exists
    const { data: existingEmail } = await client
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    
    if (existingEmail) {
      return NextResponse.json({ error: '邮箱已被注册' }, { status: 400 });
    }
    
    const hashedPassword = await hashPassword(password);
    
    const { data: user, error } = await client
      .from('users')
      .insert({
        username,
        password: hashedPassword,
        email,
        real_name,
        role: 'user',
        status: approvalRequired ? 'pending' : 'active',
      })
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      message: approvalRequired ? '注册成功，等待管理员审核' : '注册成功，请登录',
      user: { id: user.id, username: user.username, real_name: user.real_name, status: user.status },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '注册失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
