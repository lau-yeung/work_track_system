// Fix DeepSeek API configuration
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

function loadEnv() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dirname, '..', '.env.local');
  try {
    const content = readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let value = trimmed.substring(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch {}
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.COZE_SUPABASE_URL;
  const supabaseKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 缺少 Supabase 配置');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const updates = [
    { config_key: 'ai_api_endpoint', config_value: 'https://api.deepseek.com' },
    { config_key: 'ai_model', config_value: 'deepseek-v4-flash' },
  ];

  console.log('📝 更新配置...');
  for (const update of updates) {
    const { data, error } = await supabase
      .from('system_configs')
      .update({ config_value: update.config_value })
      .eq('config_key', update.config_key)
      .select()
      .maybeSingle();

    if (error) {
      console.error(`❌ 更新 ${update.config_key} 失败:`, error.message);
      process.exit(1);
    }
    console.log(`  ✅ ${update.config_key} → ${update.config_value}`);
  }

  console.log('\n✅ 配置已更新！');
  console.log('  API端点: https://api.deepseek.com');
  console.log('  模型名称: deepseek-v4-flash');
  console.log('\n💡 正在重新测试连接...');

  // Re-run test
  const { data: configs, error } = await supabase
    .from('system_configs')
    .select('config_key, config_value')
    .in('config_key', ['ai_api_endpoint', 'ai_api_key', 'ai_model']);

  if (error) {
    console.error('❌ 读取配置失败:', error.message);
    process.exit(1);
  }

  const configMap = Object.fromEntries((configs || []).map(c => [c.config_key, c.config_value]));
  const apiEndpoint = (configMap.ai_api_endpoint || '').trim();
  const apiKey = (configMap.ai_api_key || '').trim();
  const model = (configMap.ai_model || '').trim();

  const baseUrl = apiEndpoint.replace(/\/$/, '');
  const fullUrl = `${baseUrl}/chat/completions`;

  console.log(`\n🔌 测试请求: ${fullUrl}`);
  console.log(`  模型: ${model}`);

  const startTime = Date.now();

  try {
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a connection test assistant.' },
          { role: 'user', content: 'Please reply with "Connection OK" only.' },
        ],
        temperature: 0.1,
        max_tokens: 20,
        stream: false,
      }),
    });

    const elapsed = Date.now() - startTime;
    const responseText = await response.text();

    if (!response.ok) {
      console.log(`\n❌ API调用失败 (HTTP ${response.status})`);
      console.log(`  耗时: ${elapsed}ms`);
      console.log(`  响应: ${responseText}`);
      process.exit(1);
    }

    const data = JSON.parse(responseText);
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};

    console.log(`\n✅ DeepSeek API 连接成功！`);
    console.log(`  耗时: ${elapsed}ms`);
    console.log(`  响应: ${content.trim()}`);
    console.log(`  Token: prompt=${usage.prompt_tokens}, completion=${usage.completion_tokens}, total=${usage.total_tokens}`);
    console.log(`  实际模型: ${data.model || model}`);
    console.log('\n🎉 AI 配置完全正确，可以正常使用！');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`\n❌ 连接失败: ${message}`);
    process.exit(1);
  }
}

main().catch(console.error);
