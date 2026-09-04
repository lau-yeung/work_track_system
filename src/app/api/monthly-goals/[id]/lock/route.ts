import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensurePerfTables } from '@/lib/perf-init';

const OWNER_SELECT = 'users!monthly_goals_owner_id_fkey(id, real_name, username)';

/**
 * POST /api/monthly-goals/[id]/lock — 仅 admin
 * Body: { locked?: boolean }  默认 true
 *   true  -> status = 'locked'
 *   false -> status = 'active'
 * 同时写入 updated_at = NOW()
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensurePerfTables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可切换月度目标锁定状态' }, { status: 403 });
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0) {
      return NextResponse.json({ error: '无效的 id' }, { status: 400 });
    }

    let body: { locked?: boolean } = {};
    try {
      body = (await request.json()) as { locked?: boolean };
    } catch {
      // 允许无 body，默认 locked=true
      body = {};
    }

    const locked = typeof body?.locked === 'boolean' ? body.locked : true;
    const targetStatus = locked ? 'locked' : 'active';

    const client = getSupabaseClient();

    const { data: exist, error: existErr } = await client
      .from('monthly_goals')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (existErr) throw new Error(`查询月度目标失败: ${existErr.message}`);
    if (!exist) return NextResponse.json({ error: '月度目标不存在' }, { status: 404 });

    const { data, error } = await client
      .from('monthly_goals')
      .update({
        status: targetStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`*, ${OWNER_SELECT}`)
      .maybeSingle();
    if (error) throw new Error(`切换锁定状态失败: ${error.message}`);

    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '操作失败';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
