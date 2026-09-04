import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getStorage } from '@/storage';

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/msword',
  'text/plain',
  'text/markdown',
  'application/json',
];

function safeExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : 'bin';
}

/**
 * POST /api/weekly-reports/upload
 * multipart/form-data, field: file
 * 返回 { url, name, size, key }
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '文件超过 20MB 限制' }, { status: 413 });
    }
    if (ALLOWED_TYPES.length && !ALLOWED_TYPES.includes(file.type) && file.type !== '') {
      return NextResponse.json({ error: `不支持的类型: ${file.type || safeExt(file.name)}` }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = safeExt(file.name);
    const stamp = Date.now();
    const rnd = Math.random().toString(36).slice(2, 8);
    const key = `${stamp}-${rnd}.${ext}`;

    const storage = getStorage();
    const result = await storage.upload(buffer, key, file.type || 'application/octet-stream', file.name);

    return NextResponse.json({
      url: result.url,
      name: result.name,
      size: result.size,
      key: result.key,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '上传失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
