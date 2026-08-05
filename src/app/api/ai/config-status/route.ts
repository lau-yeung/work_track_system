import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getAIStatus } from '@/lib/ai-service';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const status = await getAIStatus();
    return NextResponse.json({ data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取AI配置状态失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
