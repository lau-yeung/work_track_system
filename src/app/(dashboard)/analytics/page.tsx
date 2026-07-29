'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  ComposedChart,
  Line,
} from 'recharts';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, TrendingUp, FileText, Loader2 } from 'lucide-react';

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

interface RiskAnalysisResult {
  project_id: number;
  project_name: string;
  risk_level: '低风险' | '中风险' | '高风险';
  risk_probability: number;
  usage_rate: number;
  estimated_hours: number;
  actual_hours: number;
  risk_reasons: string[];
  suggestions: string[];
}

interface ProjectSummaryResult {
  project_id: number;
  project_name: string;
  project_description: string;
  status: string;
  start_date: string;
  end_date: string;
  owner_name: string;
  estimated_hours: number;
  actual_hours: number;
  deviation: number;
  usage_rate: number;
  team_size: number;
  members: string[];
  summary_text: string;
  highlights: string[];
  risks: string[];
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

const riskLevelColors = {
  '低风险': 'bg-emerald-100 text-emerald-700',
  '中风险': 'bg-amber-100 text-amber-700',
  '高风险': 'bg-red-100 text-red-700',
};

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [trendData, setTrendData] = useState<{ dailyHours: Array<{ date: string; hours: number }>; cumulativeHours: Array<{ date: string; cumulative: number }> } | null>(null);
  const [deviations, setDeviations] = useState<DeviationItem[]>([]);
  const [riskAnalysis, setRiskAnalysis] = useState<RiskAnalysisResult | null>(null);
  const [projectSummary, setProjectSummary] = useState<ProjectSummaryResult | null>(null);
  const [analyzingRisk, setAnalyzingRisk] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

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

  const handleRiskAnalysis = async () => {
    if (!selectedProject) {
      toast.error('请先选择项目');
      return;
    }
    setAnalyzingRisk(true);
    try {
      const data = await apiFetch<{ data: RiskAnalysisResult }>('/api/ai/risk-analysis', {
        method: 'POST',
        body: JSON.stringify({ project_id: parseInt(selectedProject) }),
      });
      setRiskAnalysis(data.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '分析失败');
    } finally {
      setAnalyzingRisk(false);
    }
  };

