import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import { withSchemaCacheRetry } from '@/lib/schema-cache';

/**
 * GET /api/performance?year=&month=&userId=
 * admin 可看全员/指定人；普通用户仅本人。
 */
export async function GET(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined;
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : undefined;
    const userId = searchParams.get('userId') ? parseInt(searchParams.get('userId')!) : undefined;

    const client = getSupabaseClient();

    const data = await withSchemaCacheRetry(async () => {
      let q = client
        .from('performance_scores')
        .select('*, users(id, real_name, username)')
        .order('total_score', { ascending: false });
      if (year) q = q.eq('period_year', year);
      if (month) q = q.eq('period_month', month);
      if (currentUser.role !== 'admin') {
        q = q.eq('user_id', currentUser.id);
      } else if (userId) {
        q = q.eq('user_id', userId);
      }
      const res = await q;
      if (res.error) throw res.error;
      return res.data || [];
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
