'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TrendingUp, Loader2, Zap, Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface PerformanceScore {
  id: number;
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
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const dims = [
  { key: 'completion', label: '完成度', weight: '35%' },
  { key: 'quality', label: '质量', weight: '30%' },
  { key: 'progress', label: '进度', weight: '20%' },
  { key: 'collaboration', label: '协作', weight: '10%' },
  { key: 'discipline', label: '纪律', weight: '5%' },
] as const;

const barColor = (n: number): string => {
  if (n >= 90) return 'bg-green-500';
  if (n >= 75) return 'bg-[#1e3a5f]';
  if (n >= 60) return 'bg-amber-500';
  return 'bg-red-500';
};

const num = (v: string | number): number => (typeof v === 'number' ? v : parseFloat(String(v)) || 0);

export default function MyPerformancePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [score, setScore] = useState<PerformanceScore | null>(null);
  const [loading, setLoading] = useState(true);

  const years = useMemo(() => {
    const ys = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() + 1];
    return Array.from(new Set(ys)).sort((a, b) => b - a);
  }, []);

  const fetchScore = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      const data = await apiFetch<{ data: PerformanceScore[] }>(`/api/performance?${params}`);
      setScore(data.data && data.data.length > 0 ? data.data[0] : null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f] flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            我的绩效
          </h1>
          <p className="text-sm text-[#475569] mt-1">查看本人月度绩效评分（由管理员生成）</p>
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
            {score?.used_external_ai != null && (
              <div className="ml-auto">
                {score.used_external_ai ? (
                  <Badge variant="outline" className="text-green-700 bg-green-50 border-green-200">
                    <Zap className="w-3 h-3 mr-1" />外部AI生成
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-gray-600 bg-gray-50 border-gray-200">
                    <Bot className="w-3 h-3 mr-1" />内置/兜底
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="p-8 text-center text-[#475569]">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
          加载中...
        </div>
      ) : !score ? (
        <Card className="border-[#e2e8f0]">
          <CardContent className="p-8 text-center text-[#475569]">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>{year}年{month}月 暂无绩效数据</p>
            <p className="text-xs mt-1">绩效由管理员统一生成，请稍后查看</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* 总分 */}
          <Card className="border-[#e2e8f0]">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-[#1e3a5f]">
                {year}年{month}月 绩效总分
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-bold text-[#1e3a5f]">
                  {String(score.total_score)}
                </span>
                <span className="text-lg text-[#475569] mb-1">/ 100</span>
                <span className="ml-auto text-sm text-[#475569]">
                  工时统计：{score.work_hours || '-'}h
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 五维评分 */}
          <Card className="border-[#e2e8f0]">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-[#1e3a5f]">五维评分</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dims.map((d) => {
                const n = num(score[d.key]);
                return (
                  <div key={d.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[#1e293b]">
                        {d.label} <span className="text-xs text-[#94a3b8]">（权重 {d.weight}）</span>
                      </span>
                      <span className="text-sm font-semibold text-[#1e3a5f]">{n}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className={`${barColor(n)} h-2.5 rounded-full transition-all`}
                        style={{ width: `${n}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* 月度任务项 + 得分说明 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-[#e2e8f0]">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-[#1e3a5f]">月度任务项</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-[#1e293b]">
                  {score.monthly_tasks || '（暂无）'}
                </p>
              </CardContent>
            </Card>
            <Card className="border-[#e2e8f0]">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-[#1e3a5f]">得分说明</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-[#1e293b]">
                  {score.score_explanation || '（暂无）'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
