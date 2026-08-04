'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sparkles, Loader2, FileText, AlertCircle, Database, Copy, CheckCircle, Calendar } from 'lucide-react';
import { toast } from 'sonner';

type Dimension = 'week' | 'last_week' | 'month' | 'last_month' | 'year' | 'last_year' | 'custom';

interface WorkSummary {
  id: number;
  dimension: Dimension;
  period_start: string;
  period_end: string;
  summary_content: string;
  generated_at: string;
  users?: { id: number; real_name: string; username: string };
  projects?: { id: number; name: string } | null;
}

interface ProjectOption {
  id: number;
  name: string;
}

const DIMENSION_OPTIONS: { value: Dimension; label: string; group: string }[] = [
  { value: 'week', label: '本周', group: '快捷维度' },
  { value: 'last_week', label: '上周', group: '快捷维度' },
  { value: 'month', label: '本月', group: '快捷维度' },
  { value: 'last_month', label: '上月', group: '快捷维度' },
  { value: 'year', label: '本年', group: '快捷维度' },
  { value: 'last_year', label: '上年', group: '快捷维度' },
  { value: 'custom', label: '自定义', group: '自定义' },
];

const DIMENSION_LABELS: Record<Dimension, string> = {
  week: '本周',
  last_week: '上周',
  month: '本月',
  last_month: '上月',
  year: '本年',
  last_year: '上年',
  custom: '自定义',
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('zh-CN');
};

// Calculate date range for display
function getDateRangeDisplay(dimension: Dimension, startDate?: string, endDate?: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d: Date, days: number) => {
    const r = new Date(d);
    r.setDate(d.getDate() + days);
    return r;
  };

  switch (dimension) {
    case 'week': {
      const day = now.getDay() || 7;
      const monday = addDays(now, -day + 1);
      const sunday = addDays(monday, 6);
      return `${fmt(monday)} ~ ${fmt(sunday)}`;
    }
    case 'last_week': {
      const day = now.getDay() || 7;
      const thisMonday = addDays(now, -day + 1);
      const lastMonday = addDays(thisMonday, -7);
      const lastSunday = addDays(lastMonday, 6);
      return `${fmt(lastMonday)} ~ ${fmt(lastSunday)}`;
    }
    case 'month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return `${fmt(firstDay)} ~ ${fmt(lastDay)}`;
    }
    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return `${fmt(firstDay)} ~ ${fmt(lastDay)}`;
    }
    case 'year': {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      const lastDay = new Date(now.getFullYear(), 11, 31);
      return `${fmt(firstDay)} ~ ${fmt(lastDay)}`;
    }
    case 'last_year': {
      const year = now.getFullYear() - 1;
      return `${year}-01-01 ~ ${year}-12-31`;
    }
    case 'custom': {
      if (startDate && endDate) return `${startDate} ~ ${endDate}`;
      return '请选择日期范围';
    }
    default:
      return '-';
  }
}

