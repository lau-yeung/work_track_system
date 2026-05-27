import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || String(currentUser.id);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Non-admin can only view their own stats
    if (currentUser.role !== 'admin' && String(currentUser.id) !== userId) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const client = getSupabaseClient();

    // Get user info
    const { data: user } = await client
      .from('users')
      .select('id, username, real_name, role')
      .eq('id', userId)
      .maybeSingle();

    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    // Total hours
    let hoursQuery = client
      .from('time_entries')
      .select('hours, project_id, work_date')
      .eq('user_id', userId);

    if (startDate) hoursQuery = hoursQuery.gte('work_date', startDate);
    if (endDate) hoursQuery = hoursQuery.lte('work_date', endDate);

    const { data: entries, error } = await hoursQuery;
    if (error) throw new Error(`查询失败: ${error.message}`);

    const totalHours = entries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;

    // Group by project
    const projectMap = new Map<number, number>();
    for (const entry of entries || []) {
      const current = projectMap.get(entry.project_id) || 0;
      projectMap.set(entry.project_id, current + parseFloat(entry.hours));
    }

    // Get project names
    const projectIds = Array.from(projectMap.keys());
    const projectStats: Array<{ project_id: number; project_name: string; hours: number }> = [];

    if (projectIds.length > 0) {
      const { data: projects } = await client
        .from('projects')
        .select('id, name')
        .in('id', projectIds);

      for (const [pid, hours] of projectMap) {
        const project = projects?.find((p: { id: number }) => p.id === pid);
        projectStats.push({
          project_id: pid,
          project_name: project?.name || '未知项目',
          hours: Math.round(hours * 10) / 10,
        });
      }
    }

    // Last 30 days trend
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysStr = thirtyDaysAgo.toISOString().split('T')[0];

    const recentEntries = entries?.filter((e: { work_date: string }) => e.work_date >= thirtyDaysStr) || [];
    const dailyMap = new Map<string, number>();
    for (const entry of recentEntries) {
      const current = dailyMap.get(entry.work_date) || 0;
      dailyMap.set(entry.work_date, current + parseFloat(entry.hours));
    }

    const recentTrend = Array.from(dailyMap.entries())
      .map(([date, hours]) => ({ date, hours }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      data: {
        user,
        totalHours: Math.round(totalHours * 10) / 10,
        projectStats,
        recentTrend,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
