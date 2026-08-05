import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { generateWorkSummary } from '@/lib/ai-service';
import { ensureAITables } from '@/lib/ai-init';

interface TimeEntrySummary {
  work_date: string;
  hours: string;
  completed_work: string | null;
  tomorrow_plan: string | null;
  coordination_matters: string | null;
  project_name: string;
  user_name: string;
}

/**
 * Calculate date range based on dimension
 * Supports: week, last_week, month, last_month, year, last_year, custom
 */
type Dimension = 'week' | 'last_week' | 'month' | 'last_month' | 'year' | 'last_year' | 'custom';

function getDateRange(dimension: Dimension, referenceDate?: string, customStart?: string, customEnd?: string): { start: string; end: string } {
  const now = new Date();
  const date = referenceDate ? new Date(referenceDate) : now;
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const addDays = (d: Date, days: number) => {
    const r = new Date(d);
    r.setDate(d.getDate() + days);
    return r;
  };

  switch (dimension) {
    case 'week': {
      // This week (Monday to Sunday)
      const day = date.getDay() || 7;
      const monday = addDays(date, -day + 1);
      const sunday = addDays(monday, 6);
      return { start: fmt(monday), end: fmt(sunday) };
    }
    case 'last_week': {
      // Last week (Monday to Sunday)
      const day = date.getDay() || 7;
      const thisMonday = addDays(date, -day + 1);
      const lastMonday = addDays(thisMonday, -7);
      const lastSunday = addDays(lastMonday, 6);
      return { start: fmt(lastMonday), end: fmt(lastSunday) };
    }
    case 'month': {
      // This month
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      return { start: fmt(firstDay), end: fmt(lastDay) };
    }
    case 'last_month': {
      // Last month
      const firstDay = new Date(date.getFullYear(), date.getMonth() - 1, 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth(), 0);
      return { start: fmt(firstDay), end: fmt(lastDay) };
    }
    case 'year': {
      // This year
      const firstDay = new Date(date.getFullYear(), 0, 1);
      const lastDay = new Date(date.getFullYear(), 11, 31);
      return { start: fmt(firstDay), end: fmt(lastDay) };
    }
    case 'last_year': {
      // Last year
      const year = date.getFullYear() - 1;
      const firstDay = new Date(year, 0, 1);
      const lastDay = new Date(year, 11, 31);
      return { start: fmt(firstDay), end: fmt(lastDay) };
    }
    case 'custom': {
      if (!customStart || !customEnd) {
        throw new Error('自定义范围需要提供 startDate 和 endDate');
      }
      return { start: customStart, end: customEnd };
    }
    default: {
      // Default: this week
      const day = date.getDay() || 7;
      const monday = addDays(date, -day + 1);
      const sunday = addDays(monday, 6);
      return { start: fmt(monday), end: fmt(sunday) };
    }
  }
}

/**
 * Get dimension label for previous summary lookup
 */
function getPrevDimension(dimension: Dimension): Dimension | null {
  switch (dimension) {
    case 'week': return 'last_week';
    case 'month': return 'last_month';
    case 'year': return 'last_year';
    default: return null;
  }
}

/**
 * GET /api/ai/work-summary - List work summaries
 */
