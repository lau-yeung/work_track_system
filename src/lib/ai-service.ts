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

  if (error || !configs) {
    console.warn('[AI-Config] 读取 system_configs 失败:', error?.message || 'no data');
    return null;
  }

  const configMap = Object.fromEntries(configs.map((c) => [c.config_key, c.config_value]));
  console.log('[AI-Config] 原始配置:', JSON.stringify({
    ai_provider: configMap.ai_provider,
    enable_ai_features: configMap.enable_ai_features,
    ai_api_endpoint: configMap.ai_api_endpoint ? '(已设置)' : '(未设置)',
    ai_api_key: configMap.ai_api_key ? '(已设置)' : '(未设置)',
    ai_model: configMap.ai_model,
  }));

  // Check if AI is enabled
  if (configMap.enable_ai_features !== 'true') {
    console.warn('[AI-Config] enable_ai_features !== "true", 当前值:', JSON.stringify(configMap.enable_ai_features));
    return null;
  }

  const cfg: AIConfig = {
    provider: (configMap.ai_provider as AIConfig['provider']) || 'builtin',
    apiEndpoint: configMap.ai_api_endpoint || undefined,
    apiKey: configMap.ai_api_key || undefined,
    model: configMap.ai_model || undefined,
  };
  console.log('[AI-Config] 解析结果:', JSON.stringify({
    provider: cfg.provider,
    apiEndpoint: cfg.apiEndpoint,
    hasApiKey: !!cfg.apiKey,
    model: cfg.model,
  }));
  return cfg;
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
    console.warn('[AI-Call] getAIConfig 返回 null，将使用内置 AI（规则引擎）');
    return callBuiltinAI(messages);
  }

  if (config.provider === 'builtin') {
    console.warn('[AI-Call] provider=builtin，使用内置 AI（规则引擎）');
    return callBuiltinAI(messages);
  }

  if (!config.apiEndpoint || !config.apiKey || !config.model) {
    console.warn('[AI-Call] 外部 AI 配置不完整:', {
      apiEndpoint: config.apiEndpoint,
      hasApiKey: !!config.apiKey,
      model: config.model,
    }, '→ 使用内置 AI 兜底');
    return callBuiltinAI(messages);
  }

  console.log('[AI-Call] 即将调用外部 AI:', {
    endpoint: config.apiEndpoint,
    model: config.model,
  });
  return callExternalAI(config, messages, options);
}

/**
 * Built-in AI: Rule-based text generation (no actual LLM calls)
 * Used as fallback when no external AI is configured
 *
 * 改进：识别月度目标 prompt 时返回 JSON 格式，让 callAIJson 能直接解析，
 * 避免落到 fallbackFactory 产生带「（规则兜底）」前缀的占位内容。
 */
