import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables } from '@/lib/product-init';

// 更新产品（仅管理员/PM）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      return NextResponse.json({ error: '仅PM或管理员可编辑产品' }, { status: 403 });
    }

    await ensureProductTables();

    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, string | null> = {};

    if (body.name !== undefined) {
      if (!String(body.name).trim()) {
        return NextResponse.json({ error: '产品名称不能为空' }, { status: 400 });
      }
      updates.name = String(body.name).trim();
    }
    if (body.code !== undefined) updates.code = body.code ? String(body.code).trim() : null;
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.owner_id !== undefined) updates.owner_id = body.owner_id ? String(body.owner_id) : null;
    if (body.status !== undefined && ['active', 'closed'].includes(body.status)) {
      updates.status = body.status;
    }

    const client = getSupabaseClient();

    // 产品编号唯一性校验（排除自身）
    if (updates.code != null && updates.code !== '') {
      const { data: dup } = await client
        .from('products')
        .select('id')
        .eq('code', updates.code)
        .neq('id', id)
        .maybeSingle();
      if (dup) {
        return NextResponse.json({ error: `产品编号「${updates.code}」已存在` }, { status: 400 });
      }
    }
    const { data, error } = await client
      .from('products')
      .update(updates)
      .eq('id', id)
      .select('*, users!products_owner_id_fkey(id, real_name, username)')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '产品名称或编号已存在' }, { status: 400 });
      }
      throw new Error(`更新失败: ${error.message}`);
    }
    if (!data) return NextResponse.json({ error: '产品不存在' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 删除产品（仅管理员；有关联项目时拒绝）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可删除产品' }, { status: 403 });
    }

    await ensureProductTables();

    const { id } = await params;
    const client = getSupabaseClient();

    // 有关联项目时拒绝删除（避免项目失去产品归属），建议改为"关闭"
    const { data: linkedProjects, error: countError } = await client
      .from('projects')
      .select('id')
      .eq('product_id', id);
    if (countError) throw new Error(`校验关联项目失败: ${countError.message}`);

    if (linkedProjects && linkedProjects.length > 0) {
      return NextResponse.json(
        { error: `该产品下仍有 ${linkedProjects.length} 个项目，请先转移或删除项目后再删除产品（也可将产品状态改为"关闭"）` },
        { status: 400 }
      );
    }

    const { error } = await client.from('products').delete().eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ message: '删除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
