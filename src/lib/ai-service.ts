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