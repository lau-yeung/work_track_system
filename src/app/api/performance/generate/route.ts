import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import { generatePerformanceScore, calculateTotalScore } from '@/lib/ai-service';

/**
 * POST /api/performance/generate
 * body: { year, month, userId? }
 * 仅 admin。userId 缺省时为全员生成。AI 五维评分 + 后端加权总分。
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可生成绩效' }, { status: 403 });
    }

    const body = await request.json();
    const { year, month, userId } = body as {
      year?: number;
      month?: number;
      userId?: number;
    };

    if (!year || !month) {
      return NextResponse.json({ error: '年月必填' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 确定目标用户列表
    let targetUserIds: number[];
    let userMap: Map<number, { id: number; real_name: string; username: string }>;
    if (userId) {
      const { data: u, error: uErr } = await client
        .from('users')
        .select('id, real_name, username')
        .eq('id', userId)
        .single();
      if (uErr || !u) {
        return NextResponse.json({ error: '用户不存在' }, { status: 400 });
      }
      targetUserIds = [u.id];
      userMap = new Map([[u.id, u]]);
    } else {
      // 全员（排除系统保留 admin）
      const { data: users, error: uErr } = await client
        .from('users')
        .select('id, real_name, username')
        .neq('username', 'admin');
      if (uErr) throw new Error(`查询用户失败: ${uErr.message}`);
      targetUserIds = (users || []).map((u) => u.id);
      userMap = new Map((users || []).map((u) => [u.id, u]));
    }

    const results: Record<string, unknown>[] = [];

    for (const uid of targetUserIds) {
      const user = userMap.get(uid)!;

      // 1. 本月周报实际完成
      const { data: weeklyReports } = await client
        .from('weekly_reports')
        .select('week_index, actual_completed')
        .eq('user_id', uid)
        .eq('period_year', year)
        .eq('period_month', month)
        .order('week_index', { ascending: true });
      const weeklyActuals = (weeklyReports || []).map((w: Record<string, unknown>) => ({
        weekIndex: w.week_index as number,
        actualCompleted: (w.actual_completed as string) || '',
      }));

      // 2. 本月工时与活跃天数
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`;
      const { data: entries } = await client
        .from('time_entries')
        .select('hours, work_date')
        .eq('user_id', uid)
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd);
      let workHours = 0;
      const activeDaysSet = new Set<string>();
      for (const e of entries || []) {
        workHours += parseFloat(e.hours);
        activeDaysSet.add(e.work_date);
      }
      workHours = Math.round(workHours * 10) / 10;

      // 3. 月度目标（每月可多条，合并后供 AI 参考）
      const { data: goalRows } = await client
        .from('monthly_goals')
        .select('goals, expected_output')
        .eq('user_id', uid)
        .eq('period_year', year)
        .eq('period_month', month)
        .order('id', { ascending: true });
      const goalList = goalRows || [];
      const goalSummary =
        goalList.length > 0
          ? {
              goals: goalList.map((g: { goals: string }) => g.goals).filter(Boolean).join('\n'),
              expectedOutput: goalList
                .map((g: { expected_output: string | null }) => g.expected_output)
                .filter(Boolean)
                .join('\n'),
            }
          : null;

      // 4. AI 生成（带兜底）
      const aiResult = await generatePerformanceScore({
        year,
        month,
        userName: user.real_name || user.username,
        weeklyActuals,
        workHours,
        activeDays: activeDaysSet.size,
        goalSummary,
      });

      const totalScore = calculateTotalScore({
        completion: aiResult.completion,
        quality: aiResult.quality,
        progress: aiResult.progress,
        collaboration: aiResult.collaboration,
        discipline: aiResult.discipline,
      });

      // 5. upsert
      const record = {
        user_id: uid,
        period_year: year,
        period_month: month,
        monthly_tasks: aiResult.monthlyTasks,
        work_hours: String(workHours),
        score_explanation: aiResult.scoreExplanation,
        completion: String(aiResult.completion),
        quality: String(aiResult.quality),
        progress: String(aiResult.progress),
        collaboration: String(aiResult.collaboration),
        discipline: String(aiResult.discipline),
        total_score: String(totalScore),
        used_external_ai: aiResult.usedExternalAI,
        generated_at: new Date().toISOString(),
      };

      const { data, error } = await client
        .from('performance_scores')
        .upsert(record, { onConflict: 'user_id,period_year,period_month' })
        .select('*, users(id, real_name, username)')
        .single();
      if (error) throw new Error(`保存绩效失败: ${error.message}`);
      results.push(data as Record<string, unknown>);
    }

    return NextResponse.json({ data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : '生成失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
