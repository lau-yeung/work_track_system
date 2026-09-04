import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';

interface WorkConfigRow {
  id: number;
  period_year: number;
  period_month: number;
  work_start: string;
  work_end: string;
  created_by: number | null;
}

/**
 * GET /api/month-work-config?year=&month=
 * 返回指定月份的工作期配置（全局，所有用户可读）
 */
export async function GET(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    const client = getSupabaseClient();
    let q = client.from('month_work_config').select('*');
    if (year) q = q.eq('period_year', Number(year));
    if (month) q = q.eq('period_month', Number(month));
    q = q.order('period_year', { ascending: false }).order('period_month', { ascending: false });

    const { data, error } = await q;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ data: (data || []) as WorkConfigRow[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/month-work-config
 * body: { period_year, period_month, work_start, work_end }
 * 管理员鉴权，upsert（按 year+month 唯一）
 */
export async function PUT(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可设置工作期' }, { status: 403 });
    }

    const body = await request.json();
    const { period_year, period_month, work_start, work_end } = body as {
      period_year?: number;
      period_month?: number;
      work_start?: string;
      work_end?: string;
    };

    if (!period_year || !period_month || !work_start || !work_end) {
      return NextResponse.json({ error: '年月与起止日期必填' }, { status: 400 });
    }
    if (period_month < 1 || period_month > 12) {
      return NextResponse.json({ error: '月份非法' }, { status: 400 });
    }
    if (new Date(work_start) > new Date(work_end)) {
      return NextResponse.json({ error: '起始日期不能晚于结束日期' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: existing } = await client
      .from('month_work_config')
      .select('id')
      .eq('period_year', period_year)
      .eq('period_month', period_month)
      .maybeSingle();

    let result;
    if (existing) {
      result = await client
        .from('month_work_config')
        .update({
          work_start,
          work_end,
          created_by: currentUser.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();
    } else {
      result = await client
        .from('month_work_config')
        .insert({
          period_year,
          period_month,
          work_start,
          work_end,
          created_by: currentUser.id,
        })
        .select('*')
        .single();
    }

    if (result.error) throw new Error(`保存失败: ${result.error.message}`);
    return NextResponse.json({ data: result.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
