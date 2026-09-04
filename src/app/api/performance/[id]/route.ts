import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

/**
 * GET /api/performance/:id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const scoreId = parseInt(id);
    if (Number.isNaN(scoreId)) {
      return NextResponse.json({ error: '无效ID' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('performance_scores')
      .select('*, users(id, real_name, username)')
      .eq('id', scoreId)
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