export default function WorkSummaryPage() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<WorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dimension, setDimension] = useState<Dimension>('week');
  const [projectId, setProjectId] = useState<string>('all');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<WorkSummary | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [initSql, setInitSql] = useState('');
  const [migrationSql, setMigrationSql] = useState('');
  const [initLoading, setInitLoading] = useState(false);
  const [copied, setCopied] = useState<'create' | 'migration' | null>(null);
  const [customStartDate, setCustomStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const fetchSummaries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ dimension });
      if (projectId && projectId !== 'all') params.set('projectId', projectId);
      const data = await apiFetch<{ data: WorkSummary[] }>(`/api/ai/work-summary?${params}`);
      setSummaries(data.data || []);
      setTableMissing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      if (msg.includes('Could not find the table') || msg.includes('42P01') || msg.includes('尚未创建')) {
        setTableMissing(true);
        fetchInitSql();
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchInitSql = async () => {
    try {
      const data = await apiFetch<{ sql: string; migrationSql: string }>('/api/init-ai-tables');
      setInitSql(data.sql || '');
      setMigrationSql(data.migrationSql || '');
    } catch {
      // ignore
    }
  };

  const handleInitTable = async () => {
    setInitLoading(true);
    try {
      const data = await apiFetch<{ success: boolean; message: string; sql?: string; migrationSql?: string }>('/api/init-ai-tables', {
        method: 'POST',
      });
      if (data.success) {
        toast.success('工作总结表初始化成功');
        setTableMissing(false);
        fetchSummaries();
      } else {
        toast.error(data.message || '自动建表失败');
        if (data.sql) setInitSql(data.sql);
        if (data.migrationSql) setMigrationSql(data.migrationSql);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '初始化失败';
      toast.error(msg);
      fetchInitSql();
    } finally {
      setInitLoading(false);
    }
  };

  const handleCopySql = async (type: 'create' | 'migration') => {
    const sql = type === 'create' ? initSql : migrationSql;
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(type);
      toast.success(type === 'create' ? '建表SQL已复制' : '迁移SQL已复制');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  };

  const fetchProjects = async () => {
    try {
      const data = await apiFetch<{ data: ProjectOption[] }>('/api/projects/my');
      if (data.data) setProjects(data.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchSummaries();
  }, [dimension, projectId]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleGenerate = async () => {
    if (tableMissing) {
      toast.error('请先初始化工作总结表');
      return;
    }
    if (dimension === 'custom' && (!customStartDate || !customEndDate)) {
      toast.error('请选择自定义日期范围');
      return;
    }
    if (dimension === 'custom' && customStartDate > customEndDate) {
      toast.error('开始日期不能晚于结束日期');
      return;
    }

    setGenerating(true);
    try {
      const body: Record<string, unknown> = { dimension };
      if (dimension === 'custom') {
        body.startDate = customStartDate;
        body.endDate = customEndDate;
      }
      if (projectId && projectId !== 'all') body.projectId = parseInt(projectId);

      const resp = await apiFetch<{ data: WorkSummary; saved?: boolean }>('/api/ai/work-summary', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (resp.data) {
        const saved = resp.saved;
        
        if (saved !== false) {
          // 保存成功，刷新列表
          toast.success('工作总结生成成功');
          fetchSummaries();
        } else {
          // 保存失败（可能是数据库约束限制），添加到临时显示
          toast.warning('总结已生成但未保存，请执行数据库迁移');
          // 自动获取迁移SQL
          fetchInitSql();
        }
        setSelectedSummary(resp.data);
        
        // 将新生成的总结添加到列表（如果已保存则刷新，未保存则临时添加）
        if (saved === false) {
          setSummaries(prev => {
            const exists = prev.some(s => s.id === resp.data.id);
            if (exists) return prev;
            return [resp.data, ...prev];
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败';
      if (msg.includes('Could not find the table') || msg.includes('42P01') || msg.includes('尚未创建')) {
        setTableMissing(true);
        toast.error('工作总结表未创建，请先初始化');
        fetchInitSql();
      } else {
        toast.error(msg);
      }
    } finally {
      setGenerating(false);
    }
  };

  const currentDateRange = getDateRangeDisplay(dimension, customStartDate, customEndDate);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">工作总结</h1>
          <p className="text-sm text-[#475569] mt-1">AI智能生成工作总结报告</p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating || tableMissing}
          className="bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-50"
          title={tableMissing ? '请先初始化工作总结表' : ''}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              生成本周期总结
            </>
          )}
        </Button>
      </div>

      {/* Table Missing Warning */}
      {tableMissing && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 mb-1">工作总结表尚未创建</h3>
                <p className="text-sm text-amber-800 mb-3">
                  工作总结功能需要先在数据库中创建 <code className="bg-amber-200 px-1 rounded">work_summaries</code> 表。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleInitTable}
                    disabled={initLoading}
                    className="bg-amber-600 hover:bg-amber-700"
                    size="sm"
                  >
                    {initLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        初始化中...
                      </>
                    ) : (
                      <>
                        <Database className="w-4 h-4 mr-1" />
                        自动初始化
                      </>
                    )}
                  </Button>
                  {initSql && (
                    <Button variant="outline" size="sm" onClick={() => handleCopySql('create')}>
                      {copied === 'create' ? (
                        <><CheckCircle className="w-4 h-4 mr-1 text-green-500" />已复制建表SQL</>
                      ) : (
                        <><Copy className="w-4 h-4 mr-1" />复制建表SQL</>
                      )}
                    </Button>
                  )}
                  {migrationSql && (
                    <Button variant="outline" size="sm" onClick={() => handleCopySql('migration')}>
                      {copied === 'migration' ? (
                        <><CheckCircle className="w-4 h-4 mr-1 text-green-500" />已复制迁移SQL</>
                      ) : (
                        <><Copy className="w-4 h-4 mr-1" />复制迁移SQL（更新维度）</>
                      )}
                    </Button>
                  )}
                </div>
                {initSql && (
                  <div className="mt-3">
                    <p className="text-xs text-amber-700 mb-2">
                      复制后，请在 <strong>Supabase SQL Editor</strong> 中执行：
                    </p>
                    <pre className="bg-amber-100 p-3 rounded text-xs overflow-x-auto max-h-32">
                      {initSql}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters & Quick Presets */}
      <div className="mb-4">
        {/* Quick Dimension Buttons */}
        <div className="mb-3">
          <Label className="text-sm mb-2 block">时间维度</Label>
          <div className="flex flex-wrap gap-2">
            {DIMENSION_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={dimension === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDimension(opt.value)}
                className={
                  dimension === opt.value
                    ? 'bg-[#1e3a5f] hover:bg-[#16304f]'
                    : ''
                }
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom Date Range (only when custom is selected) */}
        {dimension === 'custom' && (
          <div className="mb-3 p-3 bg-gray-50 rounded border border-gray-200">
            <Label className="text-sm mb-2 block">自定义日期范围</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#475569]" />
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-40"
                />
                <span className="text-[#475569]">至</span>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
          </div>
        )}

        {/* Current Date Range Display */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="text-sm text-[#475569]">
            <span className="font-medium">{DIMENSION_LABELS[dimension]}：</span>
            <span>{currentDateRange}</span>
          </div>

          {/* Project Filter */}
          <div className="flex items-center gap-2 ml-auto">
            <Label className="text-sm">项目:</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="全部项目" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部项目</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <Card className="lg:col-span-1 border-[#e2e8f0]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#1e3a5f]">
              历史总结
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 text-center text-[#475569]">加载中...</div>
            ) : tableMissing ? (
              <div className="p-8 text-center text-[#475569]">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>请先初始化工作总结表</p>
              </div>
            ) : summaries.length === 0 ? (
              <div className="p-8 text-center text-[#475569]">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>暂无工作总结</p>
                <p className="text-xs mt-1">点击右上角"生成本周期总结"按钮</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>周期</TableHead>
                    <TableHead>项目</TableHead>
                    <TableHead>生成时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((s) => (
                    <TableRow
                      key={s.id}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedSummary?.id === s.id ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelectedSummary(s)}
                    >
                      <TableCell className="font-medium">
                        {formatDate(s.period_start)} ~ {formatDate(s.period_end)}
                      </TableCell>
                      <TableCell>{s.projects?.name || '全部'}</TableCell>
                      <TableCell className="text-sm text-[#475569]">
                        {new Date(s.generated_at).toLocaleString('zh-CN')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail */}
        <Card className="lg:col-span-2 border-[#e2e8f0]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#1e3a5f]">
              {selectedSummary ? (
                <>
                  {DIMENSION_LABELS[selectedSummary.dimension]} - {formatDate(selectedSummary.period_start)} 至{' '}
                  {formatDate(selectedSummary.period_end)}
                </>
              ) : (
                '总结详情'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedSummary ? (
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {selectedSummary.summary_content}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-[#475569]">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{tableMissing ? '请先初始化工作总结表' : '从左侧列表选择一条总结查看详情'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}