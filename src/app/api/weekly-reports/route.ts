import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import { withSchemaCacheRetry } from '@/lib/schema-cache';
import { getMonthWeeks, type WorkPeriod } from '@/lib/week-utils';

export interface ArtifactItem {
  type: 'link' | 'file';
  name: string;
  url: string;
  size?: number;
}

export interface WeeklyReport {
  id: number;
  user_id: number;
  period_year: number;
  period_month: number;
  week_index: number;
  week_start: string;
  week_end: string;
  this_week_plan: Array<{ id: string; text: string; done: boolean }>;
  actual_completed: string | null;
  uncompleted_reason: string | null;
  next_week_plan: Array<{ id: string; text: string; done: boolean }>;
  output_artifacts: ArtifactItem[] | null;
  used_external_ai: boolean | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
  users?: { id: number; real_name: string; username: string };
}

/**
 * GET /api/weekly-reports?year=&month=&userId=
 * 返回该月各周周报。普通用户仅本人；admin 可传 userId 看指定人或全员（不传）。
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
        .from('weekly_reports')
        .select('*, users(id, real_name, username)')
        .order('week_index', { ascending: true });
      if (year) q = q.eq('period_year', year);
      if (month) q = q.eq('period_month', month);
      if (currentUser.role !== 'admin') {
        q = q.eq('user_id', currentUser.id);
      } else if (userId) {
        q = q.eq('user_id', userId);
      }
      const res = await q;
      if (res.error) throw res.error;
      return res.data || [];
    });

    // 同时返回该月的周划分与工作期配置，便于前端渲染
    let weeks: ReturnType<typeof getMonthWeeks> = [];
    let workConfig: WorkPeriod | null = null;
    if (year && month) {
      const { data: cfg } = await client
        .from('month_work_config')
        .select('work_start, work_end')
        .eq('period_year', year)
        .eq('period_month', month)
        .maybeSingle();
      if (cfg?.work_start && cfg?.work_end) {
        workConfig = { workStart: cfg.work_start, workEnd: cfg.work_end };
      }
      weeks = getMonthWeeks(year, month, workConfig || undefined);
    }

    return NextResponse.json({ data, weeks, workConfig });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
