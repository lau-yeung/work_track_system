/**
 * Optimized Work Summary Generator
 * 
 * Performance optimizations for large datasets (especially yearly summaries):
 * 1. Database-level aggregation to reduce data transfer
 * 2. Text truncation and summarization before sending to AI
 * 3. Progressive summarization for yearly data (monthly rollup)
 */

export interface AggregatedEntry {
  period: string; // e.g., "2026-08" for month, "2026-08-03" for day
  total_hours: number;
  entry_count: number;
  project_count: number;
  projects: string[];
  highlights: string[]; // Truncated key points
  risks: string[]; // Aggregated risk items
  next_plans: string[]; // Aggregated next plans
}

export interface SummaryStats {
  total_hours: number;
  total_entries: number;
  period_start: string;
  period_end: string;
  active_days: number;
  avg_daily_hours: number;
  top_projects: Array<{ name: string; hours: number }>;
}

/**
 * Truncate text to max length, keeping first N chars
 */
export function truncateText(text: string | null | undefined, maxLength = 100): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Aggregate entries by period (day for week, month for year)
 */
export function aggregateEntries(
  entries: Array<{
    work_date: string;
    hours: string;
    completed_work: string | null;
    tomorrow_plan: string | null;
    coordination_matters: string | null;
    project_name: string;
  }>,
  dimension: 'week' | 'month' | 'year' | 'custom'
): { aggregated: AggregatedEntry[]; stats: SummaryStats } {
  // Determine aggregation period
  const getPeriodKey = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (dimension === 'year') {
      // Group by month
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    // For week, month, and custom, group by day
    return dateStr;
  };

  const periodMap = new Map<string, AggregatedEntry>();
  let totalHours = 0;
  const projectHours = new Map<string, number>();
  const activeDates = new Set<string>();

  for (const entry of entries) {
    const hours = parseFloat(entry.hours);
    totalHours += hours;
    activeDates.add(entry.work_date);
    projectHours.set(entry.project_name, (projectHours.get(entry.project_name) || 0) + hours);

    const periodKey = getPeriodKey(entry.work_date);

    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, {
        period: periodKey,
        total_hours: 0,
        entry_count: 0,
        project_count: 0,
        projects: [],
        highlights: [],
        risks: [],
        next_plans: [],
      });
    }

    const agg = periodMap.get(periodKey)!;
    agg.total_hours += hours;
    agg.entry_count += 1;

    if (!agg.projects.includes(entry.project_name)) {
      agg.projects.push(entry.project_name);
      agg.project_count += 1;
    }

    // Add truncated highlights
    if (entry.completed_work) {
      const truncated = truncateText(entry.completed_work, 80);
      if (truncated && !agg.highlights.includes(truncated)) {
        agg.highlights.push(truncated);
      }
    }

    // Aggregate risks (coordination_matters)
    if (entry.coordination_matters) {
      const truncated = truncateText(entry.coordination_matters, 80);
      if (truncated && !agg.risks.includes(truncated)) {
        agg.risks.push(truncated);
      }
    }

    // Aggregate next plans
    if (entry.tomorrow_plan) {
      const truncated = truncateText(entry.tomorrow_plan, 80);
      if (truncated && !agg.next_plans.includes(truncated)) {
        agg.next_plans.push(truncated);
      }
    }
  }

  // Sort and limit highlights/risks/plans to top 5 each
  for (const agg of periodMap.values()) {
    agg.highlights = agg.highlights.slice(0, 5);
    agg.risks = agg.risks.slice(0, 3);
    agg.next_plans = agg.next_plans.slice(0, 5);
  }

  // Top projects
  const topProjects = Array.from(projectHours.entries())
    .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);

  const sortedAggregated = Array.from(periodMap.values()).sort((a, b) =>
    a.period.localeCompare(b.period)
  );

  const firstDate = entries[0]?.work_date || '';
  const lastDate = entries[entries.length - 1]?.work_date || '';

  return {
    aggregated: sortedAggregated,
    stats: {
      total_hours: Math.round(totalHours * 10) / 10,
      total_entries: entries.length,
      period_start: firstDate,
      period_end: lastDate,
      active_days: activeDates.size,
      avg_daily_hours: Math.round((totalHours / Math.max(activeDates.size, 1)) * 10) / 10,
      top_projects: topProjects,
    },
  };
}

/**
 * Generate optimized AI prompt for yearly summaries
 * Uses aggregated data instead of full raw entries
 */
export function buildOptimizedPrompt(
  aggregated: AggregatedEntry[],
  stats: SummaryStats,
  dimension: 'week' | 'month' | 'year' | 'custom',
  previousSummary?: string | null
): { systemPrompt: string; userPrompt: string } {
  const dimensionLabel = dimension === 'week' ? '本周' : dimension === 'month' ? '本月' : dimension === 'year' ? '本年' : '该周期';
  const periodLabel = dimension === 'week' ? '周' : dimension === 'month' ? '月' : dimension === 'year' ? '年' : '周期';

  // Build compact overview
  const overview = aggregated
    .map((agg) => {
      const highlights = agg.highlights.map((h) => `  - ${h}`).join('\n');
      const risks = agg.risks.map((r) => `  - ${r}`).join('\n');
      const plans = agg.next_plans.map((p) => `  - ${p}`).join('\n');

      return `### ${agg.period}
- 工时: ${agg.total_hours}h | 记录: ${agg.entry_count}条 | 项目: ${agg.project_count}个
- 项目: ${agg.projects.join(', ')}
${highlights ? `- 亮点:\n${highlights}` : ''}
${risks ? `- 风险/协调:\n${risks}` : ''}
${plans ? `- 计划:\n${plans}` : ''}`;
    })
    .join('\n\n');

  const systemPrompt = `你是一个专业的工作总结助手。请根据提供的聚合工时数据，生成简洁但有洞察力的工作总结。

总结要求：
1. 语言简洁专业，重点突出，避免流水账
2. 识别趋势和变化，而不是罗列细节
3. 按以下结构输出：

## ${dimensionLabel}计划
${dimension === 'week' ? '（继承自上一周的"下周计划"，或根据整体情况推断）' : '（根据整体情况归纳）'}

## 实际完成
（归纳主要工作成果，分点列出，聚焦重要进展）

## 关键指标
- 总工时: ${stats.total_hours}h
- 活跃天数: ${stats.active_days}天
- 日均工时: ${stats.avg_daily_hours}h
- 主要项目: ${stats.top_projects.map((p) => `${p.name}(${p.hours}h)`).join('、')}

## 亮点与成果
（总结本${periodLabel}的主要成果和亮点）

## 风险与关注
（识别潜在风险和需要关注的事项）

## 下一步计划
（基于数据趋势，给出下一周期的建议计划）

4. 如果数据不足以支撑某个部分，合理填写
5. 控制在 500-800 字，重点突出`;

  const userPrompt = `请根据以下聚合工时数据生成${dimensionLabel}工作总结：

**数据概览**:
- 统计周期: ${stats.period_start} 至 ${stats.period_end}
- 总工时: ${stats.total_hours} 小时
- 记录数: ${stats.total_entries} 条
- 活跃天数: ${stats.active_days} 天
- 日均工时: ${stats.avg_daily_hours} 小时

**主要项目**:
${stats.top_projects.map((p) => `${p.name}: ${p.hours}小时`).join('\n')}

${previousSummary ? `**上周期总结中的"下周计划"**:\n${truncateText(previousSummary, 500)}\n` : ''}

**分周期明细（已聚合）**:
${overview}

请生成工作总结：`;

  return { systemPrompt, userPrompt };
}