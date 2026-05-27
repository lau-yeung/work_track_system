import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const client = getSupabaseClient();

    const { data: project, error } = await client
      .from('projects')
      .select('*, users!projects_owner_id_fkey(id, real_name, username)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`查询失败: ${error.message}`);
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

    // Get members
    const { data: members, error: mError } = await client
      .from('project_members')
      .select('*, users(id, username, real_name, role)')
      .eq('project_id', id);
    if (mError) throw new Error(`查询成员失败: ${mError.message}`);

    // Get total hours
    const { data: entries, error: teError } = await client
      .from('time_entries')
      .select('hours')
      .eq('project_id', id);
    if (teError) throw new Error(`查询工时失败: ${teError.message}`);

    const actualHours = entries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;

    return NextResponse.json({
      data: {
        ...project,
        members: members || [],
        actual_hours: actualHours,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, string> = {};

    if (body.name) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.estimated_hours) updates.estimated_hours = String(body.estimated_hours);
    if (body.status && ['in_progress', 'completed', 'at_risk'].includes(body.status)) updates.status = body.status;
    if (body.start_date) updates.start_date = body.start_date;
    if (body.end_date) updates.end_date = body.end_date;

    // Only admin or project owner/pm can update
    const client = getSupabaseClient();
    if (currentUser.role !== 'admin') {
      const { data: project } = await client.from('projects').select('owner_id').eq('id', id).maybeSingle();
      if (!project || (project.owner_id !== currentUser.id && currentUser.role !== 'pm')) {
        return NextResponse.json({ error: '权限不足' }, { status: 403 });
      }
    }

    const { data, error } = await client
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select('*, users!projects_owner_id_fkey(id, real_name, username)')
      .maybeSingle();

    if (error) throw new Error(`更新失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可删除项目' }, { status: 403 });
    }

    const { id } = await params;
    const client = getSupabaseClient();
    // Cascade delete will handle project_members and time_entries
    const { error } = await client.from('projects').delete().eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ message: '删除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
