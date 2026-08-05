import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可测试AI连接' }, { status: 403 });
    }

    const client = getSupabaseClient();
    const { data: configs, error } = await client
      .from('system_configs')
      .select('config_key, config_value')
      .in('config_key', ['ai_provider', 'ai_api_endpoint', 'ai_api_key', 'ai_model', 'enable_ai_features']);

    if (error || !configs) {
      return NextResponse.json({ error: `读取配置失败: ${error?.message || '未知错误'}` }, { status: 500 });
    }

    const configMap = Object.fromEntries(configs.map((c) => [c.config_key, c.config_value]));

    if (configMap.enable_ai_features !== 'true') {
      return NextResponse.json({
        success: false,
        message: 'AI功能未启用，请先在系统设置中开启',
        config: {
          provider: configMap.ai_provider || 'builtin',
          endpoint: configMap.ai_api_endpoint || '',
          model: configMap.ai_model || '',
        },
      });
    }

    if (configMap.ai_provider !== 'external') {
      return NextResponse.json({
        success: false,
        message: '当前使用的是内置AI（规则引擎），无需测试API连接',
        config: {
          provider: configMap.ai_provider,
        },
      });
    }

    const apiEndpoint = configMap.ai_api_endpoint?.trim();
    const apiKey = configMap.ai_api_key?.trim();
    const model = configMap.ai_model?.trim();

    if (!apiEndpoint || !apiKey || !model) {
      const missing: string[] = [];
      if (!apiEndpoint) missing.push('API端点');
      if (!apiKey) missing.push('API密钥');
      if (!model) missing.push('模型名称');
      return NextResponse.json({
        success: false,
        message: `外部AI配置不完整，缺少: ${missing.join('、')}`,
        config: {
          endpoint: apiEndpoint || '(未设置)',
          model: model || '(未设置)',
        },
      });
    }

    // Build full URL - handle both with /v1 and without
    const baseUrl = apiEndpoint.replace(/\/$/, '');
    const fullUrl = `${baseUrl}/chat/completions`;

    const maskedKey = apiKey.length > 10
      ? apiKey.slice(0, 4) + '****' + apiKey.slice(-4)
      : '****';

    const startTime = Date.now();

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个连接测试助手。' },
          { role: 'user', content: '请回复"连接成功"四个字。' },
        ],
        temperature: 0.1,
        max_tokens: 20,
        stream: false,
      }),
    });

    const elapsed = Date.now() - startTime;

    const responseText = await response.text();

    if (!response.ok) {
      let errorDetail = responseText;
      try {
        const errorData = JSON.parse(responseText);
        errorDetail = errorData.message || errorData.error?.message || responseText;
      } catch {
        // Use raw text if not JSON
      }

      return NextResponse.json({
        success: false,
        message: `API调用失败 (HTTP ${response.status})`,
        httpStatus: response.status,
        errorDetail,
        config: {
          endpoint: baseUrl,
          fullUrl,
          model,
          apiKey: maskedKey,
        },
        elapsed,
      });
    }

    const data = JSON.parse(responseText);
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};

    return NextResponse.json({
      success: true,
      message: 'DeepSeek API 连接成功！',
      config: {
        endpoint: baseUrl,
        fullUrl,
        model,
        apiKey: maskedKey,
      },
      response: {
        content: content.trim(),
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      },
      elapsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '测试失败';
    return NextResponse.json({
      success: false,
      message: `测试异常: ${message}`,
    }, { status: 500 });
  }
}
