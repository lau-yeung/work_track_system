import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';

interface ReorderItem {
  id: number;
  sort_order: number;
}

/**
 * PUT /api/monthly-goals/reorder
 * body: { items: [{ id, sort_order }] }
 * 批量更新排序。普通用户只能重排自己的目标，admin 可重排任意。
 */
export async function PUT(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const items = body.items as ReorderItem[] | undefined;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '缺少 items' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 校验归属：普通用户只能重排自己的目标
    if (currentUser.role !== 'admin') {
      const ids = items.map((i) => i.id);
      const { data: owned } = await client
        .from('monthly_goals')
        .select('id, user_id')
        .in('id', ids);
      const allOwned = (owned || []).every((r: { user_id: number }) => r.user_id === currentUser.id);
      if (!allOwned) {
        return NextResponse.json({ error: '无权重排他人目标' }, { status: 403 });
      }
    }

    // 逐条更新（数量小，单事务循环足够）
    for (const it of items) {
      if (typeof it.id !== 'number' || typeof it.sort_order !== 'number') continue;
      const { error } = await client
        .from('monthly_goals')
        .update({ sort_order: it.sort_order, updated_at: new Date().toISOString() })
        .eq('id', it.id);
      if (error) throw new Error(`排序失败: ${error.message}`);
    }

    return NextResponse.json({ ok: true, count: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : '排序失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
