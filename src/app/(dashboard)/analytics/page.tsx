'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
} from 'recharts';
import { toast } from 'sonner';

interface ProjectOption {
  id: number;
  name: string;
  status: string;
}

interface DeviationItem {
  project_id: number;
  project_name: string;
  estimated_hours: number;
  actual_hours: number;
  remaining_hours: number;
  deviation: number;
  deviation_rate: number;
  usage_rate: number;
  deviation_status: 'normal' | 'warning' | 'critical';
  project_status: string;
}

const statusColors = {
  normal: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

const statusLabels = {
  normal: '正常',
  warning: '超支风险',
  critical: '严重超支',
};

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [trendData, setTrendData] = useState<{ dailyHours: Array<{ date: string; hours: number }>; cumulativeHours: Array<{ date: string; cumulative: number }> } | null>(null);
  const [deviations, setDeviations] = useState<DeviationItem[]>([]);

  useEffect(() => {
    apiFetch<{ data: ProjectOption[] }>('/api/projects/my')
      .then((data) => {
        if (data.data) {
          setProjects(data.data);
          if (data.data.length > 0 && !selectedProject) {
            setSelectedProject(String(data.data[0].id));
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedProject || selectedProject === 'all') return;
    apiFetch<{ dailyHours: Array<{ date: string; hours: number }>; cumulativeHours: Array<{ date: string; cumulative: number }> }>(`/api/analytics/trend?projectId=${selectedProject}`)
      .then((data) => setTrendData(data))
      .catch(() => {});
  }, [selectedProject]);

  useEffect(() => {
    apiFetch<{ data: DeviationItem[] }>('/api/analytics/deviation')
      .then((data) => {
        if (data.data) setDeviations(data.data);
      })
      .catch(() => {});
  }, []);

  // Merge trend data for composed chart
  const chartData = trendData
    ? trendData.dailyHours.map((d) => {
        const cumulative = trendData.cumulativeHours.find((c) => c.date === d.date);
        return {
          date: d.date.substring(5), // MM-DD
          每日工时: d.hours,
          累计工时: cumulative?.cumulative || 0,
        };
      })
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">数据分析</h1>
        <p className="text-sm text-[#475569] mt-1">多维度工时数据分析</p>
      </div>

      {/* Trend Chart */}
      <Card className="border-[#e2e8f0] mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-[#1e3a5f]">
            工时趋势分析
          </CardTitle>
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="选择项目" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-[#475569] text-sm">
              请选择项目查看趋势数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} label={{ value: '每日(h)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} label={{ value: '累计(h)', angle: 90, position: 'insideRight', style: { fontSize: 12 } }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="每日工时" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="累计工时" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Deviation Analysis */}
      <Card className="border-[#e2e8f0]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#1e3a5f]">
            工时偏差分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deviations.length === 0 ? (
            <div className="py-8 text-center text-[#475569] text-sm">
              暂无数据
            </div>
          ) : (
            <div className="space-y-3">
              {deviations.map((d) => (
                <div
                  key={d.project_id}
                  className="flex items-center gap-4 p-4 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-[#1e3a5f]">{d.project_name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          statusColors[d.deviation_status]
                        }`}
                      >
                        {statusLabels[d.deviation_status]}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm text-[#475569]">
                      <div>
                        <span className="text-xs text-[#94a3b8]">预估</span>
                        <p className="font-medium text-[#1e3a5f]">{d.estimated_hours}h</p>
                      </div>
                      <div>
                        <span className="text-xs text-[#94a3b8]">实际</span>
                        <p className="font-medium text-[#1e3a5f]">{d.actual_hours}h</p>
                      </div>
                      <div>
                        <span className="text-xs text-[#94a3b8]">偏差</span>
                        <p className={`font-medium ${d.deviation > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {d.deviation > 0 ? '+' : ''}{d.deviation}h
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-[#94a3b8]">使用率</span>
                        <p className={`font-medium ${
                          d.usage_rate >= 100 ? 'text-red-600' : d.usage_rate >= 80 ? 'text-amber-600' : 'text-emerald-600'
                        }`}>
                          {d.usage_rate}%
                        </p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          d.usage_rate >= 100
                            ? 'bg-red-500'
                            : d.usage_rate >= 80
                            ? 'bg-amber-400'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(d.usage_rate, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
