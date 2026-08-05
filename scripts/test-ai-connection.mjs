// Quick test script for DeepSeek API connectivity
// Usage: node scripts/test-ai-connection.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local manually
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
  } catch {
    console.log('No .env.local found, using existing env vars');
  }
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.COZE_SUPABASE_URL;
  const supabaseKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 缺少 Supabase 配置 (COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY)');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Step 1: Read AI config from database
  console.log('\n📋 读取系统配置...');
  const { data: configs, error } = await supabase
    .from('system_configs')
    .select('config_key, config_value')
    .in('config_key', ['ai_provider', 'ai_api_endpoint', 'ai_api_key', 'ai_model', 'enable_ai_features']);

  if (error) {
    console.error('❌ 读取配置失败:', error.message);
    process.exit(1);
  }

  const configMap = Object.fromEntries((configs || []).map(c => [c.config_key, c.config_value]));

  const aiEnabled = configMap.enable_ai_features === 'true';
  const provider = configMap.ai_provider || 'builtin';
  const apiEndpoint = (configMap.ai_api_endpoint || '').trim();
  const apiKey = (configMap.ai_api_key || '').trim();
  const model = (configMap.ai_model || '').trim();

  console.log(`  AI功能启用: ${aiEnabled ? '✅ 是' : '❌ 否'}`);
  console.log(`  AI提供商: ${provider}`);
  console.log(`  API端点: ${apiEndpoint || '(未设置)'}`);
  console.log(`  模型名称: ${model || '(未设置)'}`);
  console.log(`  API密钥: ${apiKey ? apiKey.slice(0, 4) + '****' + apiKey.slice(-4) : '(未设置)'}`);

  if (!aiEnabled) {
    console.log('\n⚠️  AI功能未启用，请先在系统设置中开启');
    process.exit(0);
  }

  if (provider !== 'external') {
    console.log('\n⚠️  当前使用内置AI（规则引擎），无需测试API连接');
    process.exit(0);
  }

  const missing = [];
  if (!apiEndpoint) missing.push('API端点');
  if (!apiKey) missing.push('API密钥');
  if (!model) missing.push('模型名称');
  
  if (missing.length > 0) {
    console.log(`\n❌ 外部AI配置不完整，缺少: ${missing.join('、')}`);
    process.exit(1);
  }

  // Step 2: Test API connection
  const baseUrl = apiEndpoint.replace(/\/$/, '');
  const fullUrl = `${baseUrl}/chat/completions`;

  console.log(`\n🔌 正在测试 DeepSeek API 连接...`);
  console.log(`  请求地址: ${fullUrl}`);
  console.log(`  请求模型: ${model}`);

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
      } catch {}

      console.log(`\n❌ API调用失败 (HTTP ${response.status})`);
      console.log(`  耗时: ${elapsed}ms`);
      console.log(`  错误详情: ${errorDetail}`);
      
      // Provide helpful hints
      if (response.status === 401) {
        console.log('\n💡 建议: API密钥无效，请检查密钥是否正确');
      } else if (response.status === 404) {
        console.log('\n💡 建议: API端点地址可能不正确，官方文档推荐使用 https://api.deepseek.com (不带 /v1)');
        console.log('   当前端点:', apiEndpoint);
        console.log('   推荐端点: https://api.deepseek.com');
      } else if (response.status === 429) {
        console.log('\n💡 建议: 请求过于频繁，请稍后再试或检查账户余额');
      } else if (response.status === 400) {
        console.log('\n💡 建议: 请求参数错误，请检查模型名称是否正确');
        console.log('   可用模型: deepseek-v4-pro, deepseek-v4-flash, deepseek-chat');
      }
      process.exit(1);
    }

    const data = JSON.parse(responseText);
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};

    console.log(`\n✅ DeepSeek API 连接成功！`);
    console.log(`  耗时: ${elapsed}ms`);
    console.log(`  响应内容: ${content.trim()}`);
    console.log(`  Token用量: prompt=${usage.prompt_tokens || 0}, completion=${usage.completion_tokens || 0}, total=${usage.total_tokens || 0}`);
    console.log(`  模型: ${data.model || model}`);

    // Check for endpoint recommendation
    if (apiEndpoint.includes('/v1')) {
      console.log(`\n💡 提示: 检测到端点包含 /v1 路径`);
      console.log('   官方文档推荐使用 https://api.deepseek.com (不带 /v1)');
      console.log('   当前配置仍可正常工作，但建议更新为官方推荐格式');
    }

    console.log('\n🎉 配置正确，AI功能可以正常使用！');
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    console.log(`\n❌ 连接失败 (耗时 ${elapsed}ms)`);
    console.log(`  错误信息: ${message}`);
    
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      console.log('\n💡 建议: 无法连接到API服务器，请检查:');
      console.log('   1. 网络连接是否正常');
      console.log('   2. API端点地址是否正确');
      console.log('   3. 是否需要代理设置');
    } else if (message.includes('ETIMEDOUT')) {
      console.log('\n💡 建议: 连接超时，请检查网络或增加超时时间');
    }
    process.exit(1);
  }
}

main().catch(console.error);
