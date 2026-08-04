import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import * as XLSX from 'xlsx';

interface ExportEntry {
  id: number;
  work_date: string;
  hours: string;
  completed_work: string | null;
  tomorrow_plan: string | null;
  coordination_matters: string | null;
  remarks: string | null;
  projects: { id: number; name: string };
  users: { id: number; real_name: string; username: string };
}

/**
 * Get date range based on dimension
 * - day: specific date
 * - week: ISO week (Monday to Sunday)
 * - month: first to last day of month
 * - year: Jan 1 to Dec 31
 */
function getDateRange(dimension: string, dateStr: string): { start: string; end: string } {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error('无效的日期');
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (dimension) {
    case 'day': {
      return { start: dateStr, end: dateStr };
    }
    case 'week': {
      // ISO week: Monday is the first day
      const day = date.getDay() || 7; // Convert Sunday(0) to 7
      const monday = new Date(date);
      monday.setDate(date.getDate() - day + 1);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { start: fmt(monday), end: fmt(sunday) };
    }
    case 'month': {
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      return { start: fmt(firstDay), end: fmt(lastDay) };
    }
    case 'year': {
      const firstDay = new Date(date.getFullYear(), 0, 1);
      const lastDay = new Date(date.getFullYear(), 11, 31);
      return { start: fmt(firstDay), end: fmt(lastDay) };
    }
    default: {
      // Custom range: use as-is
      return { start: dateStr, end: dateStr };
    }
  }
}

function buildExcelWorkbook(entries: ExportEntry[], dimensionLabel: string) {
  const wsData: (string | number)[][] = [
    ['工时日报导出', '', '', '', '', '', '', ''],
    [`统计维度：${dimensionLabel}`, '', '', '', '', '', '', ''],
    [`导出时间：${new Date().toLocaleString('zh-CN')}`, '', '', '', '', '', '', ''],
    [`记录总数：${entries.length} 条`, '', '', '', '', '', '', ''],
    [],
    ['日期', '员工姓名', '用户名', '项目名称', '工时(h)', '今日完成工作', '明日计划工作', '协调事项', '备注'],
  ];

  for (const e of entries) {
    wsData.push([
      e.work_date,
      e.users?.real_name || '-',
      e.users?.username || '-',
      e.projects?.name || '-',
      parseFloat(e.hours) || 0,
      e.completed_work || '',
      e.tomorrow_plan || '',
      e.coordination_matters || '',
      e.remarks || '',
    ]);
  }

  // Summary row
  const totalHours = entries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
  wsData.push([]);
  wsData.push(['合计', '', '', '', Math.round(totalHours * 10) / 10, '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // 日期
    { wch: 12 }, // 员工姓名
    { wch: 12 }, // 用户名
    { wch: 20 }, // 项目名称
    { wch: 10 }, // 工时
    { wch: 40 }, // 今日完成工作
    { wch: 40 }, // 明日计划工作
    { wch: 30 }, // 协调事项
    { wch: 20 }, // 备注
  ];

  // Merge title rows
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 8 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '工时日报');
  return wb;
}

function buildMarkdown(entries: ExportEntry[], dimensionLabel: string): string {
  const lines: string[] = [];
  lines.push(`# 工时日报导出`);
  lines.push('');
  lines.push(`- **统计维度**：${dimensionLabel}`);
  lines.push(`- **导出时间**：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`- **记录总数**：${entries.length} 条`);
  lines.push('');

  // Group by date
  const byDate = new Map<string, ExportEntry[]>();
  for (const e of entries) {
    if (!byDate.has(e.work_date)) byDate.set(e.work_date, []);
    byDate.get(e.work_date)!.push(e);
  }

  const sortedDates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
  for (const date of sortedDates) {
    lines.push(`## ${date}`);
    lines.push('');
    const dayEntries = byDate.get(date)!;
    const dayTotal = dayEntries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    lines.push(`> 当日工时合计：${Math.round(dayTotal * 10) / 10} 小时`);
    lines.push('');

    lines.push('| 员工 | 项目 | 工时(h) | 今日完成工作 | 明日计划工作 | 协调事项 | 备注 |');
    lines.push('|------|------|---------|--------------|--------------|----------|------|');
    for (const e of dayEntries) {
      const cell = (v: string | null) => (v || '-').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
      lines.push(
        `| ${cell(e.users?.real_name || '-')} | ${cell(e.projects?.name || '-')} | ${e.hours} | ${cell(e.completed_work)} | ${cell(e.tomorrow_plan)} | ${cell(e.coordination_matters)} | ${cell(e.remarks)} |`
      );
    }
    lines.push('');
  }

  const totalHours = entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
  lines.push(`---`);
  lines.push('');
  lines.push(`**总工时合计：${Math.round(totalHours * 10) / 10} 小时**`);

  return lines.join('\n');
}

