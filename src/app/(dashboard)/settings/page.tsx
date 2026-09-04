'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { GeneralTab, ConfigItem } from './components/general-tab';
import { TemplatesTab } from './components/templates-tab';
import { NotificationsTab } from './components/notifications-tab';

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.role === 'admin') {
      apiFetch<{ data: ConfigItem[] }>('/api/system-configs')
        .then((data) => {
          if (data.data) setConfigs(data.data);
        })
        .catch(() => toast.error('加载配置失败'))
        .finally(() => setLoading(false));
    }
  }, [user]);

  if (!user || user.role !== 'admin') return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">系统配置</h1>
          <p className="text-sm text-[#475569] mt-1">管理系统参数、模板与通知通道</p>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="general">通用</TabsTrigger>
          <TabsTrigger value="templates">模板管理</TabsTrigger>
          <TabsTrigger value="notifications">通知通道</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab
            configs={configs}
            loading={loading}
            onChange={(next) => setConfigs(next)}
          />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
