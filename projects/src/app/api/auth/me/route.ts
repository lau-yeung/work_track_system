import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

function extractToken(request: NextRequest): string | null {
  // 1. Check Authorization header (localStorage-based auth)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // 2. Fallback to cookie
  return request.cookies.get('token')?.value ?? null;
}

export async function GET(request: NextRequest) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const user = await verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: '登录已过期' }, { status: 401 });
  }

  return NextResponse.json({ user });
}

export async function DELETE() {
  const response = NextResponse.json({ message: '已退出登录' });
  response.cookies.set('token', '', { maxAge: 0, path: '/' });
  return response;
}
