import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const client = getSupabaseClient();

    // Get existing entry
    const { data: existing, error: fetchError } = await client
      .from('time_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw new Error(`查询失败: ${fetchError.message}`);
    if (!existing) return NextResponse.json({ error: '记录不存在' }, { status: 404 });

    // Only owner or admin can edit
    if (existing.user_id !== currentUser.id && currentUser.role !== 'admin') {
      return NextResponse.json({ error: '只能编辑自己的工时记录' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, string> = {};

    if (body.hours !== undefined) {
      const hoursNum = parseFloat(body.hours);
      if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
        return NextResponse.json({ error: '工时必须在0-24之间' }, { status: 400 });
      }
      updates.hours = String(hoursNum);
    }
    if (body.remarks !== undefined) updates.remarks = body.remarks;
    if (body.completed_work !== undefined) updates.completed_work = body.completed_work;
    if (body.coordination_matters !== undefined) updates.coordination_matters = body.coordination_matters;
    if (body.tomorrow_plan !== undefined) updates.tomorrow_plan = body.tomorrow_plan;

    // Check daily hour limit
    if (updates.hours) {
      const { data: dailyEntries } = await client
        .from('time_entries')
        .select('hours')
        .eq('user_id', existing.user_id)
        .eq('work_date', existing.work_date)
        .neq('id', parseInt(id));

      const otherDailyTotal = dailyEntries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;
      if (otherDailyTotal + parseFloat(updates.hours) > 8) {
        return NextResponse.json({ error: '单日工时总计不能超过8小时' }, { status: 400 });
      }
    }

    const { data, error } = await client
      .from('time_entries')
      .update(updates)
      .eq('id', id)
      .select('*, projects(id, name), users(id, real_name, username)')
      .maybeSingle();

    if (error) throw new Error(`更新失败: ${error.message}`);

    // Query daily total after update for reminder
    const { data: dailyAfter } = await client
      .from('time_entries')
      .select('hours')
      .eq('user_id', existing.user_id)
      .eq('work_date', existing.work_date);
    const dailyTotal = (dailyAfter || []).reduce(
      (sum: number, e: { hours: string }) => sum + parseFloat(e.hours),
      0
    );

    return NextResponse.json({
      data,
      daily_total: Math.round(dailyTotal * 10) / 10,
      is_below_minimum: dailyTotal < 8,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const client = getSupabaseClient();

    const { data: existing } = await client
      .from('time_entries')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    if (existing.user_id !== currentUser.id && currentUser.role !== 'admin') {
      return NextResponse.json({ error: '只能删除自己的工时记录' }, { status: 403 });
    }

    const { error } = await client.from('time_entries').delete().eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);

    return NextResponse.json({ message: '删除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
