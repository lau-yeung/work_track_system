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
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Save, Play, Loader2 } from 'lucide-react';

interface ConfigItem {
  id: number;
  config_key: string;
  config_value: string;
  config_type: string;
  description: string | null;
}

const configLabels: Record<string, string> = {
  daily_hour_limit: '单日工时上限',
  warning_threshold: '预警阈值(%)',
  critical_threshold: '严重阈值(%)',
  allow_historical_entry: '允许补填历史工时',
  enable_ai_features: '启用AI功能',
  allow_user_registration: '允许用户注册',
  registration_approval_required: '注册需审核',
  ai_provider: 'AI服务类型',
  ai_api_endpoint: 'API端点',
  ai_api_key: 'API密钥',
  ai_model: '模型名称',
};

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/system-configs', {
        method: 'PUT',
        body: JSON.stringify({
          configs: configs.map((c) => ({
            config_key: c.config_key,
            config_value: c.config_value,
          })),
        }),
      });
      toast.success('配置保存成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    // First save current configs, then test
    setTesting(true);
    try {
      // Save configs first so the test endpoint reads the latest values
      await apiFetch('/api/system-configs', {
        method: 'PUT',
        body: JSON.stringify({
          configs: configs.map((c) => ({
            config_key: c.config_key,
            config_value: c.config_value,
          })),
        }),
      });

      const result = await apiFetch<{
        success: boolean;
        message: string;
        config?: { endpoint: string; model: string; apiKey: string };
        response?: { content: string; promptTokens: number; completionTokens: number; totalTokens: number };
        elapsed?: number;
        httpStatus?: number;
        errorDetail?: string;
      }>('/api/ai/test-connection', { method: 'POST' });

      if (result.success) {
        toast.success(`${result.message} (${result.elapsed}ms)`);
      } else {
        toast.error(`${result.message}${result.errorDetail ? ': ' + result.errorDetail : ''}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '连接测试失败');
    } finally {
      setTesting(false);
    }
  };

  const updateConfig = (key: string, value: string) => {
    setConfigs((prev) =>
      prev.map((c) => (c.config_key === key ? { ...c, config_value: value } : c))
    );
  };

  if (!user || user.role !== 'admin') return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">系统配置</h1>
          <p className="text-sm text-[#475569] mt-1">管理系统参数和功能开关</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#1e3a5f] hover:bg-[#16304f]"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? '保存中...' : '保存配置'}
        </Button>
      </div>

      <div className="space-y-6">
        {/* 工时配置 */}
        <Card className="border-[#e2e8f0]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#1e3a5f]">
              工时配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
                ))}
              </div>
            ) : (
              configs
                .filter((c) =>
                  ['daily_hour_limit', 'warning_threshold', 'critical_threshold', 'allow_historical_entry'].includes(
                    c.config_key
                  )
                )
                .map((config) => (
                  <div key={config.id} className="flex items-start gap-4">
                    <div className="w-44 shrink-0">
                      <Label className="text-sm font-medium text-[#1e3a5f]">
                        {configLabels[config.config_key] || config.config_key}
                      </Label>
                      {config.description && (
                        <p className="text-xs text-[#94a3b8] mt-0.5">{config.description}</p>
                      )}
                    </div>
                    <div className="flex-1 max-w-xs">
                      {config.config_type === 'boolean' ? (
                        <Select
                          value={config.config_value}
                          onValueChange={(v) => updateConfig(config.config_key, v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">开启</SelectItem>
                            <SelectItem value="false">关闭</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={config.config_type === 'number' ? 'number' : 'text'}
                          value={config.config_value}
                          onChange={(e) => updateConfig(config.config_key, e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        {/* 用户注册配置 */}
        <Card className="border-[#e2e8f0]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#1e3a5f]">
              用户注册配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
                ))}
              </div>
            ) : (
              configs
                .filter((c) =>
                  ['allow_user_registration', 'registration_approval_required'].includes(c.config_key)
                )
                .map((config) => (
                  <div key={config.id} className="flex items-start gap-4">
                    <div className="w-44 shrink-0">
                      <Label className="text-sm font-medium text-[#1e3a5f]">
                        {configLabels[config.config_key] || config.config_key}
                      </Label>
                      {config.description && (
                        <p className="text-xs text-[#94a3b8] mt-0.5">{config.description}</p>
                      )}
                    </div>
                    <div className="flex-1 max-w-xs">
                      <Select
                        value={config.config_value}
                        onValueChange={(v) => updateConfig(config.config_key, v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">开启</SelectItem>
                          <SelectItem value="false">关闭</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        {/* AI配置 */}
        <Card className="border-[#e2e8f0]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#1e3a5f]">
              AI配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <>
                {/* Enable AI Features */}
                {configs
                  .filter((c) => c.config_key === 'enable_ai_features')
                  .map((config) => (
                    <div key={config.id} className="flex items-start gap-4">
                      <div className="w-44 shrink-0">
                        <Label className="text-sm font-medium text-[#1e3a5f]">
                          {configLabels[config.config_key] || config.config_key}
                        </Label>
                        {config.description && (
                          <p className="text-xs text-[#94a3b8] mt-0.5">{config.description}</p>
                        )}
                      </div>
                      <div className="flex-1 max-w-xs">
                        <Select
                          value={config.config_value}
                          onValueChange={(v) => updateConfig(config.config_key, v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">开启</SelectItem>
                            <SelectItem value="false">关闭</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}

                {/* AI Provider */}
                {configs
                  .filter((c) => c.config_key === 'ai_provider')
                  .map((config) => (
                    <div key={config.id} className="flex items-start gap-4">
                      <div className="w-44 shrink-0">
                        <Label className="text-sm font-medium text-[#1e3a5f]">
                          {configLabels[config.config_key] || config.config_key}
                        </Label>
                        {config.description && (
                          <p className="text-xs text-[#94a3b8] mt-0.5">{config.description}</p>
                        )}
                      </div>
                      <div className="flex-1 max-w-xs">
                        <Select
                          value={config.config_value}
                          onValueChange={(v) => updateConfig(config.config_key, v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="builtin">内置AI（规则引擎）</SelectItem>
                            <SelectItem value="external">外部AI（OpenAI/DeepSeek等）</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}

                {/* External AI Config - show only when provider is 'external' */}
                {configs.find((c) => c.config_key === 'ai_provider')?.config_value === 'external' && (
                  <>
                    {/* API Endpoint */}
                    {configs
                      .filter((c) => c.config_key === 'ai_api_endpoint')
                      .map((config) => (
                        <div key={config.id} className="flex items-start gap-4">
                          <div className="w-44 shrink-0">
                            <Label className="text-sm font-medium text-[#1e3a5f]">
                              {configLabels[config.config_key] || config.config_key}
                            </Label>
                            {config.description && (
                              <p className="text-xs text-[#94a3b8] mt-0.5">{config.description}</p>
                            )}
                          </div>
                          <div className="flex-1 max-w-md">
                            <Input
                              type="text"
                              value={config.config_value}
                              onChange={(e) => updateConfig(config.config_key, e.target.value)}
                              placeholder="https://api.deepseek.com"
                            />
                          </div>
                        </div>
                      ))}

                    {/* API Key */}
                    {configs
                      .filter((c) => c.config_key === 'ai_api_key')
                      .map((config) => (
                        <div key={config.id} className="flex items-start gap-4">
                          <div className="w-44 shrink-0">
                            <Label className="text-sm font-medium text-[#1e3a5f]">
                              {configLabels[config.config_key] || config.config_key}
                            </Label>
                            {config.description && (
                              <p className="text-xs text-[#94a3b8] mt-0.5">{config.description}</p>
                            )}
                          </div>
                          <div className="flex-1 max-w-md">
                            <Input
                              type="password"
                              value={config.config_value}
                              onChange={(e) => updateConfig(config.config_key, e.target.value)}
                              placeholder="sk-..."
                            />
                          </div>
                        </div>
                      ))}

                    {/* Model */}
                    {configs
                      .filter((c) => c.config_key === 'ai_model')
                      .map((config) => (
                        <div key={config.id} className="flex items-start gap-4">
                          <div className="w-44 shrink-0">
                            <Label className="text-sm font-medium text-[#1e3a5f]">
                              {configLabels[config.config_key] || config.config_key}
                            </Label>
                            {config.description && (
                              <p className="text-xs text-[#94a3b8] mt-0.5">{config.description}</p>
                            )}
                          </div>
                          <div className="flex-1 max-w-xs">
                            <Input
                              type="text"
                              value={config.config_value}
                              onChange={(e) => updateConfig(config.config_key, e.target.value)}
                              placeholder="deepseek-v4-flash / deepseek-v4-pro"
                            />
                          </div>
                        </div>
                      ))}

                    {/* Test Connection Button */}
                    <div className="flex items-start gap-4 pt-2">
                      <div className="w-44 shrink-0" />
                      <div className="flex-1 max-w-md">
                        <Button
                          type="button"
                          onClick={handleTestConnection}
                          disabled={testing}
                          variant="outline"
                          className="w-full sm:w-auto border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white"
                        >
                          {testing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              测试中...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              测试AI连接
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-[#94a3b8] mt-2">
                          保存当前配置并测试与AI服务的连通性，确认API密钥和端点是否正确
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
