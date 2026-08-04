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

    // Get all members with deduplication
    const { data: allMembers, error } = await client
      .from('project_members')
      .select('*, users(id, username, real_name, role)')
      .eq('project_id', id);

    if (error) throw new Error(`查询成员失败: ${error.message}`);

    // Deduplicate by user_id
    const seenIds = new Set<number>();
    const data = (allMembers || []).filter((m: any) => {
      const userId = m.user_id;
      if (seenIds.has(userId)) return false;
      seenIds.add(userId);
      return true;
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const projectId = parseInt(id);
    const { user_ids } = await request.json() as { user_ids: number[] };

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return NextResponse.json({ error: '请选择要添加的成员' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // Check if user has permission (admin or project owner)
    if (currentUser.role !== 'admin') {
      const { data: project } = await client.from('projects').select('owner_id').eq('id', projectId).maybeSingle();
      if (!project || project.owner_id !== currentUser.id) {
        return NextResponse.json({ error: '权限不足' }, { status: 403 });
      }
    }

    // Get existing members
    const { data: existing } = await client
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId);
    const existingIds = new Set(existing?.map((m: { user_id: number }) => m.user_id) || []);

    // Filter out already-added members
    const newMemberIds = user_ids.filter((uid: number) => !existingIds.has(uid));
    if (newMemberIds.length === 0) {
      return NextResponse.json({ error: '所选用户已是项目成员' }, { status: 400 });
    }

    // The system "admin" account is reserved for special data handling
    // and shall not be added to project membership.
    const { data: candidateUsers, error: lookupError } = await client
      .from('users')
      .select('id, username, real_name')
      .in('id', newMemberIds);
    if (lookupError) throw new Error(`校验用户失败: ${lookupError.message}`);
    const reserved = (candidateUsers || []).filter((u: { username: string }) => u.username === 'admin');
    if (reserved.length > 0) {
      const names = reserved.map((u: { real_name: string; username: string }) => `${u.real_name}(${u.username})`).join('、');
      return NextResponse.json(
        { error: `系统保留账号（${names}）不可加入项目成员` },
        { status: 400 }
      );
    }

    const members = newMemberIds.map((uid: number) => ({
      project_id: projectId,
      user_id: uid,
    }));

    const { data, error } = await client.from('project_members').insert(members).select();
    if (error) throw new Error(`添加成员失败: ${error.message}`);

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '添加失败';
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

    const { id } = await params;
    const projectId = parseInt(id);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });

    const client = getSupabaseClient();

    if (currentUser.role !== 'admin') {
      const { data: project } = await client.from('projects').select('owner_id').eq('id', projectId).maybeSingle();
      if (!project || project.owner_id !== currentUser.id) {
        return NextResponse.json({ error: '权限不足' }, { status: 403 });
      }
    }

    const { error } = await client
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);
    if (error) throw new Error(`移除成员失败: ${error.message}`);

    return NextResponse.json({ message: '移除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '移除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
