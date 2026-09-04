import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import * as XLSX from 'xlsx';

interface PerfRow {
  user_id: number;
  period_year: number;
  period_month: number;
  monthly_tasks: string | null;
  work_hours: string | number | null;
  score_explanation: string | null;
  completion: string | number | null;
  quality: string | number | null;
  progress: string | number | null;
  collaboration: string | number | null;
  discipline: string | number | null;
  total_score: string | number | null;
  users?: { real_name: string; username: string };
}

const HEADERS = ['负责人', '月度任务', '工时(h)', '完成度', '质量', '进度', '协作', '纪律', '总分', '评分说明'];

function buildExcel(rows: PerfRow[], label: string) {
  const wsData: (string | number)[][] = [
    ['绩效评分导出', ...Array(HEADERS.length - 1).fill('')],
    [`周期：${label}`, ...Array(HEADERS.length - 1).fill('')],
    [`导出时间：${new Date().toLocaleString('zh-CN')}`, ...Array(HEADERS.length - 1).fill('')],
    [`记录数：${rows.length}`, ...Array(HEADERS.length - 1).fill('')],
    [],
    HEADERS,
  ];
  for (const r of rows) {
    wsData.push([
      r.users?.real_name || '-',
      r.monthly_tasks || '',
      Number(r.work_hours) || 0,
      Number(r.completion) || 0,
      Number(r.quality) || 0,
      Number(r.progress) || 0,
      Number(r.collaboration) || 0,
      Number(r.discipline) || 0,
      Number(r.total_score) || 0,
      r.score_explanation || '',
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 40 }];
  ws['!merges'] = [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: HEADERS.length - 1 } }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '绩效评分');
  return wb;
}

function buildCSV(rows: PerfRow[]): string {
  const lines: string[] = [HEADERS.join(',')];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  for (const r of rows) {
    lines.push([
      esc(r.users?.real_name),
      esc(r.monthly_tasks),
      esc(r.work_hours),
      esc(r.completion),
      esc(r.quality),
      esc(r.progress),
      esc(r.collaboration),
      esc(r.discipline),
      esc(r.total_score),
      esc(r.score_explanation),
    ].join(','));
  }
  return '\uFEFF' + lines.join('\n');
}

function buildMarkdown(rows: PerfRow[], label: string): string {
  const l: string[] = [`# 绩效评分导出`, '', `- 周期：${label}`, `- 导出时间：${new Date().toLocaleString('zh-CN')}`, ''];
  l.push(`| ${HEADERS.join(' | ')} |`, `| ${HEADERS.map(() => '---').join(' | ')} |`);
  for (const r of rows) {
    const c = (v: unknown) => String(v ?? '-').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
    l.push(`| ${c(r.users?.real_name)} | ${c(r.monthly_tasks)} | ${c(r.work_hours)} | ${c(r.completion)} | ${c(r.quality)} | ${c(r.progress)} | ${c(r.collaboration)} | ${c(r.discipline)} | ${c(r.total_score)} | ${c(r.score_explanation)} |`);
  }
  return l.join('\n');
}

export async function GET(request: NextRequest) {
  try {
    await ensureAITables();
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const userId = searchParams.get('userId');
    const format = (searchParams.get('format') || 'excel').toLowerCase();

    const client = getSupabaseClient();
    let q = client.from('performance_scores').select('*, users(id, real_name, username)').order('total_score', { ascending: false });
    if (year) q = q.eq('period_year', Number(year));
    if (month) q = q.eq('period_month', Number(month));
    if (currentUser.role !== 'admin') q = q.eq('user_id', currentUser.id);
    else if (userId) q = q.eq('user_id', Number(userId));
    const { data, error } = await q;
    if (error) throw new Error(`查询失败: ${error.message}`);
    const rows = (data || []) as PerfRow[];
    if (rows.length === 0) return NextResponse.json({ error: '无数据可导出' }, { status: 404 });

    const label = `${year || ''}-${month ? String(month).padStart(2, '0') : ''}`;
    const base = `绩效评分_${label}`;
    const file = (ext: string, mime: string, content: string | ArrayBuffer) =>
      new NextResponse(typeof content === 'string' ? content : new Blob([content], { type: mime }), {
        status: 200,
        headers: { 'Content-Type': mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(base + ext)}` },
      });

    if (format === 'excel' || format === 'xlsx') {
      const wb = buildExcel(rows, label);
      const raw = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
      const ab = new ArrayBuffer(raw.byteLength);
      new Uint8Array(ab).set(raw);
      return file('.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ab);
    }
    if (format === 'csv') return file('.csv', 'text/csv; charset=utf-8', buildCSV(rows));
    if (format === 'markdown' || format === 'md') return file('.md', 'text/markdown; charset=utf-8', buildMarkdown(rows, label));
    return NextResponse.json({ error: '不支持的格式' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '导出失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