async function callBuiltinAI(messages: ChatMessage[]): Promise<AIResponse> {
  const allContent = messages.map((m) => m.content).join('\n');
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const userContent = lastUserMessage?.content || '';

  let response = '';

  // ===== 月度目标拆解：从 prompt 提取目标标题，生成结构化 JSON =====
  if (allContent.includes('月度目标拆解助手') && allContent.includes('请输出 JSON')) {
    response = generateBuiltinMonthlyGoals(userContent);
  } else if (userContent.includes('工作总结') || userContent.includes('总结')) {
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

/**
 * Builtin 月度目标 JSON 生成：从 user prompt 里按 `1. xxx` / `1，xxx` / `1、xxx` 提取目标标题，
 * 基于规则为每个目标生成合理的五个字段，输出 callAIJson 可直接解析的 JSON。
 */
function generateBuiltinMonthlyGoals(userContent: string): string {
  const goals: string[] = [];
  const lines = userContent.split(/\r?\n/);
  const numberingRegex = /^\s*[0-9０-９]+[.．、，,)\）]\s*/;
  for (const line of lines) {
    let g = line.trim().replace(numberingRegex, '').trim();
    g = g.replace(/[。；;]+$/, '').trim();
    if (g && g.length > 0 && !g.includes('请输出 JSON') && !g.includes('日报数据')) {
      goals.push(g);
    }
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const midDay = Math.min(15, lastDay);

  const items = goals.map((title, i) => {
    // 简单规则：如果目标标题包含"测试"则产出偏向测试报告，包含"开发"则偏向代码
    const hasTest = /测试|验证|验收|回归/.test(title);
    const hasDev = /开发|实现|编码|编写/.test(title);
    const hasResearch = /调研|研究|探索/.test(title);

    const expected_output = hasTest
      ? `${title} 相关的测试报告 / 缺陷列表 / 质量评估`
      : hasDev
        ? `${title} 相关的代码提交 / 文档 / 版本包`
        : hasResearch
          ? `${title} 相关的调研报告 / 方案对比 / 推荐意见`
          : `${title} 的产出物与交付件`;

    const task_breakdown = `1. 需求/范围确认\n2. 方案设计与评审\n3. 执行${title}\n4. 自检与修复\n5. 交付与复盘`;

    const plannedDay = Math.min(midDay + i * 3, lastDay);
    const planned_completion_date = `${year}-${String(month).padStart(2, '0')}-${String(plannedDay).padStart(2, '0')}`;

    const acceptance_criteria = `「${title}」按计划完成，交付物评审通过，质量符合预期`;

    const risk_points = '依赖项未明确 / 进度受阻 / 资源冲突';

    return {
      expected_output,
      task_breakdown,
      planned_completion_date,
      acceptance_criteria,
      risk_points,
    };
  });

  return JSON.stringify({ items });
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

  const fullUrl = `${config.apiEndpoint}/chat/completions`;
  console.log('[AI-External] POST', fullUrl, 'model=', config.model);

  let response;
  try {
    response = await fetch(fullUrl, {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AI-External] fetch 网络异常:', msg);
    throw new Error(`AI 服务网络错误: ${msg}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    let detail = errorText;
    try {
      const errJson = JSON.parse(errorText);
      detail = errJson.message || errJson.error?.message || errorText;
    } catch {
      // 保留原文
    }
    console.error(`[AI-External] HTTP ${response.status} 调用失败:`, detail);
    // 映射为业务可读错误
    let hint = detail;
    if (response.status === 401) hint = 'API 密钥无效，请检查配置';
    else if (response.status === 403) hint = 'API 密钥被禁用或无权限';
    else if (response.status === 404) hint = 'API 端点无效或模型不存在，请检查配置';
    else if (response.status === 402) hint = 'AI 服务账户余额不足，请充值';
    else if (response.status === 429) hint = '请求过于频繁，请稍后重试';
    else if (response.status >= 500) hint = `AI 服务暂时不可用 (${response.status})，请稍后重试`;
    throw new Error(`AI 调用失败 (HTTP ${response.status}): ${hint}`);
  }

  const responseText = await response.text();
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('[AI-External] 响应不是有效 JSON:', responseText.slice(0, 200));
    throw new Error('AI 返回格式异常');
  }

  const content = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  console.log('[AI-External] 成功响应, usage:', usage.total_tokens);
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

/**
 * 期望 AI 直接以 JSON 响应，便于批量字段解析（周报/绩效/模板化总结）。
 *
 * 兜底流程：
 * 1. 先用 callAI 请求 AI；
 * 2. 对响应文本尝试 JSON.parse；
 * 3. 解析失败时走"分节解析"：按形如 `## 字段名\n内容` 的模式抽取 Object；
 * 4. 两者都失败时，若 caller 提供 fallbackFactory，则用内置规则工厂产生兜底对象；
 *    否则返回 `{}`。
 *
 * schema 目前仅用于提示，不做运行时校验（交给 zod 或由上层可选再封装）。
 */
export interface CallAIJsonResult<T> {
  data: T;
  usedExternalAI: boolean;
  raw: string;
  fallback: 'none' | 'section-parse' | 'fallback-factory';
}

export async function callAIJson<T>(
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    /** 用于兜底：当 AI 完全无响应 / 解析失败时产生默认对象 */
    fallbackFactory?: (raw: string) => T;
  } = {}
): Promise<CallAIJsonResult<T>> {
  const config = await getAIConfig();
  const usedExternalAI = !!(
    config &&
    config.provider === 'external' &&
    config.apiEndpoint &&
    config.apiKey &&
    config.model
  );

  let response: AIResponse;
  try {
    response = await callAI(messages, {
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 2000,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const fallback =
      options.fallbackFactory ? options.fallbackFactory(raw) : ({} as T);
    return { data: fallback, usedExternalAI: false, raw, fallback: 'fallback-factory' };
  }

  const raw = response.content || '';

  // 1) 优先直接 JSON.parse
  try {
    // 可能响应带 ```json ``` 包裹
    let trimmed = raw.trim();
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlock) trimmed = codeBlock[1].trim();
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      trimmed = trimmed.slice(jsonStart, jsonEnd + 1);
    }
    const data = JSON.parse(trimmed) as T;
    if (data && typeof data === 'object') {
      return { data, usedExternalAI, raw, fallback: 'none' };
    }
  } catch {
    // fall through
  }

  // 2) Markdown 分节解析：## 字段名\n内容
  try {
    const sectionMap: Record<string, string> = {};
    const sectionRegex = /^##\s*(.+?)\s*$/gm;
    let match: RegExpExecArray | null;
    let lastIndex = -1;
    let lastKey: string | null = null;
    while ((match = sectionRegex.exec(raw)) !== null) {
      if (lastKey !== null) {
        sectionMap[lastKey] = raw.slice(lastIndex, match.index).trim();
      }
      lastKey = match[1].trim();
      lastIndex = match.index + match[0].length;
    }
    if (lastKey !== null) {
      sectionMap[lastKey] = raw.slice(lastIndex).trim();
    }
    if (Object.keys(sectionMap).length > 0) {
      return {
        data: sectionMap as unknown as T,
        usedExternalAI,
        raw,
        fallback: 'section-parse',
      };
    }
  } catch {
    // fall through
  }

  // 3) 都不行 → 工厂兜底
  const fallback =
    options.fallbackFactory ? options.fallbackFactory(raw) : ({} as T);
  return { data: fallback, usedExternalAI, raw, fallback: 'fallback-factory' };
}

// =========================================================================
// 新增：模板化周期总结 / 周报实际完成 / 绩效评分 生成函数
// 全部走 callAIJson，带 fallbackFactory 兜底，确保 AI 不通时仍有可用结果。
// =========================================================================

export interface TemplateField {
  key: string;
  label: string;
}

export interface TimeEntryForAI {
  work_date: string;
  hours: string;
  completed_work: string | null;
  tomorrow_plan: string | null;
  coordination_matters: string | null;
  remarks: string | null;
  project_name: string;
  user_name: string;
}

/**
 * 按模板字段生成周期总结。
 * AI 被要求输出 JSON：{ [fieldKey]: string }，再拼装为 `## label\n内容` 的 Markdown。
 */
export async function generateTemplatedSummary(params: {
  dimension: 'week' | 'month' | 'year' | 'custom';
  startDate: string;
  endDate: string;
  entries: TimeEntryForAI[];
  templateFields: TemplateField[];
  previousSummary?: string | null;
}): Promise<WorkSummaryResult> {
  const { dimension, entries, templateFields, previousSummary } = params;
  const { aggregateEntries, buildOptimizedPrompt } = await import('./summary-optimizer');
  const { aggregated, stats } = aggregateEntries(entries, dimension);

  const dimensionLabel =
    dimension === 'week' ? '本周' : dimension === 'month' ? '本月' : dimension === 'year' ? '本年' : '该周期';

  // 复用既有优化后的数据概览作为上下文
  const { userPrompt: dataContext } = buildOptimizedPrompt(aggregated, stats, dimension, previousSummary);

  const fieldsSchema = templateFields
    .map((f) => `"${f.key}"(${f.label})`)
    .join('、');

  const systemPrompt = `你是一个专业的工作总结助手。请根据提供的工时数据，严格按指定字段输出 JSON。

输出要求：
1. 仅输出一个 JSON 对象，键为字段 key，值为该字段的总结文本（字符串）。
2. 字段列表：${fieldsSchema}
3. 每个字段内容简洁专业，可分点，但作为单一字符串值（多行用 \\n）。
4. 数据不足时合理填写，不要写"无数据"。
5. 禁止输出 JSON 以外的解释性文字。`;

  const userPrompt = `请根据以下数据生成本${dimensionLabel}（${params.startDate} 至 ${params.endDate}）工作总结，按字段输出 JSON：

${dataContext}

请输出 JSON：`;

  const fallbackFactory = (raw: string): Record<string, string> => {
    // 按字段语义从日报字段规则填充
    const joinedCompleted = entries
      .map((e) => e.completed_work)
      .filter(Boolean)
      .join('\n');
    const joinedPlans = entries
      .map((e) => e.tomorrow_plan)
      .filter(Boolean)
      .join('\n');
    const joinedCoord = entries
      .map((e) => e.coordination_matters)
      .filter(Boolean)
      .join('\n');
    const result: Record<string, string> = {};
    for (const f of templateFields) {
      const k = f.key;
      if (/plan|计划/.test(k) || /plan|计划/.test(f.label)) {
        result[k] = joinedPlans || '（暂无计划数据，规则兜底生成）';
      } else if (/done|完成|actual|实际/.test(k) || /done|完成|actual|实际/.test(f.label)) {
        result[k] = joinedCompleted || '（暂无完成数据，规则兜底生成）';
      } else if (/uncomplete|未完成|reason|原因/.test(k) || /未完成|原因/.test(f.label)) {
        result[k] = joinedCoord || '（暂无未完成原因数据）';
      } else if (/next|下周|下期/.test(k) || /next|下周|下期/.test(f.label)) {
        result[k] = joinedPlans || '（暂无下周计划数据）';
      } else if (/output|产物|产出/.test(k) || /产物|产出/.test(f.label)) {
        // 关键字提取
        const artifactLines = entries
          .flatMap((e) => [e.completed_work, e.tomorrow_plan, e.remarks || ''])
          .filter((t) => t && /产出|文档|版本|交付|demo|上线/i.test(t));
        result[k] = artifactLines.join('\n') || '（暂无明显产物数据）';
      } else {
        result[k] = `（${f.label}：规则兜底，原始返回 ${raw.length} 字符）`;
      }
    }
    return result;
  };

  const result = await callAIJson<Record<string, string>>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: 0.3,
      maxTokens: 2500,
      fallbackFactory,
    }
  );

  // 拼装为带 ## label 的 Markdown
  const content = templateFields
    .map((f) => {
      const val = result.data[f.key];
      return `## ${f.label}\n${val && val.trim() ? val.trim() : '（暂无）'}`;
    })
    .join('\n\n');

  return {
    content,
    usedExternalAI: result.usedExternalAI,
  };
}

/**
 * 周报「实际完成」AI 生成：基于本周日报，产出 actualCompleted / uncompletedReason / outputArtifacts。
 */
export interface WeeklyReportAIResult {
  actualCompleted: string;
  uncompletedReason: string;
  outputArtifacts: string;
  usedExternalAI: boolean;
}

interface WeeklyReportAIJson {
  actualCompleted: string;
  uncompletedReason: string;
  outputArtifacts: string;
}

export async function generateWeeklyReport(params: {
  weekStart: string;
  weekEnd: string;
  entries: TimeEntryForAI[];
  thisWeekPlan?: Array<{ id: string; text: string; done: boolean }>;
}): Promise<WeeklyReportAIResult> {
  const { weekStart, weekEnd, entries, thisWeekPlan } = params;

  const entryDigest = entries
    .map(
      (e) =>
        `- ${e.work_date} | ${e.project_name} | ${e.hours}h | 完成: ${e.completed_work || '-'} | 明日计划: ${e.tomorrow_plan || '-'} | 协调: ${e.coordination_matters || '-'}`
    )
    .join('\n');

  const planDigest = thisWeekPlan && thisWeekPlan.length > 0
    ? thisWeekPlan.map((p) => `  - [${p.done ? 'x' : ' '}] ${p.text}`).join('\n')
    : '（暂无本周计划）';

  const systemPrompt = `你是项目周报撰写助手。请根据本周日报数据，生成本周周报的三个字段，输出 JSON。

输出 JSON 格式（键名固定）：
{
  "actualCompleted": "实际完成的工作，分点列出，聚焦成果",
  "uncompletedReason": "未完成项及原因，若全部完成可写'本周计划均已达成'",
  "outputArtifacts": "本周输出产物（代码/文档/版本/交付件），无则写'暂无'"
}

要求：
1. 仅输出 JSON，禁止额外解释。
2. 内容基于日报 completed_work 归纳，不要编造。
3. 未完成原因结合 tomorrow_plan 与本周计划 done 状态推断。`;

  const userPrompt = `本周周期：${weekStart} 至 ${weekEnd}

本周计划：
${planDigest}

本周日报数据：
${entryDigest || '（本周暂无日报）'}

请生成 JSON：`;

  const fallbackFactory = (): WeeklyReportAIJson => {
    const completed = entries
      .map((e) => e.completed_work)
      .filter(Boolean)
      .join('\n');
    const plans = entries
      .map((e) => e.tomorrow_plan)
      .filter(Boolean)
      .join('\n');
    const artifactLines = entries
      .flatMap((e) => [e.completed_work, e.tomorrow_plan])
      .filter((t) => t && /产出|文档|版本|交付|demo|上线/i.test(t));
    const undone = thisWeekPlan && thisWeekPlan.some((p) => !p.done)
      ? thisWeekPlan.filter((p) => !p.done).map((p) => p.text).join('、')
      : '本周计划均已达成';
    return {
      actualCompleted: completed || '（本周暂无日报完成数据，规则兜底）',
      uncompletedReason: undone,
      outputArtifacts: artifactLines.join('\n') || '暂无',
    };
  };

  const result = await callAIJson<WeeklyReportAIJson>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: 0.3,
      maxTokens: 2000,
      fallbackFactory,
    }
  );

  return {
    actualCompleted: result.data.actualCompleted || '',
    uncompletedReason: result.data.uncompletedReason || '',
    outputArtifacts: result.data.outputArtifacts || '',
    usedExternalAI: result.usedExternalAI,
  };
}

/**
 * 绩效评分 AI 生成：基于本月周报「实际完成」与工时，输出五维评分 + 任务项 + 说明。
 * total_score 由后端按权重统一计算，AI 不负责。
 */
export interface PerformanceAIResult {
  monthlyTasks: string;
  scoreExplanation: string;
  completion: number; // 0-100
  quality: number;
  progress: number;
  collaboration: number;
  discipline: number;
  usedExternalAI: boolean;
}

interface PerformanceAIJson {
  monthlyTasks: string;
  scoreExplanation: string;
  completion: number;
  quality: number;
  progress: number;
  collaboration: number;
  discipline: number;
}

export async function generatePerformanceScore(params: {
  year: number;
  month: number;
  userName: string;
  weeklyActuals: Array<{ weekIndex: number; actualCompleted: string }>;
  workHours: number;
  activeDays: number;
  goalSummary?: { goals: string; expectedOutput: string } | null;
}): Promise<PerformanceAIResult> {
  const { year, month, userName, weeklyActuals, workHours, activeDays, goalSummary } = params;

  const weeklyDigest = weeklyActuals
    .map((w) => `### 第${w.weekIndex}周\n${w.actualCompleted || '（暂无）'}`)
    .join('\n\n');

  const goalDigest = goalSummary
    ? `月度目标：${goalSummary.goals || '（未录入）'}\n预期产出：${goalSummary.expectedOutput || '（未录入）'}`
    : '（本月未录入月度目标）';

  const systemPrompt = `你是绩效评估助手。请根据员工本月周报「实际完成」内容与工时，给出五维评分与任务项归纳，输出 JSON。

评分维度（每项 0-100 分）：
- completion 完成度（35%）：本月目标/计划的实际达成程度
- quality 质量（30%）：交付物的质量与规范度
- progress 进度（20%）：推进节奏与里程碑达成
- collaboration 协作（10%）：协调事项、配合度
- discipline 纪律（5%）：日报填写规范、出勤

输出 JSON（键名固定）：
{
  "monthlyTasks": "月度实际完成任务项归纳，分点列出（来自周报实际完成）",
  "scoreExplanation": "得分说明，简述各维度评分依据",
  "completion": 数字,
  "quality": 数字,
  "progress": 数字,
  "collaboration": 数字,
  "discipline": 数字
}

要求：
1. 仅输出 JSON。
2. 评分须基于实际数据，不要一律给满分或中位。
3. 月度任务项必须来自周报实际完成内容，不要编造。`;

  const userPrompt = `员工：${userName} ｜ 月份：${year}年${month}月

${goalDigest}

工时统计：${workHours} 小时 ｜ 活跃天数：${activeDays} 天

本月各周实际完成：
${weeklyDigest || '（本月暂无周报数据）'}

请生成 JSON：`;

  const fallbackFactory = (): PerformanceAIJson => {
    const tasks = weeklyActuals
      .map((w) => w.actualCompleted)
      .filter(Boolean)
      .join('\n');
    // 规则估算：完成度按是否有实际完成内容估，其余取保守中位
    const hasContent = tasks.trim().length > 0;
    const completion = hasContent ? 78 : 60;
    return {
      monthlyTasks: tasks || '（本月暂无周报实际完成数据，规则兜底）',
      scoreExplanation: 'AI 不可用，按规则兜底估算：完成度依据是否有实际完成内容，质量/进度取保守中位，协作/纪律取默认值。',
      completion,
      quality: 80,
      progress: 78,
      collaboration: 82,
      discipline: 88,
    };
  };

  const result = await callAIJson<PerformanceAIJson>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: 0.2,
      maxTokens: 2000,
      fallbackFactory,
    }
  );

  // 数值收窄与兜底
  const clamp = (n: unknown): number => {
    const num = typeof n === 'number' ? n : typeof n === 'string' ? parseFloat(n) : NaN;
    if (Number.isNaN(num)) return 75;
    return Math.max(0, Math.min(100, Math.round(num * 10) / 10));
  };

  return {
    monthlyTasks: result.data.monthlyTasks || '',
    scoreExplanation: result.data.scoreExplanation || '',
    completion: clamp(result.data.completion),
    quality: clamp(result.data.quality),
    progress: clamp(result.data.progress),
    collaboration: clamp(result.data.collaboration),
    discipline: clamp(result.data.discipline),
    usedExternalAI: result.usedExternalAI,
  };
}

