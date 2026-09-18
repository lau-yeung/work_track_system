import { NextRequest, NextResponse } from 'next/server';

// 节假日查询代理：对接 timor.tech 公共 API，附带进程内缓存
// type.type: 0=工作日 1=周末 2=法定节假日 3=调休上班
// 前端只需 isWorkday 布尔：type=0 或 type=3 视为工作日

interface TimorHolidayResponse {
  code: number;
  type?: { type: number; name: string; week: number };
  holiday?: { holiday: boolean; name: string; wage: number; date: string } | null;
}

interface CacheEntry {
  data: { date: string; isWorkday: boolean; type: number; name: string };
  ts: number;
}

// 进程内缓存：date -> CacheEntry
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天

async function queryTimor(date: string): Promise<{ isWorkday: boolean; type: number; name: string } | null> {
  const cached = cache.get(date);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }
  try {
    const res = await fetch(`https://timor.tech/api/holiday/info/${date}`, {
      // Next.js fetch 默认会缓存，显式重新验证
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as TimorHolidayResponse;
    if (json.code !== 0 || !json.type) return null;
    const type = json.type.type;
    // 工作日（0）和调休上班（3）都算 isWorkday=true；周末（1）和节假日（2）为 false
    const isWorkday = type === 0 || type === 3;
    const result = { isWorkday, type, name: json.type.name };
    cache.set(date, {
      data: { date, isWorkday, type, name: json.type.name },
      ts: Date.now(),
    });
    return result;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const date = new URL(request.url).searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: '缺少 date 参数' }, { status: 400 });
  }
  // 简单格式校验
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '日期格式应为 YYYY-MM-DD' }, { status: 400 });
  }
  const result = await queryTimor(date);
  if (!result) {
    // 第三方失败时退化为周末判断（周六周日非工作日）
    const day = new Date(date).getDay();
    const isWorkday = day !== 0 && day !== 6;
    return NextResponse.json({
      date,
      isWorkday,
      type: -1,
      name: isWorkday ? '工作日（兜底）' : '周末（兜底）',
      fallback: true,
    });
  }
  return NextResponse.json({ date, ...result });
}