  const handleProjectSummary = async () => {
    if (!selectedProject) {
      toast.error('请先选择项目');
      return;
    }
    setGeneratingSummary(true);
    try {
      const data = await apiFetch<{ data: ProjectSummaryResult }>('/api/ai/project-summary', {
        method: 'POST',
        body: JSON.stringify({ project_id: parseInt(selectedProject) }),
      });
      setProjectSummary(data.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const clearAnalysis = () => {
    setRiskAnalysis(null);
    setProjectSummary(null);
  };

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

      {/* Stats Cards */}
      {selectedProject && deviations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {(() => {
            const currentDeviation = deviations.find((d) => d.project_id === parseInt(selectedProject));
            if (!currentDeviation) return null;
            return [
              {
                label: '预估工时',
                value: `${currentDeviation.estimated_hours}h`,
                icon: TrendingUp,
                color: 'text-[#1e3a5f]',
                bg: 'bg-[#1e3a5f]/10',
              },
              {
                label: '实际工时',
                value: `${currentDeviation.actual_hours}h`,
                icon: FileText,
                color: 'text-amber-600',
                bg: 'bg-amber-50',
              },
              {
                label: '使用率',
                value: `${currentDeviation.usage_rate}%`,
                icon: CheckCircle2,
                color: currentDeviation.usage_rate >= 100 ? 'text-red-600' : currentDeviation.usage_rate >= 80 ? 'text-amber-600' : 'text-emerald-600',
                bg: currentDeviation.usage_rate >= 100 ? 'bg-red-50' : currentDeviation.usage_rate >= 80 ? 'bg-amber-50' : 'bg-emerald-50',
              },
              {
                label: '偏差状态',
                value: statusLabels[currentDeviation.deviation_status],
                icon: AlertTriangle,
                color: '',
                bg: statusColors[currentDeviation.deviation_status],
                isBadge: true,
              },
            ].map((stat) => (
              <Card key={stat.label} className="border-[#e2e8f0]">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-[#475569]">
                    {stat.label}
                  </CardTitle>
                  <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  {stat.isBadge ? (
                    <Badge variant="default" className={`${stat.bg}`}>
                      {stat.value}
                    </Badge>
                  ) : (
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  )}
                </CardContent>
              </Card>
            ));
          })()}
        </div>
      )}

      {/* AI Features Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Risk Analysis Card */}
        <Card className="border-[#e2e8f0]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-[#1e3a5f]">
              AI 风险分析
            </CardTitle>
            <Button
              onClick={handleRiskAnalysis}
              disabled={!selectedProject || analyzingRisk}
              className="bg-[#1e3a5f] hover:bg-[#16304f] text-sm"
            >
              {analyzingRisk ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  分析中...
                </>
              ) : (
                'AI 风险分析'
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {!riskAnalysis ? (
              <div className="py-8 text-center text-[#475569] text-sm">
                点击上方按钮进行AI风险分析
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#475569]">风险等级</span>
                  <Badge className={`${riskLevelColors[riskAnalysis.risk_level]}`}>
                    {riskAnalysis.risk_level}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#475569]">风险概率</span>
                  <span className="text-sm font-bold text-[#1e3a5f]">{riskAnalysis.risk_probability}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#475569]">工时使用率</span>
                  <span className="text-sm font-bold text-[#1e3a5f]">{riskAnalysis.usage_rate}%</span>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-[#475569] mb-2">风险原因：</p>
                  <ul className="space-y-1">
                    {riskAnalysis.risk_reasons.map((reason, index) => (
                      <li key={index} className="text-sm text-[#1e3a5f] flex items-start gap-2">
                        <span className="text-red-500 mt-1">-</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-[#475569] mb-2">管理建议：</p>
                  <ul className="space-y-1">
                    {riskAnalysis.suggestions.map((suggestion, index) => (
                      <li key={index} className="text-sm text-[#1e3a5f] flex items-start gap-2">
                        <span className="text-emerald-500 mt-1">-</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Summary Card */}
        <Card className="border-[#e2e8f0]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-[#1e3a5f]">
              AI 项目总结
            </CardTitle>
            <Button
              onClick={handleProjectSummary}
              disabled={!selectedProject || generatingSummary}
              className="bg-[#1e3a5f] hover:bg-[#16304f] text-sm"
            >
              {generatingSummary ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                'AI 项目总结'
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {!projectSummary ? (
              <div className="py-8 text-center text-[#475569] text-sm">
                点击上方按钮生成项目总结
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#475569]">项目名称</span>
                  <span className="text-sm font-bold text-[#1e3a5f]">{projectSummary.project_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#475569]">项目状态</span>
                  <Badge variant="default">{projectSummary.status}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#475569]">团队规模</span>
                  <span className="text-sm font-bold text-[#1e3a5f]">{projectSummary.team_size}人</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#475569]">负责人</span>
                  <span className="text-sm font-bold text-[#1e3a5f]">{projectSummary.owner_name}</span>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-[#475569] mb-2">项目总结：</p>
                  <p className="text-sm text-[#1e3a5f] leading-relaxed">{projectSummary.summary_text}</p>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-[#475569] mb-2">项目亮点：</p>
                  <ul className="space-y-1">
                    {projectSummary.highlights.map((highlight, index) => (
                      <li key={index} className="text-sm text-emerald-700 flex items-start gap-2">
                        <span className="text-emerald-500 mt-1">+</span>
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-[#475569] mb-2">风险点：</p>
                  <ul className="space-y-1">
                    {projectSummary.risks.map((risk, index) => (
                      <li key={index} className="text-sm text-red-700 flex items-start gap-2">
                        <span className="text-red-500 mt-1">!</span>
                        {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Clear Analysis Button */}
      {(riskAnalysis || projectSummary) && (
        <div className="mb-6">
          <Button variant="outline" onClick={clearAnalysis}>
            清除分析结果
          </Button>
        </div>
      )}

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
