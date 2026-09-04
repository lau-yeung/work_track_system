import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureAITables } from '@/lib/ai-init';
import * as XLSX from 'xlsx';

interface GoalRow {
  id: number;
  user_id: number;
  goals: string;
  expected_output: string | null;
  task_breakdown: string | null;
  planned_completion_date: string | null;
  acceptance_criteria: string | null;
  risk_points: string | null;
  sort_order: number;
  users?: { real_name: string; username: string };
}

const HEADERS = [
  '优先级',
  '负责人',
  '月度目标',
  '预期产出',
  '计划任务拆解',
  '计划完成时间',
  '验收标准',
  '风险点',
];

function buildExcel(rows: GoalRow[], label: string) {
  const wsData: (string | number)[][] = [
    ['月度目标导出', ...Array(HEADERS.length - 1).fill('')],
    [`周期：${label}`, ...Array(HEADERS.length - 1).fill('')],
    [`导出时间：${new Date().toLocaleString('zh-CN')}`, ...Array(HEADERS.length - 1).fill('')],
    [`记录数：${rows.length}`, ...Array(HEADERS.length - 1).fill('')],
    [],
    HEADERS,
  ];
  for (let i = 0; i < rows.length; i++) {
    const g = rows[i];
    wsData.push([
      i + 1,
      g.users?.real_name || '-',
      g.goals,
      g.expected_output || '',
      g.task_breakdown || '',
      g.planned_completion_date || '',
      g.acceptance_criteria || '',
      g.risk_points || '',
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 40 }, { wch: 30 }, { wch: 40 }, { wch: 12 }, { wch: 30 }, { wch: 30 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: HEADERS.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: HEADERS.length - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: HEADERS.length - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: HEADERS.length - 1 } },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '月度目标');
  return wb;
}

function buildCSV(rows: GoalRow[]): string {
  const lines: string[] = [HEADERS.join(',')];
  const esc = (v: string | null) => `"${String(v || '').replace(/"/g, '""')}"`;
  rows.forEach((g, i) => {
    lines.push([
      String(i + 1),
      esc(g.users?.real_name || '-'),
      esc(g.goals),
      esc(g.expected_output),
      esc(g.task_breakdown),
      esc(g.planned_completion_date),
      esc(g.acceptance_criteria),
      esc(g.risk_points),
    ].join(','));
  });
  return '\uFEFF' + lines.join('\n');
}

function buildMarkdown(rows: GoalRow[], label: string): string {
  const l: string[] = [`# 月度目标导出`, '', `- 周期：${label}`, `- 导出时间：${new Date().toLocaleString('zh-CN')}`, ''];
  const head = `| ${HEADERS.join(' | ')} |`;
  const sep = `| ${HEADERS.map(() => '---').join(' | ')} |`;
  l.push(head, sep);
  rows.forEach((g, i) => {
    const c = (v: string | null) => (v || '-').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
    l.push(`| ${i + 1} | ${c(g.users?.real_name || '-')} | ${c(g.goals)} | ${c(g.expected_output)} | ${c(g.task_breakdown)} | ${c(g.planned_completion_date)} | ${c(g.acceptance_criteria)} | ${c(g.risk_points)} |`);
  });
  return l.join('\n');
}

/**
 * GET /api/monthly-goals/export?year=&month=&userId=&format=excel|csv|markdown
 */
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
    let q = client.from('monthly_goals').select('*, users(id, real_name, username)').order('sort_order', { ascending: true }).order('id', { ascending: true });
    if (year) q = q.eq('period_year', Number(year));
    if (month) q = q.eq('period_month', Number(month));
    if (currentUser.role !== 'admin') q = q.eq('user_id', currentUser.id);
    else if (userId) q = q.eq('user_id', Number(userId));
    const { data, error } = await q;
    if (error) throw new Error(`查询失败: ${error.message}`);
    const rows = (data || []) as GoalRow[];
    if (rows.length === 0) return NextResponse.json({ error: '无数据可导出' }, { status: 404 });

    const label = `${year || ''}-${month ? String(month).padStart(2, '0') : ''}`;
    const base = `月度目标_${label}`;
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
