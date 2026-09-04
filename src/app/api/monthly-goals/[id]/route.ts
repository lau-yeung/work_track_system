import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

/**
 * GET /api/monthly-goals/:id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const goalId = parseInt(id);
    if (Number.isNaN(goalId)) {
      return NextResponse.json({ error: '无效ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('monthly_goals')
      .select('*, users(id, real_name, username)')
      .eq('id', goalId)
      .single();
    if (error) throw new Error(`查询失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '不存在' }, { status: 404 });

    if (currentUser.role !== 'admin' && data.user_id !== currentUser.id) {
      return NextResponse.json({ error: '无权查看' }, { status: 403 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/monthly-goals/:id
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const goalId = parseInt(id);
    if (Number.isNaN(goalId)) {
      return NextResponse.json({ error: '无效ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: existing } = await client
      .from('monthly_goals')
      .select('id, user_id')
      .eq('id', goalId)
      .single();
    if (!existing) return NextResponse.json({ error: '不存在' }, { status: 404 });
    if (currentUser.role !== 'admin' && existing.user_id !== currentUser.id) {
      return NextResponse.json({ error: '无权修改' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const key of [
      'goals',
      'expected_output',
      'task_breakdown',
      'acceptance_criteria',
      'risk_points',
      'status',
    ] as const) {
      if (body[key] !== undefined) updates[key] = body[key] || null;
    }
    if (body.planned_completion_date !== undefined) {
      updates.planned_completion_date = body.planned_completion_date || null;
    }

    const { data, error } = await client
      .from('monthly_goals')
      .update(updates)
      .eq('id', goalId)
      .select('*, users(id, real_name, username)')
      .single();
    if (error) throw new Error(`更新失败: ${error.message}`);

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/monthly-goals/:id
 * 删除单条月度目标（本人或 admin）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const goalId = parseInt(id);
    if (Number.isNaN(goalId)) {
      return NextResponse.json({ error: '无效ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: existing } = await client
      .from('monthly_goals')
      .select('id, user_id')
      .eq('id', goalId)
      .single();
    if (!existing) return NextResponse.json({ error: '不存在' }, { status: 404 });
    if (currentUser.role !== 'admin' && existing.user_id !== currentUser.id) {
      return NextResponse.json({ error: '无权删除' }, { status: 403 });
    }

    const { error } = await client
      .from('monthly_goals')
      .delete()
      .eq('id', goalId);
    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
