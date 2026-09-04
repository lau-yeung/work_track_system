'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch, apiDownload } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Award, Sparkles, Loader2, Zap, Bot, Download } from 'lucide-react';
import { toast } from 'sonner';

interface PerformanceScore {
  id: number;
  user_id: number;
  period_year: number;
  period_month: number;
  monthly_tasks: string | null;
  work_hours: string | null;
  score_explanation: string | null;
  completion: string | number;
  quality: string | number;
  progress: string | number;
  collaboration: string | number;
  discipline: string | number;
  total_score: string | number;
  used_external_ai: boolean | null;
  users?: { id: number; real_name: string; username: string };
}

interface UserOption {
  id: number;
  real_name: string;
  username: string;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const scoreColor = (v: string | number): string => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (Number.isNaN(n)) return '';
  if (n >= 90) return 'text-green-700 font-semibold';
  if (n >= 75) return 'text-[#1e3a5f] font-medium';
  if (n >= 60) return 'text-amber-600';
  return 'text-red-600 font-semibold';
};

const totalColor = (v: string | number): string => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (Number.isNaN(n)) return '';
  if (n >= 90) return 'bg-green-100 text-green-800';
  if (n >= 75) return 'bg-blue-100 text-[#1e3a5f]';
  if (n >= 60) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
};

function truncate(s: string | null, n = 50): string {
  if (!s) return '-';
  return s.length > n ? s.slice(0, n) + '...' : s;
}

export default function PerformancePage() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [scores, setScores] = useState<PerformanceScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const years = useMemo(() => {
    const ys = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() + 1];
    return Array.from(new Set(ys)).sort((a, b) => b - a);
  }, []);

  const fetchScores = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      const data = await apiFetch<{ data: PerformanceScore[] }>(`/api/performance?${params}`);
      setScores(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await apiFetch('/api/performance/generate', {
        method: 'POST',
        body: JSON.stringify({ year, month }),
      });
      toast.success('绩效生成完成');
      fetchScores();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async (format: 'excel' | 'csv' | 'markdown') => {
    const params = new URLSearchParams({ year: String(year), month: String(month), format });
    try {
      const { blob, filename } = await apiDownload(`/api/performance/export?${params}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败');
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center text-[#475569]">
        <Award className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>仅管理员可访问绩效评分管理页</p>
        <p className="text-xs mt-1">普通员工请在「我的绩效」查看个人评分</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f] flex items-center gap-2">
            <Award className="w-6 h-6" />
            绩效评分
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            月度任务项与五维评分由 AI 基于本月周报自动生成（总分 = 完成度35% + 质量30% + 进度20% + 协作10% + 纪律5%）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                导出
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('excel')}>Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')}>CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('markdown')}>Markdown</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleGenerate} disabled={generating} className="bg-[#1e3a5f] hover:bg-[#16304f]">
            {generating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />生成本月绩效</>
            )}
          </Button>
        </div>
      </div>

      <Card className="mb-4 border-[#e2e8f0]">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm">年份</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (<SelectItem key={y} value={String(y)}>{y}年</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">月份</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (<SelectItem key={m} value={String(m)}>{m}月</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#e2e8f0]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#1e3a5f]">
            {year}年{month}月 绩效评分
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-[#475569]">
              <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
              加载中...
            </div>
          ) : scores.length === 0 ? (
            <div className="p-8 text-center text-[#475569]">
              <Award className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>本月暂无绩效数据</p>
              <p className="text-xs mt-1">点击「生成本月绩效」由 AI 生成</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[80px]">成员</TableHead>
                    <TableHead className="min-w-[200px]">月度任务项</TableHead>
                    <TableHead className="min-w-[80px]">工时统计</TableHead>
                    <TableHead className="min-w-[160px]">得分说明</TableHead>
                    <TableHead className="min-w-[70px]">完成度</TableHead>
                    <TableHead className="min-w-[70px]">质量</TableHead>
                    <TableHead className="min-w-[70px]">进度</TableHead>
                    <TableHead className="min-w-[70px]">协作</TableHead>
                    <TableHead className="min-w-[70px]">纪律</TableHead>
                    <TableHead className="min-w-[80px]">总分</TableHead>
                    <TableHead className="min-w-[80px]">AI来源</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.users?.real_name || '-'}
                      </TableCell>
                      <TableCell className="whitespace-pre-wrap text-sm">
                        {truncate(s.monthly_tasks, 60)}
                      </TableCell>
                      <TableCell className="text-sm">{s.work_hours || '-'}h</TableCell>
                      <TableCell className="whitespace-pre-wrap text-xs text-[#475569]">
                        {truncate(s.score_explanation, 50)}
                      </TableCell>
                      <TableCell className={`text-sm ${scoreColor(s.completion)}`}>{String(s.completion)}</TableCell>
                      <TableCell className={`text-sm ${scoreColor(s.quality)}`}>{String(s.quality)}</TableCell>
                      <TableCell className={`text-sm ${scoreColor(s.progress)}`}>{String(s.progress)}</TableCell>
                      <TableCell className={`text-sm ${scoreColor(s.collaboration)}`}>{String(s.collaboration)}</TableCell>
                      <TableCell className={`text-sm ${scoreColor(s.discipline)}`}>{String(s.discipline)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-bold ${totalColor(s.total_score)}`}>
                          {String(s.total_score)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {s.used_external_ai ? (
                          <Badge variant="outline" className="text-green-700 bg-green-50 border-green-200">
                            <Zap className="w-3 h-3 mr-1" />外部AI
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-600 bg-gray-50 border-gray-200">
                            <Bot className="w-3 h-3 mr-1" />内置
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
