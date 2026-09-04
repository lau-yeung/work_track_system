import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import * as XLSX from 'xlsx';

interface PlanItem {
  id: string;
  text: string;
  done: boolean;
}
interface Artifact {
  type: string;
  name: string;
  url: string;
  size?: number;
}
interface ReportRow {
  week_index: number;
  week_start: string;
  week_end: string;
  this_week_plan: PlanItem[];
  actual_completed: string | null;
  uncompleted_reason: string | null;
  next_week_plan: PlanItem[];
  output_artifacts: Artifact[] | string | null;
  users?: { real_name: string; username: string };
}

const HEADERS = ['负责人', '周次', '周期', '本周计划', '已完成', '未完成', '未完成原因', '下周计划', '输出产物'];

const planText = (items: PlanItem[] | unknown): string => {
  if (!Array.isArray(items)) return '';
  return items.map((p) => (p.done ? '[✓] ' : '[ ] ') + p.text).join('\n');
};
const artifactText = (a: Artifact[] | string | null): string => {
  if (!a) return '';
  if (typeof a === 'string') return a;
  if (Array.isArray(a)) return a.map((x) => `${x.name}: ${x.url}`).join('\n');
  return '';
};

function buildExcel(rows: ReportRow[], label: string) {
  const wsData: (string | number)[][] = [
    ['周报汇总导出', ...Array(HEADERS.length - 1).fill('')],
    [`周期：${label}`, ...Array(HEADERS.length - 1).fill('')],
    [`导出时间：${new Date().toLocaleString('zh-CN')}`, ...Array(HEADERS.length - 1).fill('')],
    [`记录数：${rows.length}`, ...Array(HEADERS.length - 1).fill('')],
    [],
    HEADERS,
  ];
  for (const r of rows) {
    wsData.push([
      r.users?.real_name || '-',
      `第${r.week_index}周`,
      `${r.week_start} ~ ${r.week_end}`,
      planText(r.this_week_plan),
      r.actual_completed || '',
      planText((r.this_week_plan || []).filter((p) => !p.done)).replace(/\[\s\]/g, '').trim() || '',
      r.uncompleted_reason || '',
      planText(r.next_week_plan),
      artifactText(r.output_artifacts),
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 26 }, { wch: 40 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 40 }, { wch: 30 }];
  ws['!merges'] = [0, 1, 2, 3].map((ri) => ({ s: { r: ri, c: 0 }, e: { r: ri, c: HEADERS.length - 1 } }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '周报汇总');
  return wb;
}

function buildCSV(rows: ReportRow[]): string {
  const lines: string[] = [HEADERS.join(',')];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\n/g, ' / ')}"`;
  for (const r of rows) {
    lines.push([
      esc(r.users?.real_name),
      `第${r.week_index}周`,
      `${r.week_start}~${r.week_end}`,
      esc(planText(r.this_week_plan)),
      esc(r.actual_completed),
      esc((r.this_week_plan || []).filter((p) => !p.done).map((p) => p.text).join(' / ')),
      esc(r.uncompleted_reason),
      esc(planText(r.next_week_plan)),
      esc(artifactText(r.output_artifacts)),
    ].join(','));
  }
  return '\uFEFF' + lines.join('\n');
}

function buildMarkdown(rows: ReportRow[], label: string): string {
  const l: string[] = [`# 周报汇总导出`, '', `- 周期：${label}`, `- 导出时间：${new Date().toLocaleString('zh-CN')}`, ''];
  for (const r of rows) {
    l.push(`## 第${r.week_index}周 ${r.week_start} ~ ${r.week_end}（${r.users?.real_name || '-'}）`, '');
    l.push('### 本周计划', '');
    if (Array.isArray(r.this_week_plan) && r.this_week_plan.length) {
      r.this_week_plan.forEach((p) => l.push(`- [${p.done ? 'x' : ' '}] ${p.text}`));
    } else l.push('- （无）');
    l.push('', '### 实际完成', '', r.actual_completed || '（无）', '', '### 未完成原因', '', r.uncompleted_reason || '（无）', '');
    l.push('### 下周计划', '');
    if (Array.isArray(r.next_week_plan) && r.next_week_plan.length) {
      r.next_week_plan.forEach((p) => l.push(`- ${p.text}`));
    } else l.push('- （无）');
    l.push('', '### 输出产物', '', artifactText(r.output_artifacts) || '（无）', '');
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
    let q = client.from('weekly_reports').select('*, users(id, real_name, username)').order('week_index', { ascending: true });
    if (year) q = q.eq('period_year', Number(year));
    if (month) q = q.eq('period_month', Number(month));
    if (currentUser.role !== 'admin') q = q.eq('user_id', currentUser.id);
    else if (userId) q = q.eq('user_id', Number(userId));
    const { data, error } = await q;
    if (error) throw new Error(`查询失败: ${error.message}`);
    const rows = (data || []) as ReportRow[];
    if (rows.length === 0) return NextResponse.json({ error: '无数据可导出' }, { status: 404 });

    const label = `${year || ''}-${month ? String(month).padStart(2, '0') : ''}`;
    const base = `周报汇总_${label}`;
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
