import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import { withSchemaCacheRetry } from '@/lib/schema-cache';

export interface MonthlyGoal {
  id: number;
  user_id: number;
  period_year: number;
  period_month: number;
  goals: string;
  expected_output: string | null;
  task_breakdown: string | null;
  planned_completion_date: string | null;
  acceptance_criteria: string | null;
  risk_points: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  users?: { id: number; real_name: string; username: string };
}

/**
 * GET /api/monthly-goals?year=&month=&userId=
 * 普通用户仅看本人；admin 可传 userId 看指定人，不传看全员。
 */
export async function GET(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined;
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : undefined;
    const userId = searchParams.get('userId') ? parseInt(searchParams.get('userId')!) : undefined;

    const client = getSupabaseClient();

    const data = await withSchemaCacheRetry(async () => {
      let q = client
        .from('monthly_goals')
        .select('*, users(id, real_name, username)')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });
      if (year) q = q.eq('period_year', year);
      if (month) q = q.eq('period_month', month);
      if (currentUser.role === 'user' || currentUser.role === 'pm') {
        q = q.eq('user_id', currentUser.id);
      } else if (userId) {
        q = q.eq('user_id', userId);
      }
      const res = await q;
      if (res.error) throw res.error;
      return res.data || [];
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/monthly-goals
 * 支持批量录入：body { year, month, items: GoalItem[] }
 * 也兼容旧单条格式 { year, month, goals, ... }（自动包装为 1 条）。
 * 每月允许多条目标，故全部为 insert。
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { year, month } = body as { year?: number; month?: number };

    if (!year || !month) {
      return NextResponse.json({ error: '年、月为必填' }, { status: 400 });
    }
    if (month < 1 || month > 12) {
      return NextResponse.json({ error: '月份非法' }, { status: 400 });
    }

    // 普通用户只能为自己录入；admin 可指定 userId
    const targetUserId =
      currentUser.role === 'admin' && body.userId ? Number(body.userId) : currentUser.id;

    // 归一化 items：支持批量数组或旧单条格式
    const rawItems: unknown[] = Array.isArray(body.items)
      ? body.items
      : [body];
    const items = rawItems
      .map((it) => {
        const o = (it || {}) as Record<string, unknown>;
        return {
          goals: typeof o.goals === 'string' ? o.goals.trim() : '',
          expected_output: (o.expected_output as string) || null,
          task_breakdown: (o.task_breakdown as string) || null,
          planned_completion_date: (o.planned_completion_date as string) || null,
          acceptance_criteria: (o.acceptance_criteria as string) || null,
          risk_points: (o.risk_points as string) || null,
        };
      })
      .filter((it) => it.goals !== '');

    if (items.length === 0) {
      return NextResponse.json({ error: '至少需要一条有效的月度目标（目标内容不能为空）' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 取当前 user+year+month 下最大 sort_order，新条目依次递增（优先级在后）
    const { data: maxRow } = await client
      .from('monthly_goals')
      .select('sort_order')
      .eq('user_id', targetUserId)
      .eq('period_year', year)
      .eq('period_month', month)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const baseOrder = (maxRow as { sort_order?: number } | null)?.sort_order ?? 0;

    const records = items.map((it, idx) => ({
      user_id: targetUserId,
      period_year: year,
      period_month: month,
      goals: it.goals,
      expected_output: it.expected_output,
      task_breakdown: it.task_breakdown,
      planned_completion_date: it.planned_completion_date,
      acceptance_criteria: it.acceptance_criteria,
      risk_points: it.risk_points,
      status: 'active',
      sort_order: baseOrder + idx + 1,
    }));

    const { data, error } = await client
      .from('monthly_goals')
      .insert(records)
      .select('*, users(id, real_name, username)');

    if (error) {
      // 23505 = 唯一约束冲突：老库 monthly_goals 仍带每月唯一约束，需先迁移
      if (error.code === '23505' && /monthly_goals_user_id_period_year_period_month_key/.test(error.message)) {
        return NextResponse.json(
          {
            error:
              '数据库尚未迁移：monthly_goals 表仍带「每人每月一条」唯一约束。请在 Supabase SQL Editor 执行：' +
              "ALTER TABLE monthly_goals DROP CONSTRAINT IF EXISTS monthly_goals_user_id_period_year_period_month_key; " +
              'CREATE INDEX IF NOT EXISTS idx_monthly_goals_user_period ON monthly_goals(user_id, period_year, period_month);',
            code: 'NEED_MIGRATION',
          },
          { status: 409 }
        );
      }
      throw new Error(`保存失败: ${error.message}`);
    }

    return NextResponse.json({ data: data || [], count: (data || []).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