function buildCSV(entries: ExportEntry[], dimensionLabel: string): string {
  const lines: string[] = [];
  lines.push('日期,员工姓名,用户名,项目名称,工时(h),今日完成工作,明日计划工作,协调事项,备注');
  for (const e of entries) {
    const escape = (v: string | null) => {
      if (!v) return '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };
    lines.push(
      [
        escape(e.work_date),
        escape(e.users?.real_name || '-'),
        escape(e.users?.username || '-'),
        escape(e.projects?.name || '-'),
        e.hours,
        escape(e.completed_work),
        escape(e.tomorrow_plan),
        escape(e.coordination_matters),
        escape(e.remarks),
      ].join(',')
    );
  }
  // BOM for Excel to recognize UTF-8
  return '\uFEFF' + lines.join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'excel').toLowerCase();
    const dimension = (searchParams.get('dimension') || 'day').toLowerCase();
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const projectId = searchParams.get('projectId');
    const customStart = searchParams.get('startDate');
    const customEnd = searchParams.get('endDate');

    // Determine date range
    let startDate: string;
    let endDate: string;
    if (dimension === 'custom' && customStart && customEnd) {
      startDate = customStart;
      endDate = customEnd;
    } else {
      const range = getDateRange(dimension, date);
      startDate = range.start;
      endDate = range.end;
    }

    const dimensionLabels: Record<string, string> = {
      day: `按日（${startDate}）`,
      week: `按周（${startDate} 至 ${endDate}）`,
      month: `按月（${startDate} 至 ${endDate}）`,
      year: `按年（${startDate} 至 ${endDate}）`,
      custom: `自定义范围（${startDate} 至 ${endDate}）`,
    };
    const dimensionLabel = dimensionLabels[dimension] || dimension;

    // Fetch entries (no pagination, get all in range)
    const client = getSupabaseClient();
    let query = client
      .from('time_entries')
      .select('*, projects(id, name), users(id, real_name, username)')
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date', { ascending: true })
      .order('user_id', { ascending: true });

    // Non-admin users only see their own entries
    if (currentUser.role === 'user') {
      query = query.eq('user_id', currentUser.id);
    }

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    const entries = (data || []) as ExportEntry[];

    if (entries.length === 0) {
      return NextResponse.json(
        { error: `所选范围内无工时记录（${dimensionLabel}）` },
        { status: 404 }
      );
    }

    // Generate file based on format
    const dateRangeStr = `${startDate}_${endDate}`;
    const filenameBase = `工时日报_${dateRangeStr}`;

    if (format === 'excel' || format === 'xlsx') {
      const wb = buildExcelWorkbook(entries, dimensionLabel);
      const raw = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
      // Copy into a fresh ArrayBuffer to satisfy BlobPart typing (ArrayBufferLike vs ArrayBuffer)
      const ab = new ArrayBuffer(raw.byteLength);
      new Uint8Array(ab).set(raw);
      return new NextResponse(new Blob([ab], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filenameBase + '.xlsx')}`,
        },
      });
    }

    if (format === 'csv') {
      const csv = buildCSV(entries, dimensionLabel);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filenameBase + '.csv')}`,
        },
      });
    }

    if (format === 'markdown' || format === 'md') {
      const md = buildMarkdown(entries, dimensionLabel);
      return new NextResponse(md, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filenameBase + '.md')}`,
        },
      });
    }

    return NextResponse.json(
      { error: '不支持的导出格式，支持：excel、csv、markdown' },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '导出失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
