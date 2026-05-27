import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可访问' }, { status: 403 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('system_configs')
      .select('*')
      .order('id');

    if (error) throw new Error(`查询失败: ${error.message}`);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可修改' }, { status: 403 });
    }

    const body = await request.json() as { configs: Array<{ config_key: string; config_value: string }> };
    const { configs } = body;

    if (!configs || !Array.isArray(configs)) {
      return NextResponse.json({ error: '无效的配置数据' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const results = [];

    for (const config of configs) {
      const { data, error } = await client
        .from('system_configs')
        .update({ config_value: config.config_value })
        .eq('config_key', config.config_key)
        .select()
        .maybeSingle();
      if (error) throw new Error(`更新配置失败: ${error.message}`);
      if (data) results.push(data);
    }

    return NextResponse.json({ data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