/**
 * 按权重计算绩效总分（后端统一计算，不信任 AI 给的总分）。
 */
export function calculateTotalScore(scores: {
  completion: number;
  quality: number;
  progress: number;
  collaboration: number;
  discipline: number;
}): number {
  const total =
    scores.completion * 0.35 +
    scores.quality * 0.3 +
    scores.progress * 0.2 +
    scores.collaboration * 0.1 +
    scores.discipline * 0.05;
  return Math.round(total * 10) / 10;
}

// =========================================================================
// 月度目标 AI 一键生成：根据目标标题 + 上月日报内容，生成预期产出/任务拆解/
// 计划完成时间/验收标准/风险点五个字段。
// 为什么参考上月：月度目标在月初录入，本月尚未开始，上月日报反映了最近的
// 工作节奏、项目状态与风险因素，AI 据此推断更合理。
// =========================================================================

export interface MonthlyGoalAIItem {
  goals: string;
  expected_output: string;
  task_breakdown: string;
  planned_completion_date: string;
  acceptance_criteria: string;
  risk_points: string;
}

export interface MonthlyGoalAIResult {
  items: MonthlyGoalAIItem[];
  usedExternalAI: boolean;
  /** 'none' = AI 正常返回; 'section-parse' = 分节解析; 'fallback-factory' = 走兜底工厂 */
  fallback?: 'none' | 'section-parse' | 'fallback-factory';
}