export async function GET(request: NextRequest) {
  try {
    // Auto-create table if it doesn't exist
    await ensureAITables();

    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const dimension = (searchParams.get('dimension') || 'week') as Dimension;
    const userId = searchParams.get('userId') ? parseInt(searchParams.get('userId')!) : undefined;
    const projectId = searchParams.get('projectId') ? parseInt(searchParams.get('projectId')!) : undefined;

    const client = getSupabaseClient();

    // Query summaries from database
    let query = client
      .from('work_summaries')
      .select('*, users(id, real_name, username), projects(id, name)')
      .eq('dimension', dimension)
      .order('period_start', { ascending: false });

    // Non-admin users only see their own summaries
    if (currentUser.role === 'user') {
      query = query.eq('user_id', currentUser.id);
    } else if (userId) {
      query = query.eq('user_id', userId);
    }

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        // Try one more time to initialize
        await ensureAITables();
        // Re-query after initialization
        const retryResult = await client
          .from('work_summaries')
          .select('*, users(id, real_name, username), projects(id, name)')
          .eq('dimension', dimension)
          .order('period_start', { ascending: false });
        if (retryResult.error && retryResult.error.code === '42P01') {
          return NextResponse.json({
            error: '工作总结表尚未创建，请在Supabase SQL Editor执行建表SQL',
            sql: 'CREATE TABLE IF NOT EXISTS work_summaries (...)',
            hint: '访问 /api/init-ai-tables 获取建表SQL',
          }, { status: 500 });
        }
        return NextResponse.json({ data: retryResult.data || [] });
      }
      throw new Error(`查询失败: ${error.message}`);
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/ai/work-summary - Generate and save work summary
 */
export async function POST(request: NextRequest) {
  try {
    // Auto-create table if it doesn't exist
    await ensureAITables();

    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { dimension, date, projectId, startDate, endDate } = body as {
      dimension: Dimension;
      date?: string;
      projectId?: number;
      startDate?: string;
      endDate?: string;
    };

    const validDimensions: Dimension[] = ['week', 'last_week', 'month', 'last_month', 'year', 'last_year', 'custom'];
    if (!validDimensions.includes(dimension)) {
      return NextResponse.json({ error: '无效的维度' }, { status: 400 });
    }

    const referenceDate = date || new Date().toISOString().split('T')[0];
    let start: string;
    let end: string;

    try {
      ({ start, end } = getDateRange(dimension, referenceDate, startDate, endDate));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : '日期范围无效' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // Fetch time entries for the period
    let query = client
      .from('time_entries')
      .select(
        'work_date, hours, completed_work, tomorrow_plan, coordination_matters, projects(id, name), users(id, real_name, username)'
      )
      .gte('work_date', start)
      .lte('work_date', end)
      .order('work_date', { ascending: true });

    // Non-admin users only generate summaries for their own entries
    const targetUserId = currentUser.role === 'user' ? currentUser.id : body.userId;
    if (targetUserId) query = query.eq('user_id', targetUserId);
    if (projectId) query = query.eq('project_id', projectId);

    const { data: entries, error: teError } = await query;
    if (teError) throw new Error(`查询日报失败: ${teError.message}`);

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: '所选周期内无日报数据' }, { status: 404 });
    }

    // Transform entries for AI processing
    const summaryEntries: TimeEntrySummary[] = entries.map((e: any) => ({
      work_date: e.work_date,
      hours: e.hours,
      completed_work: e.completed_work,
      tomorrow_plan: e.tomorrow_plan,
      coordination_matters: e.coordination_matters,
      project_name: e.projects?.name || '-',
      user_name: e.users?.real_name || e.users?.username || '-',
    }));

    // Try to fetch previous period's summary for "本周/本月/本年计划"
    let previousSummary: string | null = null;
    const prevDim = getPrevDimension(dimension);
    if (prevDim) {
      try {
        // Calculate previous period start date
        const prevDate = new Date(start);
        switch (prevDim) {
          case 'last_week': prevDate.setDate(prevDate.getDate() - 7); break;
          case 'last_month': prevDate.setMonth(prevDate.getMonth() - 1); break;
          case 'last_year': prevDate.setFullYear(prevDate.getFullYear() - 1); break;
        }
        const prevPeriodStart = prevDate.toISOString().split('T')[0];

        const { data: prevSummaries, error: prevErr } = await client
          .from('work_summaries')
          .select('summary_content')
          .eq('dimension', prevDim)
          .eq('period_start', prevPeriodStart)
          .eq('user_id', targetUserId || currentUser.id)
          .maybeSingle();

        if (prevSummaries && !prevErr) {
          previousSummary = prevSummaries.summary_content || null;
        }
      } catch {
        // Silently skip if table doesn't exist yet
      }
    }

    // Generate summary using AI
    // Map dimension to semantic type for AI processing
    const semanticDimension: 'week' | 'month' | 'year' | 'custom' =
      dimension === 'week' || dimension === 'last_week' ? 'week' :
      dimension === 'month' || dimension === 'last_month' ? 'month' :
      dimension === 'year' || dimension === 'last_year' ? 'year' : 'custom';

    const summaryResult = await generateWorkSummary({
      dimension: semanticDimension,
      startDate: start,
      endDate: end,
      userId: targetUserId,
      projectId,
      entries: summaryEntries,
      previousSummary,
    });

    const summaryContent = summaryResult.content;
    const usedExternalAI = summaryResult.usedExternalAI;

    // Save summary to database
    const summaryRecord = {
      user_id: targetUserId || currentUser.id,
      project_id: projectId || null,
      dimension,
      period_start: start,
      period_end: end,
      summary_content: summaryContent,
      generated_at: new Date().toISOString(),
    };

    // Try to save summary to database (may fail if table doesn't exist)
    let saved = false;
    try {
      const { error: insertError } = await client
        .from('work_summaries')
        .upsert(summaryRecord, { onConflict: 'user_id,project_id,dimension,period_start' });

      saved = !insertError;
      if (insertError) {
        console.warn('保存总结失败（表可能不存在）:', insertError.message);
      }
    } catch {
      // Table doesn't exist or other error
      console.warn('保存总结失败（表可能不存在）');
    }

    return NextResponse.json({
      data: {
        id: saved ? undefined : Date.now(), // Temporary ID for unsaved summaries
        dimension,
        period_start: start,
        period_end: end,
        summary_content: summaryContent,
        generated_at: new Date().toISOString(),
        used_external_ai: usedExternalAI,
      },
      saved,
      used_external_ai: usedExternalAI,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '生成失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}