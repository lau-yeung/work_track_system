'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban, Clock, TrendingUp, Activity } from 'lucide-react';

interface OverviewData {
  totalProjects: number;
  activeProjects: number;
  totalHours: number;
  monthlyHours: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<OverviewData>('/api/analytics/overview')
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    {
      label: '总项目数',
      value: data?.totalProjects ?? '-',
      icon: FolderKanban,
      color: 'text-[#1e3a5f]',
      bg: 'bg-[#1e3a5f]/10',
    },
    {
      label: '进行中项目',
      value: data?.activeProjects ?? '-',
      icon: Activity,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: '总工时',
      value: data ? `${data.totalHours}h` : '-',
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: '本月工时',
      value: data ? `${data.monthlyHours}h` : '-',
      icon: TrendingUp,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">工作台</h1>
        <p className="text-sm text-[#475569] mt-1">
          欢迎回来，{user?.real_name}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
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
              {loading ? (
                <div className="h-8 w-20 bg-gray-100 animate-pulse rounded" />
              ) : (
                <p className="text-2xl font-bold text-[#1e3a5f]">{stat.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-[#e2e8f0]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#1e3a5f]">
              快捷操作
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <a
              href="/time-entries"
              className="flex items-center gap-3 p-3 rounded-lg bg-[#f8fafc] hover:bg-[#f1f5f9] transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1e3a5f]">填报工时</p>
                <p className="text-xs text-[#475569]">记录今日工作工时</p>
              </div>
            </a>
            <a
              href="/projects"
              className="flex items-center gap-3 p-3 rounded-lg bg-[#f8fafc] hover:bg-[#f1f5f9] transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center">
                <FolderKanban className="w-4 h-4 text-[#1e3a5f]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1e3a5f]">查看项目</p>
                <p className="text-xs text-[#475569]">浏览参与的项目</p>
              </div>
            </a>
          </CardContent>
        </Card>

        <Card className="border-[#e2e8f0]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#1e3a5f]">
              角色说明
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#1e3a5f]" />
                <span className="text-[#475569]">管理员：全部功能权限</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[#475569]">项目负责人：创建/管理项目、填报工时</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[#475569]">普通用户：查看参与项目、填报工时</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
