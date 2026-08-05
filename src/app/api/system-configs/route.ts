import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

const DEFAULT_CONFIGS = [
  { config_key: 'daily_hour_limit', config_value: '8', config_type: 'number', description: '单人工时上限（小时/天）' },
  { config_key: 'warning_threshold', config_value: '80', config_type: 'number', description: '工时使用率预警阈值(%)' },
  { config_key: 'critical_threshold', config_value: '100', config_type: 'number', description: '工时使用率严重阈值(%)' },
  { config_key: 'allow_historical_entry', config_value: 'true', config_type: 'boolean', description: '是否允许补填历史工时' },
  { config_key: 'enable_ai_features', config_value: 'false', config_type: 'boolean', description: '是否启用AI分析功能' },
  { config_key: 'allow_user_registration', config_value: 'true', config_type: 'boolean', description: '是否允许用户注册' },
  { config_key: 'registration_approval_required', config_value: 'true', config_type: 'boolean', description: '注册用户是否需要审核' },
  // AI Configuration
  { config_key: 'ai_provider', config_value: 'builtin', config_type: 'string', description: 'AI服务提供商（builtin=内置AI, external=外部AI）' },
  { config_key: 'ai_api_endpoint', config_value: '', config_type: 'string', description: '外部AI API端点（如 https://api.deepseek.com）' },
  { config_key: 'ai_api_key', config_value: '', config_type: 'string', description: '外部AI API密钥' },
  { config_key: 'ai_model', config_value: '', config_type: 'string', description: 'AI模型名称（如 deepseek-v4-flash、deepseek-v4-pro 等）' },
];

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可访问' }, { status: 403 });
    }

    const client = getSupabaseClient();
    const { data: existingConfigs, error } = await client
      .from('system_configs')
      .select('*')
      .order('id');

    if (error) throw new Error(`查询失败: ${error.message}`);

    // Check and insert missing configs
    const existingKeys = new Set((existingConfigs || []).map((c: { config_key: string }) => c.config_key));
    const missingConfigs = DEFAULT_CONFIGS.filter(c => !existingKeys.has(c.config_key));

    if (missingConfigs.length > 0) {
      const { data: inserted, error: insertError } = await client
        .from('system_configs')
        .insert(missingConfigs)
        .select();
      if (insertError) throw new Error(`补充配置失败: ${insertError.message}`);
      
      // Merge with existing
      const mergedData = [...(existingConfigs || []), ...(inserted || [])];
      return NextResponse.json({ data: mergedData });
    }

    return NextResponse.json({ data: existingConfigs });
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
