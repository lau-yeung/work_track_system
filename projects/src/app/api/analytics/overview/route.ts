import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const client = getSupabaseClient();

    // Get projects the user can see
    let projectQuery = client.from('projects').select('id, status', { count: 'exact' });
    if (currentUser.role !== 'admin') {
      const { data: memberships } = await client
        .from('project_members')
        .select('project_id')
        .eq('user_id', currentUser.id);
      const { data: ownedProjects } = await client
        .from('projects')
        .select('id')
        .eq('owner_id', currentUser.id);
      const allIds = [
        ...new Set([
          ...(memberships?.map((m: { project_id: number }) => m.project_id) || []),
          ...(ownedProjects?.map((p: { id: number }) => p.id) || []),
        ]),
      ];
      if (allIds.length > 0) {
        projectQuery = projectQuery.in('id', allIds);
      } else {
        return NextResponse.json({
          totalProjects: 0,
          activeProjects: 0,
          totalHours: 0,
          monthlyHours: 0,
        });
      }
    }

    const { data: projects, count: totalProjects } = await projectQuery;
    const activeProjects = projects?.filter((p: { status: string }) => p.status === 'in_progress').length || 0;

    // Get total hours
    let hoursQuery = client.from('time_entries').select('hours, work_date');
    if (currentUser.role === 'user') {
      hoursQuery = hoursQuery.eq('user_id', currentUser.id);
    } else if (currentUser.role !== 'admin' && projects) {
      const pIds = projects.map((p: { id: number }) => p.id);
      if (pIds.length > 0) {
        hoursQuery = hoursQuery.in('project_id', pIds);
      }
    }

    const { data: entries } = await hoursQuery;
    const totalHours = entries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;

    // Monthly hours
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthlyEntries = entries?.filter((e: { work_date: string }) => e.work_date >= monthStart) || [];
    const monthlyHours = monthlyEntries.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0);

    return NextResponse.json({
      totalProjects: totalProjects || 0,
      activeProjects,
      totalHours: Math.round(totalHours * 10) / 10,
      monthlyHours: Math.round(monthlyHours * 10) / 10,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
