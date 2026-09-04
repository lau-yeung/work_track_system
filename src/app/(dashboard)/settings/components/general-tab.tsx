'use client';

import { useState } from 'react';
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
import { Save, Play, Loader2 } from 'lucide-react';

export interface ConfigItem {
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

interface Props {
  configs: ConfigItem[];
  loading: boolean;
  onChange: (next: ConfigItem[]) => void;
  onSaved?: () => void;
}

export function GeneralTab({ configs, loading, onChange, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const updateConfig = (key: string, value: string) => {
    onChange(
      configs.map((c) => (c.config_key === key ? { ...c, config_value: value } : c))
    );
  };

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
      toast.success('通用配置保存成功');
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      // Save first so endpoint uses latest values
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
        elapsed?: number;
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

  const renderBoolean = (cfg: ConfigItem) => (
    <Select value={cfg.config_value} onValueChange={(v) => updateConfig(cfg.config_key, v)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="true">开启</SelectItem>
        <SelectItem value="false">关闭</SelectItem>
      </SelectContent>
    </Select>
  );

  const renderRow = (cfg: ConfigItem, maxW = 'max-w-xs') => (
    <div key={cfg.id} className="flex items-start gap-4">
      <div className="w-44 shrink-0">
        <Label className="text-sm font-medium text-[#1e3a5f]">
          {configLabels[cfg.config_key] || cfg.config_key}
        </Label>
        {cfg.description && (
          <p className="text-xs text-[#94a3b8] mt-0.5">{cfg.description}</p>
        )}
      </div>
      <div className={`flex-1 ${maxW}`}>
        {cfg.config_type === 'boolean' ? (
          renderBoolean(cfg)
        ) : (
          <Input
            type={cfg.config_type === 'number' ? 'number' : cfg.config_key.includes('key') ? 'password' : 'text'}
            value={cfg.config_value}
            onChange={(e) => updateConfig(cfg.config_key, e.target.value)}
            placeholder={
              cfg.config_key === 'ai_api_endpoint'
                ? 'https://api.deepseek.com'
                : cfg.config_key === 'ai_model'
                  ? 'deepseek-v4-flash'
                  : cfg.config_key === 'ai_api_key'
                    ? 'sk-...'
                    : undefined
            }
          />
        )}
      </div>
    </div>
  );

  const aiProvider = configs.find((c) => c.config_key === 'ai_provider');

  return (
    <div className="space-y-6">
      {/* 工时配置 */}
      <Card className="border-[#e2e8f0]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#1e3a5f]">工时配置</CardTitle>
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
              .map((c) => renderRow(c))
          )}
        </CardContent>
      </Card>

      {/* 用户注册 */}
      <Card className="border-[#e2e8f0]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#1e3a5f]">用户注册配置</CardTitle>
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
              .map((c) => renderRow(c))
          )}
        </CardContent>
      </Card>

      {/* AI 配置 */}
      <Card className="border-[#e2e8f0]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#1e3a5f]">AI配置</CardTitle>
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
              {configs
                .filter((c) => c.config_key === 'enable_ai_features')
                .map((c) => renderRow(c))}
              {configs
                .filter((c) => c.config_key === 'ai_provider')
                .map((c) => renderRow(c))}
              {aiProvider?.config_value === 'external' && (
                <>
                  {configs
                    .filter((c) => c.config_key === 'ai_api_endpoint')
                    .map((c) => renderRow(c, 'max-w-md'))}
                  {configs
                    .filter((c) => c.config_key === 'ai_api_key')
                    .map((c) => renderRow(c, 'max-w-md'))}
                  {configs
                    .filter((c) => c.config_key === 'ai_model')
                    .map((c) => renderRow(c))}
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
                        保存当前配置并测试与AI服务的连通性
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Bottom action for general tab */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#1e3a5f] hover:bg-[#16304f]"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? '保存中...' : '保存通用配置'}
        </Button>
      </div>
    </div>
  );
}
