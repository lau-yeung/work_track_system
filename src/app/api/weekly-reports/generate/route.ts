import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import { generateWeeklyReport, TimeEntryForAI } from '@/lib/ai-service';

/**
 * POST /api/weekly-reports/generate
 * body: { userId, weekStart, weekEnd }
 * AI 生成本周「实际完成/未完成原因/输出产物」，带兜底。
 * 保留用户已编辑的 this_week_plan / next_week_plan。
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { userId, weekStart, weekEnd } = body as {
      userId?: number;
      weekStart?: string;
      weekEnd?: string;
    };

    if (!weekStart || !weekEnd) {
      return NextResponse.json({ error: 'weekStart/weekEnd 必填' }, { status: 400 });
    }

    const targetUserId =
      currentUser.role === 'admin' && userId ? Number(userId) : currentUser.id;
    if (currentUser.role !== 'admin' && userId && Number(userId) !== currentUser.id) {
      return NextResponse.json({ error: '无权为他人生成' }, { status: 403 });
    }

    const client = getSupabaseClient();

    // 取周报记录（若不存在则先建空壳）
    let { data: report } = await client
      .from('weekly_reports')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (!report) {
      // 计算周次归属：找 month/week_index
      const start = new Date(weekStart);
      const year = start.getFullYear();
      const month = start.getMonth() + 1;
      const { getMonthWeeks } = await import('@/lib/week-utils');
      const weeks = getMonthWeeks(year, month);
      const w = weeks.find((x) => x.weekStart === weekStart);
      const { data: inserted, error: insErr } = await client
        .from('weekly_reports')
        .insert({
          user_id: targetUserId,
          period_year: year,
          period_month: month,
          week_index: w?.weekIndex ?? 1,
          week_start: weekStart,
          week_end: weekEnd,
          this_week_plan: [],
          next_week_plan: [],
        })
        .select('*')
        .single();
      if (insErr) throw new Error(`创建周报失败: ${insErr.message}`);
      report = inserted;
    }

    // 取本周日报
    const { data: entries, error: teErr } = await client
      .from('time_entries')
      .select(
        'work_date, hours, completed_work, tomorrow_plan, coordination_matters, remarks, projects(id, name), users(id, real_name, username)'
      )
      .eq('user_id', targetUserId)
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd)
      .order('work_date', { ascending: true });
    if (teErr) throw new Error(`查询日报失败: ${teErr.message}`);

    const aiEntries: TimeEntryForAI[] = (entries || []).map((e: Record<string, unknown>) => ({
      work_date: e.work_date as string,
      hours: e.hours as string,
      completed_work: (e.completed_work as string) || null,
      tomorrow_plan: (e.tomorrow_plan as string) || null,
      coordination_matters: (e.coordination_matters as string) || null,
      remarks: (e.remarks as string) || null,
      project_name: ((e.projects as { name?: string } | null)?.name) || '-',
      user_name: ((e.users as { real_name?: string; username?: string } | null)?.real_name) || '-',
    }));

    const thisWeekPlan = Array.isArray(report.this_week_plan)
      ? (report.this_week_plan as Array<{ id: string; text: string; done: boolean }>)
      : [];

    const result = await generateWeeklyReport({
      weekStart,
      weekEnd,
      entries: aiEntries,
      thisWeekPlan,
    });

    // 仅覆盖 AI 生成字段，保留用户编辑的计划
    const { data: updated, error: upErr } = await client
      .from('weekly_reports')
      .update({
        actual_completed: result.actualCompleted,
        uncompleted_reason: result.uncompletedReason,
        output_artifacts: result.outputArtifacts,
        used_external_ai: result.usedExternalAI,
        generated_at: new Date().toISOString(),
      })
      .eq('id', report.id)
      .select('*, users(id, real_name, username)')
      .single();
    if (upErr) throw new Error(`保存失败: ${upErr.message}`);

    return NextResponse.json({
      data: updated,
      used_external_ai: result.usedExternalAI,
      fallback: !result.usedExternalAI && aiEntries.length > 0 ? '规则兜底' : 'none',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '生成失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
