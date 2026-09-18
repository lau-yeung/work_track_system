import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import { generateMonthlyGoalDetails } from '@/lib/ai-service';

/**
 * POST /api/ai/monthly-goal-generate
 * 根据月度目标标题 + 上月日报数据，AI 一键生成每个目标的：
 * 预期产出 / 计划任务拆解 / 计划完成时间 / 验收标准 / 风险点
 *
 * 为什么参考上月而不是本月：
 *   月度目标在月初录入，本月尚未开始，无日报可参考。
 *   上月日报反映了最近的工作节奏、项目状态与风险因素，
 *   AI 据此推断本月目标的产出形态、拆解粒度和合理排期。
 *
 * body: { year, month, goals: string[], userId?: number }
 * response: { data: { items: MonthlyGoalAIItem[], usedExternalAI: boolean } }
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { year, month, goals, userId, field } = body as {
      year?: number;
      month?: number;
      goals?: string[];
      userId?: number;
      field?: 'expected_output' | 'task_breakdown' | 'planned_completion_date' | 'acceptance_criteria' | 'risk_points';
    };

    if (!year || !month) {
      return NextResponse.json({ error: '年、月为必填' }, { status: 400 });
    }
    if (month < 1 || month > 12) {
      return NextResponse.json({ error: '月份非法' }, { status: 400 });
    }
    if (!Array.isArray(goals) || goals.length === 0) {
      return NextResponse.json({ error: 'goals 数组不能为空' }, { status: 400 });
    }

    // 目标标题清洗
    const cleanGoals = goals
      .map((g) => (typeof g === 'string' ? g.trim() : ''))
      .filter((g) => g.length > 0);

    if (cleanGoals.length === 0) {
      return NextResponse.json({ error: '目标标题不能全为空' }, { status: 400 });
    }

    // 限制单次 AI 生成的目标数量，避免 prompt 过长
    if (cleanGoals.length > 20) {
      return NextResponse.json(
        { error: '单次 AI 生成最多 20 条目标，请分批处理' },
        { status: 400 }
      );
    }

    // 普通用户只能为自己生成；admin 可指定 userId
    const targetUserId =
      currentUser.role === 'admin' && userId ? Number(userId) : currentUser.id;

    const client = getSupabaseClient();

    // 拉取上月日报数据作为 AI 上下文：月初规划本月目标，参考上月实际工作节奏更合理
    const lastDay = new Date(year, month, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    // 上月起止（跨年处理）
    const prevMonthDate = new Date(year, month - 2, 1); // month-2 因为 Date month 0-based
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth() + 1;
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
    const startDate = `${prevYear}-${pad(prevMonth)}-01`;
    const endDate = `${prevYear}-${pad(prevMonth)}-${pad(prevLastDay)}`;

    let dailyReportDigest: string | undefined;
    try {
      const { data: entries, error: teError } = await client
        .from('time_entries')
        .select(
          'work_date, hours, completed_work, tomorrow_plan, coordination_matters, projects(id, name)'
        )
        .eq('user_id', targetUserId)
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date', { ascending: true });

      if (!teError && entries && entries.length > 0) {
        // 聚合为简要 digest，避免 prompt 过长
        const lines = entries.map((e: any) => {
          const proj = e.projects?.name || '-';
          const completed = (e.completed_work || '').slice(0, 200);
          const plan = (e.tomorrow_plan || '').slice(0, 100);
          return `- ${e.work_date} | ${proj} | ${e.hours}h | 完成: ${completed || '-'} | 明日: ${plan || '-'}`;
        });
        dailyReportDigest = lines.join('\n');
      }
    } catch {
      // 拉日报失败不阻断 AI 生成，仅缺上下文
    }

    // 调用 AI 生成
    const result = await generateMonthlyGoalDetails({
      year,
      month,
      goals: cleanGoals,
      dailyReportDigest,
      field,
    });

    // 单字段模式：只返回该字段内容
    if (field) {
      return NextResponse.json({
        data: {
          field,
          value: result.items[0]?.[field] || '',
          usedExternalAI: result.usedExternalAI,
          fallback: result.fallback,
        },
      });
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI 生成失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
