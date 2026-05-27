import { NextRequest } from 'next/server';
import { verifyToken, SessionUser } from './auth';

export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  // 1. Check Authorization header (localStorage-based auth)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return verifyToken(token);
  }
  // 2. Fallback to cookie
  const token = request.cookies.get('token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function requireRole(user: SessionUser | null, ...roles: string[]): SessionUser {
  if (!user) {
    throw new Error('未登录');
  }
  if (!roles.includes(user.role)) {
    throw new Error('权限不足');
  }
  return user;
}
