import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

interface PlanItem {
  id: string;
  text: string;
  done: boolean;
}

/**
 * PUT /api/weekly-reports/:id
 * 更新周报字段：this_week_plan / next_week_plan / uncompleted_reason / actual_completed / output_artifacts
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const reportId = parseInt(id);
    if (Number.isNaN(reportId)) {
      return NextResponse.json({ error: '无效ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: existing } = await client
      .from('weekly_reports')
      .select('id, user_id')
      .eq('id', reportId)
      .single();
    if (!existing) return NextResponse.json({ error: '不存在' }, { status: 404 });
    if (currentUser.role !== 'admin' && existing.user_id !== currentUser.id) {
      return NextResponse.json({ error: '无权修改' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.this_week_plan !== undefined) {
      const plan = normalizePlan(body.this_week_plan);
      updates.this_week_plan = plan;
    }
    if (body.next_week_plan !== undefined) {
      const plan = normalizePlan(body.next_week_plan);
      updates.next_week_plan = plan;
    }
    if (body.uncompleted_reason !== undefined) {
      updates.uncompleted_reason = body.uncompleted_reason || null;
    }
    if (body.actual_completed !== undefined) {
      updates.actual_completed = body.actual_completed || null;
    }
    if (body.output_artifacts !== undefined) {
      updates.output_artifacts = normalizeArtifacts(body.output_artifacts);
    }

    const { data, error } = await client
      .from('weekly_reports')
      .update(updates)
      .eq('id', reportId)
      .select('*, users(id, real_name, username)')
      .single();
    if (error) throw new Error(`更新失败: ${error.message}`);

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizePlan(plan: unknown): PlanItem[] {
  if (!Array.isArray(plan)) return [];
  return (plan as Array<Record<string, unknown>>)
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      id: typeof p.id === 'string' ? p.id : `item-${Math.random().toString(36).slice(2)}`,
      text: typeof p.text === 'string' ? p.text : '',
      done: !!p.done,
    }))
    .filter((p) => p.text.trim() !== '');
}

/** 输出产物归一为 [{type, name, url, size?}] JSON 数组 */
function normalizeArtifacts(artifacts: unknown) {
  if (!Array.isArray(artifacts)) return [];
  return (artifacts as Array<Record<string, unknown>>)
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({
      type: a.type === 'file' ? 'file' : 'link',
      name: typeof a.name === 'string' ? a.name : '',
      url: typeof a.url === 'string' ? a.url : '',
      ...(typeof a.size === 'number' ? { size: a.size } : {}),
    }))
    .filter((a) => a.url.trim() !== '' || a.name.trim() !== '');
}
