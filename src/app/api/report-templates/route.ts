import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import { withSchemaCacheRetry } from '@/lib/schema-cache';

export interface TemplateField {
  key: string;
  label: string;
}

export interface ReportTemplate {
  id: number;
  name: string;
  fields: TemplateField[];
  is_default: boolean;
  user_id: number | null;
  created_at: string;
  updated_at: string;
}

function validateFields(fields: unknown): TemplateField[] | string {
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
  return fields as TemplateField[];
}

/**
 * GET /api/report-templates
 * 列出当前用户可用模板（本人 + 系统内置 user_id IS NULL）
 */
export async function GET(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const client = getSupabaseClient();
    const data = await withSchemaCacheRetry(async () => {
      const res = await client
        .from('report_templates')
        .select('*')
        .or(`user_id.eq.${currentUser.id},user_id.is.null`)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (res.error) throw res.error;
      return res.data || [];
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/report-templates
 * 新建模板（仅本人模板）
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { name, fields, is_default } = body as {
      name?: string;
      fields?: unknown;
      is_default?: boolean;
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: '模板名称必填' }, { status: 400 });
    }
    const validated = validateFields(fields);
    if (typeof validated === 'string') {
      return NextResponse.json({ error: validated }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 若设为默认，先清除本人其他默认
    if (is_default) {
      await client
        .from('report_templates')
        .update({ is_default: false })
        .eq('user_id', currentUser.id)
        .eq('is_default', true);
    }

    const { data, error } = await client
      .from('report_templates')
      .insert({
        name: name.trim(),
        fields: validated,
        is_default: !!is_default,
        user_id: currentUser.id,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '同名模板已存在' }, { status: 400 });
      }
      throw new Error(`创建失败: ${error.message}`);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
