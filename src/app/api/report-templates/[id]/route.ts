import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

/**
 * PUT /api/report-templates/:id
 * 编辑本人模板（系统内置 user_id IS NULL 不可改）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const templateId = parseInt(id);
    if (Number.isNaN(templateId)) {
      return NextResponse.json({ error: '无效的模板ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    // 仅可编辑本人模板
    const { data: existing, error: findErr } = await client
      .from('report_templates')
      .select('id, user_id')
      .eq('id', templateId)
      .single();
    if (findErr) throw new Error(`查询失败: ${findErr.message}`);
    if (!existing) return NextResponse.json({ error: '模板不存在' }, { status: 404 });
    if (existing.user_id !== currentUser.id) {
      return NextResponse.json({ error: '系统内置模板不可编辑' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: '模板名称不能为空' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }
    if (body.fields !== undefined) {
      const validated = validateFields(body.fields);
      if (typeof validated === 'string') {
        return NextResponse.json({ error: validated }, { status: 400 });
      }
      updates.fields = validated;
    }
    if (body.is_default === true) {
      // 清除其他默认
      await client
        .from('report_templates')
        .update({ is_default: false })
        .eq('user_id', currentUser.id)
        .eq('is_default', true);
      updates.is_default = true;
    } else if (body.is_default === false) {
      updates.is_default = false;
    }

    const { data, error } = await client
      .from('report_templates')
      .update(updates)
      .eq('id', templateId)
      .select('*')
      .single();
    if (error) throw new Error(`更新失败: ${error.message}`);

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/report-templates/:id
 * 删除本人模板（系统内置不可删）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const templateId = parseInt(id);
    if (Number.isNaN(templateId)) {
      return NextResponse.json({ error: '无效的模板ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: existing, error: findErr } = await client
      .from('report_templates')
      .select('id, user_id')
      .eq('id', templateId)
      .single();
    if (findErr) throw new Error(`查询失败: ${findErr.message}`);
    if (!existing) return NextResponse.json({ error: '模板不存在' }, { status: 404 });
    if (existing.user_id !== currentUser.id) {
      return NextResponse.json({ error: '系统内置模板不可删除' }, { status: 403 });
    }

    const { error } = await client
      .from('report_templates')
      .delete()
      .eq('id', templateId);
    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function validateFields(fields: unknown) {
  if (!Array.isArray(fields)) return 'fields 必须为数组';
  if (fields.length < 1 || fields.length > 12) return '字段数量需在 1~12 之间';
  for (const f of fields) {
    if (!f || typeof f !== 'object') return '字段格式不合法';
    const { key, label } = f as Record<string, unknown>;
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_]+$/.test(key)) {
      return `字段 key 仅允许字母数字下划线: ${String(key)}`;
    }
    if (typeof label !== 'string' || !label.trim()) return '字段 label 必填';
  }
  return fields as Array<{ key: string; label: string }>;
}
