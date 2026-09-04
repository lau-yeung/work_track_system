import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensurePerfTables } from '@/lib/perf-init';

/**
 * GET /api/templates
 * 管理员可取全部（列表页使用）；普通用户只能看到 is_default=true 的模板（作为下拉选项）
 * 支持 query: ?scope=list（管理员）；默认对 user 返回 defaults
 */
export async function GET(request: NextRequest) {
  try {
    await ensurePerfTables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const client = getSupabaseClient();

    // 普通用户只看模板（选择用），管理员可看全部
    let query = client
      .from('summary_templates')
      .select(
        `*, fields:summary_template_fields(id, field_name, field_type, description, sort_order)`
      )
      .order('is_default', { ascending: false })
      .order('id', { ascending: true });

    if (currentUser.role !== 'admin') {
      query = query.eq('is_default', true);
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询模板失败: ${error.message}`);

    const shaped = (data || []).map((t) => ({
      id: t.id,
      name: t.name,
      applicable_dimension: t.applicable_dimension,
      is_default: t.is_default,
      created_at: t.created_at,
      fields: (t.fields || []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
      ),
    }));
    return NextResponse.json({ data: shaped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface TemplateFieldInput {
  field_name: string;
  field_type?: 'text' | 'textarea';
  description?: string;
  sort_order?: number;
}

/**
 * POST /api/templates  管理员创建模板
 */
export async function POST(request: NextRequest) {
  try {
    await ensurePerfTables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin')
      return NextResponse.json({ error: '仅管理员可创建模板' }, { status: 403 });

    const body = (await request.json()) as {
      name: string;
      applicable_dimension?: 'week' | 'month' | 'both' | 'custom';
      fields?: TemplateFieldInput[];
    };
    const name = body?.name?.trim();
    if (!name) return NextResponse.json({ error: '模板名称必填' }, { status: 400 });

    const applicable =
      body.applicable_dimension &&
      ['week', 'month', 'both', 'custom'].includes(body.applicable_dimension)
        ? body.applicable_dimension
        : 'both';

    const rawFields = body.fields || [];
    // 字段名校验：非空 + 不重复
    const names = rawFields.map((f) => f.field_name.trim()).filter(Boolean);
    if (names.length === 0)
      return NextResponse.json({ error: '至少需要一个有效字段' }, { status: 400 });
    if (new Set(names).size !== names.length)
      return NextResponse.json({ error: '字段名不可重复' }, { status: 400 });

    const client = getSupabaseClient();

    // 事务：插入 template → 批量 insert fields，失败回滚
    const { data: tplData, error: tplErr } = await client
      .from('summary_templates')
      .insert({
        name,
        applicable_dimension: applicable,
        created_by: currentUser.id,
      })
      .select('id')
      .maybeSingle();
    if (tplErr || !tplData) throw new Error(`创建模板失败: ${tplErr?.message || '未知'}`);

    const fieldsPayload = rawFields
      .filter((f) => f.field_name.trim())
      .map((f, i) => ({
        template_id: tplData.id,
        field_name: f.field_name.trim(),
        field_type: f.field_type === 'text' ? 'text' : 'textarea',
        description: f.description?.trim() || null,
        sort_order: (f.sort_order ?? i + 1),
      }));

    const { error: fldErr } = await client.from('summary_template_fields').insert(fieldsPayload);
    if (fldErr) throw new Error(`保存模板字段失败: ${fldErr.message}`);

    return NextResponse.json({ data: { id: tplData.id, name } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '创建失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
