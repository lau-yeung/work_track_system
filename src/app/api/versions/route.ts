import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables } from '@/lib/product-init';

interface VersionRow {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  release_date: string | null;
  status: string;
  created_by: number | null;
  created_at: string;
  projects: { id: number; name: string };
}

// 版本列表
// - ?project_id=  按项目过滤
// - ?status=active 默认只返回进行中版本；?all=1 返回全部
// - 非管理员只能看到自己参与/负责的项目下的版本
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureProductTables();

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const includeClosed = searchParams.get('all') === '1';
    const statusFilter = searchParams.get('status');

    // 非管理员：先求可见项目集合（成员 + 负责）
    let visibleProjectIds: number[] | null = null;
    if (currentUser.role !== 'admin') {
      const { data: memberships } = await client
        .from('project_members')
        .select('project_id')
        .eq('user_id', currentUser.id);
      const { data: ownedProjects } = await client
        .from('projects')
        .select('id')
        .eq('owner_id', currentUser.id);
      visibleProjectIds = [
        ...new Set([
          ...(memberships?.map((m: { project_id: number }) => m.project_id) || []),
          ...(ownedProjects?.map((p: { id: number }) => p.id) || []),
        ]),
      ];
      if (visibleProjectIds.length === 0) return NextResponse.json({ data: [] });
    }

    let query = client
      .from('project_versions')
      .select('*, projects(id, name)')
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', parseInt(projectId, 10));
    if (!includeClosed) {
      if (statusFilter) query = query.eq('status', statusFilter);
      else query = query.eq('status', 'active');
    }
    if (visibleProjectIds) query = query.in('project_id', visibleProjectIds);

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ data: (data || []) as VersionRow[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 创建版本（仅管理员/PM）
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      return NextResponse.json({ error: '仅PM或管理员可创建版本' }, { status: 403 });
    }

    await ensureProductTables();

    const body = await request.json();
    const { project_id, name, description, release_date } = body;

    if (!project_id || !name || !String(name).trim()) {
      return NextResponse.json({ error: '所属项目和版本名称为必填' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 校验项目存在
    const { data: project, error: pError } = await client
      .from('projects')
      .select('id, name')
      .eq('id', project_id)
      .maybeSingle();
    if (pError) throw new Error(`校验项目失败: ${pError.message}`);
    if (!project) return NextResponse.json({ error: '所属项目不存在' }, { status: 400 });

    const { data: version, error } = await client
      .from('project_versions')
      .insert({
        project_id,
        name: String(name).trim(),
        description: description || null,
        // 空日期字符串必须转 null：PostgreSQL date 列不接受 ""
        release_date: release_date || null,
        created_by: currentUser.id,
      })
      .select('*, projects(id, name)')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '该项目下已存在同名版本' }, { status: 400 });
      }
      throw new Error(`创建版本失败: ${error.message}`);
    }

    return NextResponse.json({ data: version }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
