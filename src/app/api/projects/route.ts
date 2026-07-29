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
    const status = searchParams.get('status');

    // Get user's project IDs first (for non-admin)
    let projectIds: number[] | null = null;
    if (currentUser.role === 'user' || currentUser.role === 'pm') {
      const { data: memberships, error: mError } = await client
        .from('project_members')
        .select('project_id')
        .eq('user_id', currentUser.id);
      if (mError) throw new Error(`查询成员关系失败: ${mError.message}`);
      projectIds = memberships?.map((m: { project_id: number }) => m.project_id) || [];
      // PM also sees projects they own
      const { data: ownedProjects, error: oError } = await client
        .from('projects')
        .select('id')
        .eq('owner_id', currentUser.id);
      if (oError) throw new Error(`查询负责项目失败: ${oError.message}`);
      const ownedIds = ownedProjects?.map((p: { id: number }) => p.id) || [];
      const allIds = [...new Set([...(projectIds || []), ...ownedIds])];
      projectIds = allIds;
    }

    let query = client
      .from('projects')
      .select('*, users!projects_owner_id_fkey(id, real_name, username)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status) query = query.eq('status', status);
    if (projectIds && projectIds.length > 0) {
      query = query.in('id', projectIds);
    } else if (projectIds && projectIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, pageSize });
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    // Use a single query to get all actual hours (avoid N+1 problem)
    const projectIds = (data || []).map((p: any) => p.id);
    const { data: hoursData } = projectIds.length > 0
      ? await client
          .from('time_entries')
          .select('project_id, hours')
          .in('project_id', projectIds)
      : { data: [] };

    const hoursMap = new Map<number, number>();
    (hoursData || []).forEach(({ project_id, hours }) => {
      hoursMap.set(project_id, (hoursMap.get(project_id) || 0) + parseFloat(hours));
    });

    const projectsWithHours = (data || []).map((project: any) => ({
      ...project,
      actual_hours: Math.round((hoursMap.get(project.id) || 0) * 10) / 10,
    }));

    return NextResponse.json({ data: projectsWithHours, total: count, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      return NextResponse.json({ error: '仅PM或管理员可创建项目' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, owner_id, estimated_hours, start_date, end_date, member_ids } = body;

    if (!name || !owner_id || !estimated_hours) {
      return NextResponse.json({ error: '项目名称、负责人和预估工时为必填' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // Create project
    const { data: project, error } = await client
      .from('projects')
      .insert({
        name,
        description,
        owner_id,
        estimated_hours: String(estimated_hours),
        start_date,
        end_date,
      })
      .select('*, users!projects_owner_id_fkey(id, real_name, username)')
      .single();

    if (error) throw new Error(`创建项目失败: ${error.message}`);

    // Add members (including owner)
    const memberIds = [...new Set([...(member_ids || []), owner_id])];
    if (memberIds.length > 0) {
      const members = memberIds.map((uid: number) => ({
        project_id: project.id,
        user_id: uid,
      }));
      const { error: mError } = await client.from('project_members').insert(members);
      if (mError) throw new Error(`添加成员失败: ${mError.message}`);
    }

    return NextResponse.json({ data: project }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
