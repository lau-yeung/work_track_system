/**
 * AI Service Layer
 * Supports both built-in rule-based AI and external AI APIs (OpenAI-compatible, e.g., DeepSeek).
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface AIConfig {
  provider: 'builtin' | 'external';
  apiEndpoint?: string;
  apiKey?: string;
  model?: string;
}

export interface AIStatus {
  enabled: boolean;
  provider: 'builtin' | 'external';
  isConfigured: boolean;
  configComplete: boolean;
  message: string;
  endpoint?: string;
  model?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Fetch AI configuration from database
 */
export async function getAIConfig(): Promise<AIConfig | null> {
  const client = getSupabaseClient();
  const { data: configs, error } = await client
    .from('system_configs')
    .select('config_key, config_value')
    .in('config_key', ['ai_provider', 'ai_api_endpoint', 'ai_api_key', 'ai_model', 'enable_ai_features']);

  if (error || !configs) return null;

  const configMap = Object.fromEntries(configs.map((c) => [c.config_key, c.config_value]));

  // Check if AI is enabled
  if (configMap.enable_ai_features !== 'true') return null;

  return {
    provider: (configMap.ai_provider as AIConfig['provider']) || 'builtin',
    apiEndpoint: configMap.ai_api_endpoint || undefined,
    apiKey: configMap.ai_api_key || undefined,
    model: configMap.ai_model || undefined,
  };
}

/**
 * Get AI configuration status for frontend display
 */
export async function getAIStatus(): Promise<AIStatus> {
  const client = getSupabaseClient();
  const { data: configs, error } = await client
    .from('system_configs')
    .select('config_key, config_value')
    .in('config_key', ['ai_provider', 'ai_api_endpoint', 'ai_api_key', 'ai_model', 'enable_ai_features']);

  if (error || !configs) {
    return {
      enabled: false,
      provider: 'builtin',
      isConfigured: false,
      configComplete: false,
      message: '无法读取AI配置',
    };
  }

  const configMap = Object.fromEntries(configs.map((c) => [c.config_key, c.config_value]));
  const enabled = configMap.enable_ai_features === 'true';
  const provider = (configMap.ai_provider as 'builtin' | 'external') || 'builtin';
  const endpoint = (configMap.ai_api_endpoint || '').trim();
  const apiKey = (configMap.ai_api_key || '').trim();
  const model = (configMap.ai_model || '').trim();

  if (!enabled) {
    return {
      enabled: false,
      provider,
      isConfigured: false,
      configComplete: false,
      message: 'AI功能未启用，当前将使用默认模板生成总结',
    };
  }

  if (provider === 'builtin') {
    return {
      enabled: true,
      provider,
      isConfigured: true,
      configComplete: true,
      message: '使用内置AI（规则引擎）生成总结',
    };
  }

  const configComplete = !!(endpoint && apiKey && model);

  if (!configComplete) {
    const missing: string[] = [];
    if (!endpoint) missing.push('API端点');
    if (!apiKey) missing.push('API密钥');
    if (!model) missing.push('模型名称');
    return {
      enabled: true,
      provider,
      isConfigured: false,
      configComplete: false,
      message: `外部AI配置不完整，缺少: ${missing.join('、')}。当前将使用默认模板生成总结`,
      endpoint: endpoint || undefined,
      model: model || undefined,
    };
  }

  return {
    enabled: true,
    provider,
    isConfigured: true,
    configComplete: true,
    message: '外部AI已配置，可使用智能分析',
    endpoint,
    model,
  };
}

/**
 * Call AI chat completion API
 * For external AI, uses OpenAI-compatible API format
 * Falls back to builtin AI when external AI is not configured
 */