interface MonthlyGoalAIJsonItem {
  expected_output: string;
  task_breakdown: string;
  planned_completion_date: string;
  acceptance_criteria: string;
  risk_points: string;
}

interface MonthlyGoalAIJson {
  items: MonthlyGoalAIJsonItem[];
}

/**
 * 根据月度目标标题与上月日报内容，AI 一键生成每个目标的五个详细字段。
 *
 * -上月日报数据会作为上下文注入 prompt，AI 据此推断产出/任务/风险等。
 * -planned_completion_date 要求 AI 输出 YYYY-MM-DD 格式，落在目标月份内。
 * -AI 不可用时走 fallbackFactory：按目标标题生成占位内容，确保不阻断流程。
 */
export async function generateMonthlyGoalDetails(params: {
  year: number;
  month: number;
  goals: string[];
  /** 上月日报数据（已聚合为简要文本），用于让 AI 参考 */
  dailyReportDigest?: string;
  /** 单字段模式：只生成指定字段 */
  field?: 'expected_output' | 'task_breakdown' | 'planned_completion_date' | 'acceptance_criteria' | 'risk_points';
}): Promise<MonthlyGoalAIResult> {
  const { year, month, goals, dailyReportDigest, field } = params;

  const goalsList = goals
    .map((g, i) => `${i + 1}. ${g}`)
    .join('\n');

  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const monthLabel = `${year}年${month}月`;
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  const fieldDescriptions: Record<string, string> = {
    expected_output: '预期产出（代码/文档/版本/交付物），分点列出',
    task_breakdown: '计划任务拆解，分步骤列出（建议 3-6 步）',
    planned_completion_date: `计划完成日期，格式 YYYY-MM-DD，必须落在 ${monthLabel} 内（1-${lastDayOfMonth} 日）`,
    acceptance_criteria: '验收标准，明确什么叫完成，可量化',
    risk_points: '风险点：哪里可能卡住、依赖、阻塞项',
  };

  // 单字段模式：prompt 简化，只要求生成一个字段
  if (field) {
    const singleSystemPrompt = `你是项目月度目标拆解助手。请根据用户提供的目标标题，结合上月日报内容，仅生成「${field}」字段。

输出 JSON 格式：
{
  "items": [
    { "${field}": "${fieldDescriptions[field]}" }
  ]
}

要求：
1. items 数组顺序与输入目标顺序一致。
2. 仅输出 JSON，禁止额外解释文字。
3. 基于上月日报反映的工作节奏与项目状态推断，不要凭空编造。
4. ${field === 'planned_completion_date' ? `必须是 ${monthLabel} 内的有效日期（YYYY-MM-DD）。${isCurrentMonth ? `今天是 ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}，请合理排期。` : ''}` : '内容具体、可执行。'}
5. 若上月日报数据不足，基于目标标题合理推断。`;

    const singleUserPrompt = `请为以下 ${goals.length} 个月度目标仅生成「${field}」字段：

${goalsList}

${dailyReportDigest ? `上月日报数据（供参考）：\n${dailyReportDigest}` : '（暂无上月日报数据，请基于目标标题合理推断）'}

请输出 JSON：`;

    const singleFallbackFactory = (): MonthlyGoalAIJson => {
      const midDay = Math.min(15, lastDayOfMonth);
      const fallbackValues: Record<string, string> = {
        expected_output: goals.map((g) => `${g} 相关交付物`).join('；'),
        task_breakdown: '1. 需求/范围确认\n2. 方案设计与评审\n3. 开发/测试执行\n4. 验收与复盘',
        planned_completion_date: `${year}-${String(month).padStart(2, '0')}-${String(midDay).padStart(2, '0')}`,
        acceptance_criteria: goals.map((g) => `「${g}」按计划完成并通过评审`).join('；'),
        risk_points: '依赖未明确/资源冲突/进度风险',
      };
      return {
        items: goals.map(() => ({ [field]: fallbackValues[field] } as unknown as MonthlyGoalAIJsonItem)),
      };
    };

    const singleResult = await callAIJson<MonthlyGoalAIJson>(
      [
        { role: 'system', content: singleSystemPrompt },
        { role: 'user', content: singleUserPrompt },
      ],
      {
        temperature: 0.3,
        maxTokens: 1500,
        fallbackFactory: singleFallbackFactory,
      }
    );

    const aiItems = Array.isArray(singleResult.data.items) ? singleResult.data.items : [];
    const items: MonthlyGoalAIItem[] = goals.map((g, i) => {
      const ai = aiItems[i] || {};
      return {
        goals: g,
        expected_output: field === 'expected_output' ? (typeof ai[field] === 'string' ? ai[field] : '') : '',
        task_breakdown: field === 'task_breakdown' ? (typeof ai[field] === 'string' ? ai[field] : '') : '',
        planned_completion_date: field === 'planned_completion_date' ? normalizeDate(ai[field], year, month, lastDayOfMonth) : '',
        acceptance_criteria: field === 'acceptance_criteria' ? (typeof ai[field] === 'string' ? ai[field] : '') : '',
        risk_points: field === 'risk_points' ? (typeof ai[field] === 'string' ? ai[field] : '') : '',
      };
    });

    return {
      items,
      usedExternalAI: singleResult.usedExternalAI,
      fallback: singleResult.fallback,
    };
  }

  // 全字段模式（原有逻辑）
  const systemPrompt = `你是项目月度目标拆解助手。请根据用户提供的月度目标标题，结合上月日报内容，为每个目标生成五个字段，输出 JSON。

输出 JSON 格式（键名固定）：
{
  "items": [
    {
      "expected_output": "${fieldDescriptions.expected_output}",
      "task_breakdown": "${fieldDescriptions.task_breakdown}",
      "planned_completion_date": "${fieldDescriptions.planned_completion_date}",
      "acceptance_criteria": "${fieldDescriptions.acceptance_criteria}",
      "risk_points": "${fieldDescriptions.risk_points}"
    }
  ]
}

要求：
1. items 数组顺序与输入目标顺序一一对应，数量必须一致。
2. 仅输出 JSON，禁止额外解释文字。
3. 预期产出/任务拆解/验收标准/风险点都基于上月日报反映的工作节奏与项目状态推断，不要凭空编造。
4. planned_completion_date 必须是 ${monthLabel} 内的有效日期（YYYY-MM-DD）。${isCurrentMonth ? `今天是 ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}，请结合当前日期合理排期。` : ''}
5. 若上月日报数据不足，可基于目标标题合理推断，但要标注「参考数据不足，请人工校对」。`;

  const userPrompt = `请为以下 ${goals.length} 个月度目标生成详细字段：

${goalsList}

${dailyReportDigest ? `上月日报数据（供参考）：\n${dailyReportDigest}` : '（暂无上月日报数据，请基于目标标题合理推断）'}

请输出 JSON：`;

  const fallbackFactory = (): MonthlyGoalAIJson => {
    const midDay = Math.min(15, lastDayOfMonth);
    return {
      items: goals.map((g) => ({
        expected_output: `${g} 相关交付物：版本包/测试报告/文档`,
        task_breakdown: `1. 需求/范围确认\n2. 方案设计与评审\n3. 开发/测试执行\n4. 验收与复盘`,
        planned_completion_date: `${year}-${String(month).padStart(2, '0')}-${String(midDay).padStart(2, '0')}`,
        acceptance_criteria: `「${g}」按计划完成并通过评审，产物可交付`,
        risk_points: '依赖未明确/资源冲突/进度风险',
      })),
    };
  };

  const result = await callAIJson<MonthlyGoalAIJson>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: 0.3,
      maxTokens: 3000,
      fallbackFactory,
    }
  );

  // 归一化：保证 items 数量与 goals 一致，缺失字段补空字符串
  const aiItems = Array.isArray(result.data.items) ? result.data.items : [];
  const items: MonthlyGoalAIItem[] = goals.map((g, i) => {
    const ai = aiItems[i] || {};
    return {
      goals: g,
      expected_output: typeof ai.expected_output === 'string' ? ai.expected_output : '',
      task_breakdown: typeof ai.task_breakdown === 'string' ? ai.task_breakdown : '',
      planned_completion_date: normalizeDate(ai.planned_completion_date, year, month, lastDayOfMonth),
      acceptance_criteria: typeof ai.acceptance_criteria === 'string' ? ai.acceptance_criteria : '',
      risk_points: typeof ai.risk_points === 'string' ? ai.risk_points : '',
    };
  });

  return {
    items,
    usedExternalAI: result.usedExternalAI,
    fallback: result.fallback,
  };
}

/**
 * 将 AI 返回的日期字符串归一化为 YYYY-MM-DD，并校验落在目标月份内。
 * 不合法时回退到月份中旬。
 */
function normalizeDate(
  raw: unknown,
  year: number,
  month: number,
  lastDayOfMonth: number
): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    // 回退到月份中旬
    const mid = Math.min(15, lastDayOfMonth);
    return `${year}-${String(month).padStart(2, '0')}-${String(mid).padStart(2, '0')}`;
  }
  const s = raw.trim();
  // 支持 YYYY-MM-DD / YYYY/MM/DD
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    // 校验：年份与月份匹配目标月份
    if (y === year && mo === month && d >= 1 && d <= lastDayOfMonth) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // 日期不在目标月份内，强制归一到目标月份中旬
  }
  const mid = Math.min(15, lastDayOfMonth);
  return `${year}-${String(month).padStart(2, '0')}-${String(mid).padStart(2, '0')}`;
}