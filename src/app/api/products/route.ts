import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables } from '@/lib/product-init';

// 产品列表（所有登录用户可见，填报日报需要选择产品）
// 默认只返回 active 状态；?all=1 时返回全部（管理页用）
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureProductTables();

    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const includeClosed = searchParams.get('all') === '1';
    const status = searchParams.get('status');
    const keyword = searchParams.get('keyword')?.trim();
    const ownerId = searchParams.get('ownerId');

    let query = client
      .from('products')
      .select('*, users!products_owner_id_fkey(id, real_name, username)')
      .order('name');
    if (status) query = query.eq('status', status);
    else if (!includeClosed) query = query.eq('status', 'active');
    if (ownerId) query = query.eq('owner_id', parseInt(ownerId, 10));
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,code.ilike.%${keyword}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    // 聚合每个产品下的项目数与任务数（一次查询，避免 N+1）
    const { data: projectsData } = await client
      .from('projects')
      .select('id, product_id');
    const { data: tasksData } = await client
      .from('project_tasks')
      .select('id, project_id, status');

    const projectCountMap = new Map<number, number>();
    const projectTaskCountMap = new Map<number, number>();
    for (const p of projectsData || []) {
      if (p.product_id == null) continue;
      projectCountMap.set(p.product_id, (projectCountMap.get(p.product_id) || 0) + 1);
      projectTaskCountMap.set(p.product_id, (projectTaskCountMap.get(p.product_id) || 0));
    }
    // 任务按项目归属到产品
    const projectProductMap = new Map<number, number>();
    for (const p of projectsData || []) {
      if (p.product_id != null) projectProductMap.set(p.id, p.product_id);
    }
    const taskCountMap = new Map<number, number>();
    const activeTaskCountMap = new Map<number, number>();
    for (const t of tasksData || []) {
      const pid = projectProductMap.get(t.project_id);
      if (pid == null) continue;
      taskCountMap.set(pid, (taskCountMap.get(pid) || 0) + 1);
      if (t.status === 'active') {
        activeTaskCountMap.set(pid, (activeTaskCountMap.get(pid) || 0) + 1);
      }
    }

    const productsWithCounts = (data || []).map((product: { id: number }) => ({
      ...product,
      project_count: projectCountMap.get(product.id) || 0,
      task_count: taskCountMap.get(product.id) || 0,
      active_task_count: activeTaskCountMap.get(product.id) || 0,
    }));

    return NextResponse.json({ data: productsWithCounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 创建产品（仅管理员/PM）
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      return NextResponse.json({ error: '仅PM或管理员可创建产品' }, { status: 403 });
    }

    await ensureProductTables();

    const body = await request.json();
    const { name, code, description, owner_id } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: '产品名称为必填' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 产品编号唯一性校验
    if (code && String(code).trim()) {
      const { data: dup } = await client
        .from('products')
        .select('id')
        .eq('code', String(code).trim())
        .maybeSingle();
      if (dup) {
        return NextResponse.json({ error: `产品编号「${String(code).trim()}」已存在` }, { status: 400 });
      }
    }

    // 系统保留账号 admin 不可作为产品负责人
    if (owner_id) {
      const { data: candidate } = await client
        .from('users')
        .select('id, username, real_name')
        .eq('id', owner_id)
        .maybeSingle();
      if (candidate?.username === 'admin') {
        return NextResponse.json(
          { error: `系统保留账号（${candidate.real_name}(${candidate.username})）不可作为产品负责人` },
          { status: 400 }
        );
      }
    }

    const { data: product, error } = await client
      .from('products')
      .insert({
        name: String(name).trim(),
        code: code ? String(code).trim() : null,
        description: description || null,
        owner_id: owner_id || null,
      })
      .select('*, users!products_owner_id_fkey(id, real_name, username)')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '产品名称或编号已存在' }, { status: 400 });
      }
      throw new Error(`创建产品失败: ${error.message}`);
    }

    return NextResponse.json({ data: product }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
