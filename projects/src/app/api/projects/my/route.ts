import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

// Get all projects the current user can see (for dropdown selectors)
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const client = getSupabaseClient();

    if (currentUser.role === 'admin') {
      const { data, error } = await client
        .from('projects')
        .select('id, name, status')
        .neq('status', 'completed')
        .order('name');
      if (error) throw new Error(`查询失败: ${error.message}`);
      return NextResponse.json({ data });
    }

    // Get project IDs from membership + ownership
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

    if (allIds.length === 0) return NextResponse.json({ data: [] });

    const { data, error } = await client
      .from('projects')
      .select('id, name, status')
      .in('id', allIds)
      .neq('status', 'completed')
      .order('name');

    if (error) throw new Error(`查询失败: ${error.message}`);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
