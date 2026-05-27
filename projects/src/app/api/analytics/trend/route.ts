import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!projectId) {
      return NextResponse.json({ error: '请选择项目' }, { status: 400 });
    }

    const client = getSupabaseClient();

    let query = client
      .from('time_entries')
      .select('work_date, hours')
      .eq('project_id', projectId)
      .order('work_date', { ascending: true });

    if (currentUser.role === 'user') {
      query = query.eq('user_id', currentUser.id);
    }

    if (startDate) query = query.gte('work_date', startDate);
    if (endDate) query = query.lte('work_date', endDate);

    const { data: entries, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    // Aggregate by date
    const dailyMap = new Map<string, number>();
    for (const entry of entries || []) {
      const current = dailyMap.get(entry.work_date) || 0;
      dailyMap.set(entry.work_date, current + parseFloat(entry.hours));
    }

    // Build sorted arrays
    const sortedDates = Array.from(dailyMap.keys()).sort();
    const dailyHours = sortedDates.map((d) => ({ date: d, hours: dailyMap.get(d) || 0 }));

    // Calculate cumulative hours
    let cumulative = 0;
    const cumulativeHours = sortedDates.map((d) => {
      cumulative += dailyMap.get(d) || 0;
      return { date: d, cumulative: Math.round(cumulative * 10) / 10 };
    });

    return NextResponse.json({ dailyHours, cumulativeHours });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