export async function callAI(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<AIResponse> {
  const config = await getAIConfig();
  
  if (!config) {
    // AI not enabled or not configured, fall back to builtin
    return callBuiltinAI(messages);
  }

  if (config.provider === 'builtin') {
    return callBuiltinAI(messages);
  }

  if (!config.apiEndpoint || !config.apiKey || !config.model) {
    // External AI config incomplete, fall back to builtin
    return callBuiltinAI(messages);
  }

  return callExternalAI(config, messages, options);
}

/**
 * Built-in AI: Rule-based text generation (no actual LLM calls)
 * Used as fallback when no external AI is configured
 */
async function callBuiltinAI(messages: ChatMessage[]): Promise<AIResponse> {
  // Find the last user message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const userContent = lastUserMessage?.content || '';

  // Simple rule-based response for work summaries
  // In real scenarios, this would be replaced by actual LLM logic
  let response = '';

  if (userContent.includes('工作总结') || userContent.includes('总结')) {
    response = generateBuiltinSummary(userContent);
  } else if (userContent.includes('分析') || userContent.includes('风险')) {
    response = generateBuiltinAnalysis(userContent);
  } else {
    response = '内置AI暂不支持此类问题的回答。如需更智能的分析，请配置外部AI服务（如DeepSeek）。';
  }

  return {
    content: response,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

function generateBuiltinSummary(input: string): string {
  // Extract context from the input (this is a placeholder)
  // The actual summary is generated from structured data passed in the prompt
  return `基于提供的数据，以下是工作总结：

## 工作概览
根据日报数据分析，本周/本月工作进展正常。

## 主要完成内容
- 完成了既定任务目标
- 项目进度符合预期

## 下一步计划
- 继续推进项目进度
- 关注潜在风险点

## 风险提示
- 暂无明显风险

---
注：此为内置AI生成的模板化总结。如需更详细和智能的分析，请配置外部AI服务。`;
}

function generateBuiltinAnalysis(input: string): string {
  return `基于规则分析结果：

1. **进度评估**：项目进度符合预期
2. **资源使用**：工时投入在正常范围内
3. **风险等级**：低风险

建议：
- 保持当前工作节奏
- 定期关注关键指标变化

---
注：此为内置AI生成的模板化分析。如需更详细和智能的分析，请配置外部AI服务。`;
}

/**
 * External AI: Call OpenAI-compatible API (DeepSeek, etc.)
 */
async function callExternalAI(
  config: AIConfig,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<AIResponse> {
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? 4096;

  const response = await fetch(`${config.apiEndpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API调用失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  return {
    content,
    usage: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
  };
}

export interface WorkSummaryResult {
  content: string;
  usedExternalAI: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Generate work summary based on daily reports
 * Optimized for large datasets: uses aggregation to reduce prompt size
 */
export async function generateWorkSummary(params: {
  dimension: 'week' | 'month' | 'year' | 'custom';
  startDate: string;
  endDate: string;
  userId?: number;
  projectId?: number;
  entries: Array<{
    work_date: string;
    hours: string;
    completed_work: string | null;
    tomorrow_plan: string | null;
    coordination_matters: string | null;
    project_name: string;
    user_name: string;
  }>;
  previousSummary?: string | null;
}): Promise<WorkSummaryResult> {
  const { dimension, entries, previousSummary } = params;

  // Import the optimizer
  const { aggregateEntries, buildOptimizedPrompt } = await import('./summary-optimizer');

  // Step 1: Aggregate entries (reduce data size by 60-80%)
  const { aggregated, stats } = aggregateEntries(entries, dimension);

  // Step 2: Build optimized prompts with compact data
  const { systemPrompt, userPrompt } = buildOptimizedPrompt(
    aggregated,
    stats,
    dimension,
    previousSummary
  );

  // Step 3: Call AI with optimized prompts
  const config = await getAIConfig();
  const usedExternalAI = !!(config && config.provider === 'external' && config.apiEndpoint && config.apiKey && config.model);
  
  const response = await callAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  return {
    content: response.content,
    usedExternalAI,
    usage: response.usage,
  };
}