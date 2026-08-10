import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const projectId = searchParams.get('projectId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let query = client
      .from('time_entries')
      .select('*, projects(id, name), users(id, real_name, username)', { count: 'exact' })
      .order('work_date', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    // Non-admin users only see their own entries
    if (currentUser.role === 'user') {
      query = query.eq('user_id', currentUser.id);
    }

    if (projectId) query = query.eq('project_id', projectId);
    if (startDate) query = query.gte('work_date', startDate);
    if (endDate) query = query.lte('work_date', endDate);

    const { data, error, count } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ data, total: count, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { project_id, work_date, hours, remarks, completed_work, coordination_matters, tomorrow_plan } = body;

    if (!project_id || !work_date || !hours) {
      return NextResponse.json({ error: '项目、工作日期和工时为必填' }, { status: 400 });
    }

    const hoursNum = parseFloat(hours);
    if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
      return NextResponse.json({ error: '工时必须在0-24之间' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // Check project membership
    const { data: membership } = await client
      .from('project_members')
      .select('id')
      .eq('project_id', project_id)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (!membership && currentUser.role !== 'admin') {
      return NextResponse.json({ error: '您不是该项目成员，无法填报工时' }, { status: 403 });
    }

    // Check daily hour limit (8h)
    const { data: dailyEntries } = await client
      .from('time_entries')
      .select('hours')
      .eq('user_id', currentUser.id)
      .eq('work_date', work_date);

    const currentDailyTotal = dailyEntries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;
    if (currentDailyTotal + hoursNum > 8) {
      return NextResponse.json(
        { error: `单日工时总计不能超过8小时（当前已填报${currentDailyTotal}小时）` },
        { status: 400 }
      );
    }

    // Check project hour limit
    const { data: project } = await client
      .from('projects')
      .select('estimated_hours')
      .eq('id', project_id)
      .maybeSingle();

    if (project) {
      const { data: projectEntries } = await client
        .from('time_entries')
        .select('hours')
        .eq('project_id', project_id);

      const currentProjectTotal = projectEntries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;
      if (currentProjectTotal + hoursNum > parseFloat(project.estimated_hours)) {
        return NextResponse.json(
          { error: `项目工时已超出预估（预估${project.estimated_hours}小时，已用${currentProjectTotal}小时）` },
          { status: 400 }
        );
      }
    }

    // Check if entry already exists for this user+project+date - upsert
    const { data: existing } = await client
      .from('time_entries')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('project_id', project_id)
      .eq('work_date', work_date)
      .maybeSingle();

    let result;
    if (existing) {
      // Update existing entry
      const { data, error } = await client
        .from('time_entries')
        .update({
          hours: String(hoursNum),
          remarks,
          completed_work,
          coordination_matters,
          tomorrow_plan,
        })
        .eq('id', existing.id)
        .select('*, projects(id, name), users(id, real_name, username)')
        .maybeSingle();
      if (error) throw new Error(`更新工时失败: ${error.message}`);
      result = data;
    } else {
      // Create new entry
      const { data, error } = await client
        .from('time_entries')
        .insert({
          user_id: currentUser.id,
          project_id,
          work_date,
          hours: String(hoursNum),
          remarks,
          completed_work,
          coordination_matters,
          tomorrow_plan,
        })
        .select('*, projects(id, name), users(id, real_name, username)')
        .maybeSingle();
      if (error) throw new Error(`创建工时失败: ${error.message}`);
      result = data;
    }

    // Query daily total after save for reminder
    const { data: dailyAfter } = await client
      .from('time_entries')
      .select('hours')
      .eq('user_id', currentUser.id)
      .eq('work_date', work_date);
    const dailyTotal = (dailyAfter || []).reduce(
      (sum: number, e: { hours: string }) => sum + parseFloat(e.hours),
      0
    );

    return NextResponse.json(
      {
        data: result,
        daily_total: Math.round(dailyTotal * 10) / 10,
        is_below_minimum: dailyTotal < 8,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '填报失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
