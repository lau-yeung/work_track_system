import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensurePerfTables } from '@/lib/perf-init';

interface TemplateFieldInput {
  id?: number;
  field_name: string;
  field_type?: 'text' | 'textarea';
  description?: string;
  sort_order?: number;
}

/**
 * PUT /api/templates/[id] — 管理员更新模板基本信息、字段、或单独切换 is_default
 * Accept { name?, applicable_dimension?, fields?, is_default? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensurePerfTables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin')
      return NextResponse.json({ error: '仅管理员可修改模板' }, { status: 403 });

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0)
      return NextResponse.json({ error: '无效的模板 id' }, { status: 400 });

    const body = (await request.json()) as {
      name?: string;
      applicable_dimension?: 'week' | 'month' | 'both' | 'custom';
      fields?: TemplateFieldInput[];
      is_default?: boolean;
    };

    const client = getSupabaseClient();

    // 先确认模板存在
    const { data: existTpl, error: existErr } = await client
      .from('summary_templates')
      .select('id, is_default')
      .eq('id', id)
      .maybeSingle();
    if (existErr || !existTpl)
      return NextResponse.json({ error: '模板不存在' }, { status: 404 });

    // 1) 单独设置 is_default：把其他所有模板 is_default=false，再把当前设为 true
    if (typeof body.is_default === 'boolean' && Object.keys(body).length === 1) {
      if (!body.is_default)
        return NextResponse.json({ error: '至少需要保留一个默认模板' }, { status: 400 });
      const { error: offErr } = await client
        .from('summary_templates')
        .update({ is_default: false })
        .neq('id', id);
      if (offErr) throw new Error(`更新默认模板失败: ${offErr.message}`);
      const { error: onErr } = await client
        .from('summary_templates')
        .update({ is_default: true })
        .eq('id', id);
      if (onErr) throw new Error(`设置默认失败: ${onErr.message}`);
      return NextResponse.json({ ok: true });
    }

    // 2) 完整更新：基本信息 + 整份字段覆盖
    const updatePatch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: '模板名不可为空' }, { status: 400 });
      updatePatch.name = name;
    }
    if (body.applicable_dimension !== undefined) {
      if (
        !['week', 'month', 'both', 'custom'].includes(body.applicable_dimension)
      )
        return NextResponse.json({ error: '适用维度无效' }, { status: 400 });
      updatePatch.applicable_dimension = body.applicable_dimension;
    }
    if (Object.keys(updatePatch).length > 0) {
      const { error: upErr } = await client
        .from('summary_templates')
        .update(updatePatch)
        .eq('id', id);
      if (upErr) throw new Error(`更新模板失败: ${upErr.message}`);
    }

    if (body.fields !== undefined) {
      const rawFields = body.fields;
      const names = rawFields.map((f) => f.field_name.trim()).filter(Boolean);
      if (names.length === 0)
        return NextResponse.json({ error: '至少需要一个有效字段' }, { status: 400 });
      if (new Set(names).size !== names.length)
        return NextResponse.json({ error: '字段名不可重复' }, { status: 400 });

      // 全量覆盖：先删再插（简单可靠，字段 id 不做外部关联）
      const { error: delErr } = await client
        .from('summary_template_fields')
        .delete()
        .eq('template_id', id);
      if (delErr) throw new Error(`清理旧字段失败: ${delErr.message}`);

      const payload = rawFields
        .filter((f) => f.field_name.trim())
        .map((f, i) => ({
          template_id: id,
          field_name: f.field_name.trim(),
          field_type: f.field_type === 'text' ? 'text' : 'textarea',
          description: f.description?.trim() || null,
          sort_order: (f.sort_order ?? i + 1),
        }));
      const { error: insErr } = await client.from('summary_template_fields').insert(payload);
      if (insErr) throw new Error(`保存字段失败: ${insErr.message}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/templates/[id] — 管理员删除非默认模板
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensurePerfTables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin')
      return NextResponse.json({ error: '仅管理员可删除模板' }, { status: 403 });

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0)
      return NextResponse.json({ error: '无效的模板 id' }, { status: 400 });

    const client = getSupabaseClient();

    const { data: existTpl, error: existErr } = await client
      .from('summary_templates')
      .select('id, is_default')
      .eq('id', id)
      .maybeSingle();
    if (existErr || !existTpl)
      return NextResponse.json({ error: '模板不存在' }, { status: 404 });
    if (existTpl.is_default)
      return NextResponse.json({ error: '默认模板不可删除' }, { status: 400 });

    const { error: delErr } = await client.from('summary_templates').delete().eq('id', id);
    if (delErr) throw new Error(`删除模板失败: ${delErr.message}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
