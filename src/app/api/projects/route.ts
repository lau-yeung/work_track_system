import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables } from '@/lib/product-init';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const status = searchParams.get('status');
    const keyword = searchParams.get('keyword')?.trim();
    const productId = searchParams.get('productId');
    const ownerId = searchParams.get('ownerId');

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

    await ensureProductTables();

    let query = client
      .from('projects')
      .select(
        '*, users!projects_owner_id_fkey(id, real_name, username), products!projects_product_id_fkey(id, name)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status) query = query.eq('status', status);
    if (productId) query = query.eq('product_id', parseInt(productId, 10));
    if (ownerId) query = query.eq('owner_id', parseInt(ownerId, 10));
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,description.ilike.%${keyword}%`);
    }
    if (projectIds && projectIds.length > 0) {
      query = query.in('id', projectIds);
    } else if (projectIds && projectIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, pageSize });
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    // Use a single query to get all actual hours (avoid N+1 problem)
    const fetchedProjectIds = (data || []).map((p: any) => p.id);
    const { data: hoursData } = fetchedProjectIds.length > 0
      ? await client
          .from('time_entries')
          .select('project_id, hours')
          .in('project_id', fetchedProjectIds)
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

    await ensureProductTables();

    const body = await request.json();
    const { name, description, owner_id, product_id, estimated_hours, start_date, end_date, member_ids } = body;

    if (!name || !owner_id || !estimated_hours) {
      return NextResponse.json({ error: '项目名称、负责人和预估工时为必填' }, { status: 400 });
    }
    if (!product_id) {
      return NextResponse.json({ error: '请选择所属产品' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 校验所属产品存在
    const { data: product, error: productError } = await client
      .from('products')
      .select('id, name, status')
      .eq('id', product_id)
      .maybeSingle();
    if (productError) throw new Error(`校验产品失败: ${productError.message}`);
    if (!product) return NextResponse.json({ error: '所属产品不存在' }, { status: 400 });

    // The system "admin" account is reserved for special data handling
    // and shall not be assigned as project owner or member.
    const candidateIds = [...new Set([Number(owner_id), ...((member_ids as number[]) || [])])].filter(
      (id) => !Number.isNaN(id)
    );
    if (candidateIds.length > 0) {
      const { data: candidateUsers, error: lookupError } = await client
        .from('users')
        .select('id, username, real_name')
        .in('id', candidateIds);
      if (lookupError) throw new Error(`校验用户失败: ${lookupError.message}`);
      const reserved = (candidateUsers || []).filter((u: { username: string }) => u.username === 'admin');
      if (reserved.length > 0) {
        const names = reserved.map((u: { real_name: string; username: string }) => `${u.real_name}(${u.username})`).join('、');
        return NextResponse.json(
          { error: `系统保留账号（${names}）不可作为项目负责人或成员` },
          { status: 400 }
        );
      }
    }

    // Create project
    // Empty date strings must be converted to null: PostgreSQL date columns
    // reject "" with "invalid input syntax for type date".
    const { data: project, error } = await client
      .from('projects')
      .insert({
        name,
        description,
        owner_id,
        product_id,
        estimated_hours: String(estimated_hours),
        start_date: start_date || null,
        end_date: end_date || null,
      })
      .select(
        '*, users!projects_owner_id_fkey(id, real_name, username), products!projects_product_id_fkey(id, name)'
      )
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
