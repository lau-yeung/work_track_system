import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import { getMonthWeeks } from '@/lib/week-utils';

export interface PlanItem {
  id: string;
  text: string;
  done: boolean;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `item-${Date.now()}-${idCounter}`;
}

/**
 * 将文本拆分为计划项。按换行/分号/中文分号切分，去空。
 */
export function splitToPlanItems(text: string | null | undefined): PlanItem[] {
  if (!text || !text.trim()) return [];
  const parts = text
    .split(/[\n;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // 去重
  const seen = new Set<string>();
  const items: PlanItem[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    items.push({ id: newId(), text: p, done: false });
  }
  return items;
}

/**
 * POST /api/weekly-reports/init
 * body: { year, month, weekIndex?, userId? }
 * 初始化指定周（或该月所有周）的周报记录，自动填充 this_week_plan：
 *  - 第1周：来自月度目标（goals + task_breakdown）
 *  - 第2周起：来自上一周的 next_week_plan（done 重置为 false）
 * 已存在的记录不覆盖其 this_week_plan（除非为空）。
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { year, month, weekIndex } = body as {
      year?: number;
      month?: number;
      weekIndex?: number;
      userId?: number;
    };

    if (!year || !month) {
      return NextResponse.json({ error: '年月必填' }, { status: 400 });
    }
    if (currentUser.role !== 'admin' && body.userId && body.userId !== currentUser.id) {
      return NextResponse.json({ error: '无权为他人生成' }, { status: 403 });
    }
    const targetUserId =
      currentUser.role === 'admin' && body.userId ? Number(body.userId) : currentUser.id;

    const client = getSupabaseClient();

    // 必须先由管理员设置本月工作期才生成周报
    const { data: cfg } = await client
      .from('month_work_config')
      .select('work_start, work_end')
      .eq('period_year', year)
      .eq('period_month', month)
      .maybeSingle();
    if (!cfg?.work_start || !cfg?.work_end) {
      return NextResponse.json(
        { error: '管理员未设置本月工作期，无法生成周报。请管理员先在周报汇总页设置工作起止日期。', code: 'NO_WORK_PERIOD' },
        { status: 409 }
      );
    }
    const weeks = getMonthWeeks(year, month, { workStart: cfg.work_start, workEnd: cfg.work_end });
    const targetWeeks = weekIndex
      ? weeks.filter((w) => w.weekIndex === weekIndex)
      : weeks;

    if (targetWeeks.length === 0) {
      return NextResponse.json({ error: '指定的周不存在' }, { status: 400 });
    }

    // 取本月月度目标（用于第1周及兜底）；每月可有多条目标
    const { data: goalRows } = await client
      .from('monthly_goals')
      .select('goals, task_breakdown, expected_output')
      .eq('user_id', targetUserId)
      .eq('period_year', year)
      .eq('period_month', month)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    const goals = goalRows || [];

    // 查询该月该用户已有周报
    const { data: existing } = await client
      .from('weekly_reports')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('period_year', year)
      .eq('period_month', month);
    const existingMap = new Map<number, Record<string, unknown>>();
    for (const r of existing || []) {
      existingMap.set(r.week_index, r);
    }

    const results: Record<string, unknown>[] = [];

    for (const w of targetWeeks) {
      const existingReport = existingMap.get(w.weekIndex) as
        | (Record<string, unknown> & { this_week_plan?: PlanItem[] })
        | undefined;

      let plan: PlanItem[] = [];

      if (existingReport && Array.isArray(existingReport.this_week_plan) && existingReport.this_week_plan.length > 0) {
        // 已有计划，保留
        plan = existingReport.this_week_plan as PlanItem[];
      } else if (w.weekIndex === 1) {
        // 第1周：来自本月全部月度目标（每条目标 + 其任务拆解）
        const goalItems = goals.flatMap((g: { goals: string }) => splitToPlanItems(g.goals));
        const taskItems = goals.flatMap((g: { task_breakdown: string | null }) =>
          splitToPlanItems(g.task_breakdown)
        );
        plan = [...goalItems, ...taskItems];
        // 若月度目标为空，给一个空数组（用户手动添加）
      } else {
        // 第2周起：来自上一周 next_week_plan
        const prevReport = existingMap.get(w.weekIndex - 1) as
          | (Record<string, unknown> & { next_week_plan?: PlanItem[] })
          | undefined;
        if (prevReport && Array.isArray(prevReport.next_week_plan)) {
          plan = (prevReport.next_week_plan as PlanItem[]).map((p) => ({
            id: newId(),
            text: p.text,
            done: false, // 新周重置
          }));
        }
      }

      const record = {
        user_id: targetUserId,
        period_year: year,
        period_month: month,
        week_index: w.weekIndex,
        week_start: w.weekStart,
        week_end: w.weekEnd,
        this_week_plan: plan,
        next_week_plan: existingReport?.next_week_plan ?? [],
        actual_completed: existingReport?.actual_completed ?? null,
        uncompleted_reason: existingReport?.uncompleted_reason ?? null,
        output_artifacts: existingReport?.output_artifacts ?? null,
      };

      if (existingReport) {
        // 仅当 this_week_plan 为空时补计划，其余字段不动
        const updates: Record<string, unknown> = {};
        if (
          (!Array.isArray(existingReport.this_week_plan) ||
            (existingReport.this_week_plan as PlanItem[]).length === 0) &&
          plan.length > 0
        ) {
          updates.this_week_plan = plan;
        }
        if (Object.keys(updates).length > 0) {
          const { data, error } = await client
            .from('weekly_reports')
            .update(updates)
            .eq('id', existingReport.id as number)
            .select('*, users(id, real_name, username)')
            .single();
          if (error) throw new Error(`更新失败: ${error.message}`);
          results.push(data as Record<string, unknown>);
        } else {
          results.push(existingReport);
        }
      } else {
        const { data, error } = await client
          .from('weekly_reports')
          .insert(record)
          .select('*, users(id, real_name, username)')
          .single();
        if (error) {
          // 可能并发已创建，忽略唯一冲突
          if (error.code === '23505') {
            const { data: refetch } = await client
              .from('weekly_reports')
              .select('*, users(id, real_name, username)')
              .eq('user_id', targetUserId)
              .eq('period_year', year)
              .eq('period_month', month)
              .eq('week_index', w.weekIndex)
              .maybeSingle();
            if (refetch) results.push(refetch as Record<string, unknown>);
          } else {
            throw new Error(`创建失败: ${error.message}`);
          }
        } else {
          results.push(data as Record<string, unknown>);
        }
      }
    }

    return NextResponse.json({ data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : '初始化失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
