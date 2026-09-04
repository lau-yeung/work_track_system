'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

type Channel = 'none' | 'email' | 'wecom';

interface NotificationConfig {
  channel: Channel;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  wecom_webhook_default: string;
}

const DEFAULTS: NotificationConfig = {
  channel: 'none',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  wecom_webhook_default: '',
};

const KEYS: Array<keyof NotificationConfig> = [
  'channel',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_pass',
  'smtp_from',
  'wecom_webhook_default',
];

export function NotificationsTab() {
  const [cfg, setCfg] = useState<NotificationConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchCfg = async () => {
    setLoading(true);
    try {
      const raw = await apiFetch<{
        data: Array<{ config_key: string; config_value: string }>;
      }>('/api/system-configs');
      const map: Record<string, string> = {};
      for (const it of raw.data || []) map[it.config_key] = it.config_value;
      const next: NotificationConfig = { ...DEFAULTS };
      for (const k of KEYS) {
        if (map[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = map[k];
      }
      if (!['none', 'email', 'wecom'].includes(next.channel)) next.channel = 'none';
      setCfg(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载通知配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCfg();
  }, []);

  const save = async () => {
    if (cfg.channel === 'email') {
      if (!cfg.smtp_host) return toast.error('SMTP 主机必填');
      if (!cfg.smtp_from) return toast.error('发件人邮箱（smtp_from）必填');
      if (cfg.smtp_port && !/^\d+$/.test(cfg.smtp_port)) return toast.error('SMTP 端口必须是数字');
    }
    if (cfg.channel === 'wecom' && !cfg.wecom_webhook_default) {
      toast.warning('未填写默认企微机器人 webhook；将仅能对单独配置了 webhook 的成员发送');
    }
    setSaving(true);
    try {
      await apiFetch('/api/system-configs', {
        method: 'PUT',
        body: JSON.stringify({
          configs: KEYS.map((k) => ({
            config_key: `notification.${k}` === 'notification.channel' ? k : k,
            config_value: String((cfg as unknown as Record<string, unknown>)[k] ?? ''),
          })).concat([
            // system_configs 的 key 扁平存储
          ]),
        }),
      });
      toast.success('通知配置保存成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-[#64748b]">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> 加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-[#e2e8f0]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#1e3a5f]">通知通道</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>通道类型</Label>
            <RadioGroup
              value={cfg.channel}
              onValueChange={(v) => setCfg({ ...cfg, channel: v as Channel })}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="none" id="c-none" />
                <Label htmlFor="c-none" className="font-normal">
                  不启用（仅在系统内记录提醒日志，不实际推送）
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="email" id="c-email" />
                <Label htmlFor="c-email" className="font-normal">
                  邮件（SMTP）
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="wecom" id="c-wecom" />
                <Label htmlFor="c-wecom" className="font-normal">
                  企业微信群机器人
                </Label>
              </div>
            </RadioGroup>
          </div>

          {cfg.channel === 'none' && (
            <div className="rounded-md border border-[#fde68a] bg-[#fffbeb] p-3 text-sm text-[#92400e] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                当前不启用任何推送通道。管理员点"提醒未提交周报"时，系统仅记录提醒日志，不会实际触达员工。
                员工本人不会收到任何主动提示。
              </span>
            </div>
          )}

          {cfg.channel === 'email' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-1 space-y-2">
                <Label>SMTP 主机 *</Label>
                <Input
                  value={cfg.smtp_host}
                  onChange={(e) => setCfg({ ...cfg, smtp_host: e.target.value })}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="col-span-1 space-y-2">
                <Label>SMTP 端口</Label>
                <Input
                  value={cfg.smtp_port}
                  onChange={(e) => setCfg({ ...cfg, smtp_port: e.target.value })}
                  placeholder="587"
                />
              </div>
              <div className="col-span-1 space-y-2">
                <Label>SMTP 用户名</Label>
                <Input
                  value={cfg.smtp_user}
                  onChange={(e) => setCfg({ ...cfg, smtp_user: e.target.value })}
                />
              </div>
              <div className="col-span-1 space-y-2">
                <Label>SMTP 密码</Label>
                <Input
                  type="password"
                  value={cfg.smtp_pass}
                  onChange={(e) => setCfg({ ...cfg, smtp_pass: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>发件人地址 *</Label>
                <Input
                  value={cfg.smtp_from}
                  onChange={(e) => setCfg({ ...cfg, smtp_from: e.target.value })}
                  placeholder='Display Name &lt;noreply@example.com&gt;'
                />
              </div>
            </div>
          )}

          {cfg.channel === 'wecom' && (
            <div className="space-y-2">
              <Label>默认企业微信群机器人 Webhook</Label>
              <Input
                value={cfg.wecom_webhook_default}
                onChange={(e) => setCfg({ ...cfg, wecom_webhook_default: e.target.value })}
                placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=XXXX-XXX..."
              />
              <p className="text-xs text-[#64748b]">
                当用户表 `users.wecom_webhook` 未单独配置时，使用本默认机器人地址发送。发送时尝试从 users.phone 取手机号 @ 指定成员，
                若手机号为空则回退到 @all。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          className="bg-[#1e3a5f] hover:bg-[#16304f]"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? '保存中...' : '保存通知配置'}
        </Button>
      </div>
    </div>
  );
}
