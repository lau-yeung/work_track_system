'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch, apiDownload } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  CalendarCheck2,
  Plus,
  Trash2,
  Pencil,
  Sparkles,
  Loader2,
  Zap,
  Bot,
  Download,
  FileText,
  Link as LinkIcon,
  Upload,
  CalendarRange,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';

interface PlanItem {
  id: string;
  text: string;
  done: boolean;
}

interface ArtifactItem {
  type: 'link' | 'file';
  name: string;
  url: string;
  size?: number;
}

interface WeeklyReport {
  id: number;
  user_id: number;
  period_year: number;
  period_month: number;
  week_index: number;
  week_start: string;
  week_end: string;
  this_week_plan: PlanItem[];
  actual_completed: string | null;
  uncompleted_reason: string | null;
  next_week_plan: PlanItem[];
  output_artifacts: ArtifactItem[] | null;
  used_external_ai: boolean | null;
  generated_at: string | null;
  users?: { id: number; real_name: string; username: string };
}

interface MonthWeek {
  weekIndex: number;
  weekStart: string;
  weekEnd: string;
}

interface UserOption {
  id: number;
  real_name: string;
  username: string;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
let idCounter = 0;
const newItemId = () => `item-${Date.now()}-${++idCounter}`;

export default function WeeklyReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [weekIndex, setWeekIndex] = useState(1);
  const [userId, setUserId] = useState<string>(isAdmin ? 'all' : String(user?.id || ''));

  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [weeks, setWeeks] = useState<MonthWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);

  const [generating, setGenerating] = useState<Record<number, boolean>>({});
  const [editor, setEditor] = useState<WeeklyReport | null>(null);
  const [editorPlan, setEditorPlan] = useState<PlanItem[]>([]);
  const [editorNext, setEditorNext] = useState<PlanItem[]>([]);
  const [editorReason, setEditorReason] = useState('');
  const [newPlanText, setNewPlanText] = useState('');
  const [newNextText, setNewNextText] = useState('');
  const [savingEditor, setSavingEditor] = useState(false);

  // 工作期配置（管理员设置）
  const [workConfig, setWorkConfig] = useState<{ work_start: string; work_end: string } | null>(null);
  const [cfgStart, setCfgStart] = useState('');
  const [cfgEnd, setCfgEnd] = useState('');
  const [savingCfg, setSavingCfg] = useState(false);

  // 月度目标选择器（从月度目标添加计划）
  const [goalPicker, setGoalPicker] = useState<null | 'this' | 'next'>(null);
  const [goalOptions, setGoalOptions] = useState<{ id: number; goals: string }[]>([]);
  const [goalSelected, setGoalSelected] = useState<Set<number>>(new Set());
  const [loadingGoals, setLoadingGoals] = useState(false);

  // 输出产物编辑（附件+链接）
  const [editorArtifacts, setEditorArtifacts] = useState<ArtifactItem[]>([]);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const years = useMemo(() => {
    const ys = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() + 1];
    return Array.from(new Set(ys)).sort((a, b) => b - a);
  }, []);

  const fetchUsers = async () => {
    if (!isAdmin) return;
    try {
      const data = await apiFetch<{ data: UserOption[] }>(`/api/users?pageSize=200`);
      setUsers((data.data || []).filter((u) => u.username !== 'admin'));
    } catch {
      // ignore
    }
  };

  const ensureInit = async (targetYear: number, targetMonth: number, targetWeek: number, targetUserId?: number) => {
    try {
      const body: Record<string, unknown> = {
        year: targetYear,
        month: targetMonth,
        weekIndex: targetWeek,
      };
      if (targetUserId) body.userId = targetUserId;
      await apiFetch('/api/weekly-reports/init', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } catch (err) {
      // 将后端错误转成 toast 提示（例如工作期未设置）
      toast.error(err instanceof Error ? err.message : '初始化失败');
    }
  };

  // 读取并设置本月工作期（同时在筛选卡下方渲染配置卡）
  const fetchWorkConfig = async (y: number, m: number) => {
    try {
      const data = await apiFetch<{ data: { work_start: string; work_end: string } | null }>(
        `/api/month-work-config?year=${y}&month=${m}`
      );
      const cfg = data.data;
      setWorkConfig(cfg);
      setCfgStart(cfg?.work_start || '');
      setCfgEnd(cfg?.work_end || '');
      return cfg;
    } catch {
      return null;
    }
  };

  const saveWorkConfig = async () => {
    if (!cfgStart || !cfgEnd) {
      toast.error('请选择起始和结束日期');
      return;
    }
    if (new Date(cfgStart) > new Date(cfgEnd)) {
      toast.error('起始日期不能晚于结束日期');
      return;
    }
    setSavingCfg(true);
    try {
      await apiFetch('/api/month-work-config', {
        method: 'PUT',
        body: JSON.stringify({
          year,
          month,
          work_start: cfgStart,
          work_end: cfgEnd,
        }),
      });
      toast.success('工作期已保存，周报周次将按该窗口划分');
      setWorkConfig({ work_start: cfgStart, work_end: cfgEnd });
      fetchReports();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingCfg(false);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
      });
      if (isAdmin && userId !== 'all') params.set('userId', userId);
      if (!isAdmin) params.set('userId', String(user?.id));
      const resp = await apiFetch<{
        data: WeeklyReport[];
        weeks: MonthWeek[];
        workConfig: { work_start: string; work_end: string } | null;
      }>(`/api/weekly-reports?${params}`);
      setWeeks(resp.weeks || []);
      setWorkConfig(resp.workConfig || null);
      if (resp.workConfig) {
        setCfgStart(resp.workConfig.work_start);
        setCfgEnd(resp.workConfig.work_end);
      } else {
        // 若后端 GET 未带，补一次 month-work-config API
        if (isAdmin) {
          fetchWorkConfig(year, month);
        }
      }
      let list = resp.data || [];
      // 仅本周
      list = list.filter((r) => r.week_index === weekIndex);

      // 若为单用户视图且本周无记录，自动初始化（要求工作期已设置）
      const isSingleUser = !isAdmin || (isAdmin && userId !== 'all');
      if (isSingleUser && list.length === 0 && (resp.workConfig || weeks.length > 0)) {
        await ensureInit(year, month, weekIndex, isAdmin && userId !== 'all' ? Number(userId) : user?.id);
        const retry = await apiFetch<{ data: WeeklyReport[] }>(`/api/weekly-reports?${params}`);
        list = (retry.data || []).filter((r) => r.week_index === weekIndex);
      }
      setReports(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 导出
  const handleExport = async (format: 'excel' | 'csv' | 'markdown') => {
    const params = new URLSearchParams({ year: String(year), month: String(month), format });
    if (isAdmin && userId !== 'all') params.set('userId', userId);
    try {
      const { blob, filename } = await apiDownload(`/api/weekly-reports/export?${params}`);
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

  // 从月度目标添加：加载可选目标
  const fetchGoalOptions = async () => {
    setLoadingGoals(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      const scopeUserId = !isAdmin ? String(user?.id) : userId !== 'all' ? userId : '';
      if (scopeUserId) params.set('userId', scopeUserId);
      const data = await apiFetch<{ data: { id: number; goals: string }[] }>(
        `/api/monthly-goals?${params}`
      );
      setGoalOptions(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载月度目标失败');
    } finally {
      setLoadingGoals(false);
    }
  };

  const applySelectedGoals = (target: 'this' | 'next') => {
    const picks = goalOptions.filter((g) => goalSelected.has(g.id));
    if (picks.length === 0) {
      toast.info('请先选择要添加的月度目标');
      return;
    }
    const items: PlanItem[] = picks.map((g) => ({
      id: newItemId(),
      text: g.goals,
      done: false,
    }));
    if (target === 'this') setEditorPlan((prev) => [...prev, ...items]);
    else setEditorNext((prev) => [...prev, ...items]);
    setGoalSelected(new Set());
    setGoalPicker(null);
    toast.success(`已添加 ${items.length} 条`);
  };

  // 输出产物：链接
  const handleAddLink = () => {
    if (!linkName.trim() || !linkUrl.trim()) {
      toast.error('请填写链接名称和URL');
      return;
    }
    setEditorArtifacts((prev) => [
      ...prev,
      { type: 'link', name: linkName.trim(), url: linkUrl.trim() },
    ]);
    setLinkName('');
    setLinkUrl('');
  };

  // 输出产物：附件上传
  const handleUploadClick = () => fileInputRef.current?.click();

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error('单文件不能超过 20MB');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await apiFetch<{ name: string; url: string; size: number }>(
        '/api/weekly-reports/upload',
        { method: 'POST', body: fd as BodyInit }
      );
      setEditorArtifacts((prev) => [
        ...prev,
        { type: 'file', name: data.name || file.name, url: data.url, size: data.size },
      ]);
      toast.success('上传成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveArtifact = (idx: number) => {
    setEditorArtifacts((prev) => prev.filter((_, i) => i !== idx));
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, weekIndex, userId]);

  const togglePlanDone = async (report: WeeklyReport, itemId: string, done: boolean) => {
    const updatedPlan = report.this_week_plan.map((p) =>
      p.id === itemId ? { ...p, done } : p
    );
    // 乐观更新
    setReports((prev) =>
      prev.map((r) => (r.id === report.id ? { ...r, this_week_plan: updatedPlan } : r))
    );
    try {
      await apiFetch(`/api/weekly-reports/${report.id}`, {
        method: 'PUT',
        body: JSON.stringify({ this_week_plan: updatedPlan }),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
      fetchReports();
    }
  };

  const handleGenerate = async (report: WeeklyReport) => {
    setGenerating((g) => ({ ...g, [report.id]: true }));
    try {
      const resp = await apiFetch<{ data: WeeklyReport; used_external_ai: boolean; fallback?: string }>(
        '/api/weekly-reports/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            userId: report.user_id,
            weekStart: report.week_start,
            weekEnd: report.week_end,
          }),
        }
      );
      setReports((prev) =>
        prev.map((r) => (r.id === resp.data.id ? resp.data : r))
      );
      if (resp.used_external_ai) {
        toast.success('周报已生成（外部AI）');
      } else if (resp.fallback && resp.fallback !== 'none') {
        toast.info('周报已生成（规则兜底，AI 不可用）');
      } else {
        toast.success('周报已生成（内置）');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenerating((g) => ({ ...g, [report.id]: false }));
    }
  };

  const openEditor = (r: WeeklyReport) => {
    setEditor(r);
    setEditorPlan(r.this_week_plan.map((p) => ({ ...p })));
    setEditorNext(r.next_week_plan.map((p) => ({ ...p, done: false })));
    setEditorReason(r.uncompleted_reason || '');
    // output_artifacts 是 JSONB 数组
    setEditorArtifacts(Array.isArray(r.output_artifacts) ? r.output_artifacts : []);
    setNewPlanText('');
    setNewNextText('');
    setLinkName('');
    setLinkUrl('');
    setGoalPicker(null);
    setGoalSelected(new Set());
  };

  const saveEditor = async () => {
    if (!editor) return;
    setSavingEditor(true);
    try {
      // 从本周计划勾选的 done 项拼接 actual_completed 文本（兼容 AI 绩效评分读取逻辑）
      const derivedActual = editorPlan
        .filter((p) => p.done)
        .map((p) => p.text)
        .join('\n');
      const body = {
        this_week_plan: editorPlan,
        next_week_plan: editorNext,
        uncompleted_reason: editorReason,
        output_artifacts: editorArtifacts,
        actual_completed: derivedActual || null,
      };
      const resp = await apiFetch<{ data: WeeklyReport }>(`/api/weekly-reports/${editor.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setReports((prev) => prev.map((r) => (r.id === resp.data.id ? resp.data : r)));
      toast.success('已保存');
      setEditor(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingEditor(false);
    }
  };

  const currentWeek = weeks.find((w) => w.weekIndex === weekIndex);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f] flex items-center gap-2">
            <CalendarCheck2 className="w-6 h-6" />
            周报汇总
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            周计划自动承接月度目标/上周下周计划，实际完成由 AI 基于本周日报生成
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
        </div>
      </div>

      {/* Admin 工作期配置（设置后决定周次窗口归属，解决跨月重复 bug） */}
      {isAdmin && (
        <Card className="mb-4 border-[#e2e8f0]">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-[#1e3a5f]" />
                <Label className="text-sm font-medium">本月工作期（全局）</Label>
                {!workConfig ? (
                  <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200">
                    未设置 · 无法生成周报
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-green-700 bg-green-50 border-green-200">
                    已设置
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-[#475569]">起始</Label>
                  <Input
                    type="date"
                    value={cfgStart}
                    onChange={(e) => setCfgStart(e.target.value)}
                    className="w-auto"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-[#475569]">结束</Label>
                  <Input
                    type="date"
                    value={cfgEnd}
                    onChange={(e) => setCfgEnd(e.target.value)}
                    className="w-auto"
                  />
                </div>
                <Button onClick={saveWorkConfig} disabled={savingCfg} className="bg-[#1e3a5f] hover:bg-[#16304f]">
                  {savingCfg ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />保存中</> : '保存工作期'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-[#475569] mt-2">
              说明：系统将按 [起始~结束] 区间，每周一到周五划分周次。建议每月窗口不交叉（例：8月 work_end=0829，9月 work_start=0831）即可杜绝"0831~0904 同时出现在两个月"的重叠展示问题。
            </p>
          </CardContent>
        </Card>
      )}

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
            {isAdmin && (
              <div className="flex items-center gap-2 ml-auto">
                <Label className="text-sm">成员</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部成员</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.real_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {weeks.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {weeks.map((w) => (
                <Button
                  key={w.weekIndex}
                  size="sm"
                  variant={weekIndex === w.weekIndex ? 'default' : 'outline'}
                  onClick={() => setWeekIndex(w.weekIndex)}
                  className={weekIndex === w.weekIndex ? 'bg-[#1e3a5f] hover:bg-[#16304f]' : ''}
                >
                  第{w.weekIndex}周 ({w.weekStart}~{w.weekEnd})
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="p-8 text-center text-[#475569]">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
          加载中...
        </div>
      ) : reports.length === 0 ? (
        <Card className="border-[#e2e8f0]">
          <CardContent className="p-8 text-center text-[#475569]">
            <CalendarCheck2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>本周暂无周报数据</p>
            {isAdmin && userId === 'all' && (
              <p className="text-xs mt-1">切换到具体成员后将自动初始化本周计划</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((r) => (
            <Card key={r.id} className="border-[#e2e8f0]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-[#1e3a5f] flex items-center gap-2">
                    {r.users?.real_name || '-'}
                    <span className="text-xs font-normal text-[#475569]">
                      {r.week_start} ~ {r.week_end}
                    </span>
                    {r.used_external_ai != null && (
                      <Badge variant="outline" className={
                        r.used_external_ai
                          ? 'text-green-700 bg-green-50 border-green-200'
                          : 'text-gray-600 bg-gray-50 border-gray-200'
                      }>
                        {r.used_external_ai ? <><Zap className="w-3 h-3 mr-1" />外部AI</> : <><Bot className="w-3 h-3 mr-1" />内置</>}
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditor(r)}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleGenerate(r)}
                      disabled={generating[r.id]}
                      className="bg-[#1e3a5f] hover:bg-[#16304f]"
                    >
                      {generating[r.id] ? (
                        <><Loader2 className="w-4 h-4 mr-1 animate-spin" />生成中</>
                      ) : (
                        <><Sparkles className="w-4 h-4 mr-1" />生成周报</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* 本周计划 */}
                  <div>
                    <Label className="text-xs text-[#475569] mb-2 block">本周计划</Label>
                    {r.this_week_plan.length === 0 ? (
                      <p className="text-sm text-[#94a3b8]">暂无计划，点击「编辑」添加</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {r.this_week_plan.map((p) => (
                          <li key={p.id} className="flex items-start gap-2">
                            <Checkbox
                              checked={p.done}
                              onCheckedChange={(v) => togglePlanDone(r, p.id, !!v)}
                              className="mt-0.5"
                            />
                            <span className={`text-sm ${p.done ? 'line-through text-[#94a3b8]' : 'text-[#1e293b]'}`}>
                              {p.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* 下周计划 */}
                  <div>
                    <Label className="text-xs text-[#475569] mb-2 block">下周计划</Label>
                    {r.next_week_plan.length === 0 ? (
                      <p className="text-sm text-[#94a3b8]">暂无，点击「编辑」添加</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {r.next_week_plan.map((p) => (
                          <li key={p.id} className="flex items-start gap-2">
                            <span className="text-sm text-[#1e293b]">{p.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* 实际完成：显示本周计划勾选完成的条目 + AI 生成文本（如果有） */}
                  <div className="lg:col-span-2">
                    <Label className="text-xs text-[#475569] mb-2 block">实际完成</Label>
                    {(() => {
                      const doneItems = (r.this_week_plan || []).filter((p) => p.done);
                      const hasText = !!r.actual_completed && r.actual_completed.trim() !== '';
                      if (doneItems.length === 0 && !hasText) {
                        return <p className="text-sm text-[#94a3b8]">勾选本周计划项或点击「生成周报」</p>;
                      }
                      return (
                        <div className="space-y-2">
                          {doneItems.length > 0 && (
                            <ul className="space-y-1">
                              {doneItems.map((p) => (
                                <li key={p.id} className="flex items-start gap-2 text-sm text-[#1e293b]">
                                  <span className="text-green-600 mt-0.5">✓</span>
                                  <span>{p.text}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {hasText && (
                            <div className="text-sm whitespace-pre-wrap text-[#1e293b] bg-gray-50 rounded p-3 border border-gray-100">
                              <p className="text-xs text-[#475569] mb-1">AI 补充说明：</p>
                              {r.actual_completed}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <Label className="text-xs text-[#475569] mb-2 block">未完成原因</Label>
                    <p className="text-sm text-[#1e293b] whitespace-pre-wrap">
                      {r.uncompleted_reason || '-'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-[#475569] mb-2 block">输出产物</Label>
                    {(() => {
                      const arts = r.output_artifacts;
                      if (Array.isArray(arts)) {
                        if (arts.length === 0) return <p className="text-sm text-[#94a3b8]">暂无产物，点击「编辑」添加</p>;
                        return (
                          <ul className="space-y-1">
                            {arts.map((a, i) => (
                              <li key={i} className="flex items-center gap-2 text-sm">
                                {a.type === 'link' ? (
                                  <LinkIcon className="w-4 h-4 text-[#1e3a5f] shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-[#1e3a5f] shrink-0" />
                                )}
                                <a
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#1e3a5f] hover:underline truncate"
                                  title={a.url}
                                >
                                  {a.name}
                                </a>
                                {typeof a.size === 'number' && (
                                  <span className="text-xs text-[#94a3b8]">({(a.size / 1024).toFixed(1)} KB)</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      // 兼容旧数据（字符串）
                      const str = arts as unknown as string | null;
                      return <p className="text-sm text-[#1e293b] whitespace-pre-wrap">{str || '-'}</p>;
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 编辑器 */}
      <Dialog open={!!editor} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              编辑周报 - {editor?.users?.real_name} ({editor?.week_start}~{editor?.week_end})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* 本周计划（支持从月度目标筛选添加） */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">本周计划</Label>
                <Popover
                  open={goalPicker === 'this'}
                  onOpenChange={(o) => {
                    if (o) { fetchGoalOptions(); setGoalSelected(new Set()); }
                    setGoalPicker(o ? 'this' : null);
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Target className="w-3.5 h-3.5 mr-1" />
                      从月度目标添加
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[420px]">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium">选择要添加的月度目标（可多选）</Label>
                      <span className="text-xs text-[#475569]">{goalSelected.size} 已选</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto border rounded p-2 space-y-1">
                      {loadingGoals ? (
                        <div className="p-3 text-center"><Loader2 className="w-4 h-4 mx-auto animate-spin" /></div>
                      ) : goalOptions.length === 0 ? (
                        <p className="text-sm text-[#94a3b8] text-center p-3">当月暂无月度目标</p>
                      ) : goalOptions.map((g) => {
                        const checked = goalSelected.has(g.id);
                        return (
                          <label
                            key={g.id}
                            className={`flex items-start gap-2 p-2 rounded cursor-pointer ${checked ? 'bg-[#1e3a5f]/5' : 'hover:bg-gray-50'}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setGoalSelected((prev) => {
                                  const next = new Set(prev);
                                  if (v) next.add(g.id); else next.delete(g.id);
                                  return next;
                                });
                              }}
                              className="mt-0.5"
                            />
                            <span className="text-sm text-[#1e293b]">{g.goals}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={() => setGoalPicker(null)}>取消</Button>
                      <Button size="sm" className="bg-[#1e3a5f] hover:bg-[#16304f]" onClick={() => applySelectedGoals('this')}>
                        确定添加
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5 mb-2">
                {editorPlan.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={p.done}
                      title="标记完成"
                      onCheckedChange={(v) =>
                        setEditorPlan((prev) => prev.map((x) => (x.id === p.id ? { ...x, done: !!v } : x)))
                      }
                      className="shrink-0"
                    />
                    <Input
                      value={p.text}
                      onChange={(e) =>
                        setEditorPlan((prev) => prev.map((x) => (x.id === p.id ? { ...x, text: e.target.value } : x)))
                      }
                      className={`flex-1 ${p.done ? 'line-through text-[#94a3b8]' : ''}`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditorPlan((prev) => prev.filter((x) => x.id !== p.id))}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                {editorPlan.length === 0 && (
                  <p className="text-xs text-[#94a3b8] p-2">暂无计划，使用「从月度目标添加」或下方输入框新增</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newPlanText}
                  onChange={(e) => setNewPlanText(e.target.value)}
                  placeholder="新增本周计划项（回车添加）"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newPlanText.trim()) {
                      setEditorPlan((prev) => [...prev, { id: newItemId(), text: newPlanText.trim(), done: false }]);
                      setNewPlanText('');
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!newPlanText.trim()) return;
                    setEditorPlan((prev) => [...prev, { id: newItemId(), text: newPlanText.trim(), done: false }]);
                    setNewPlanText('');
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* 下周计划（支持从月度目标筛选添加） */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">下周计划（将作为下周的本周计划）</Label>
                <Popover
                  open={goalPicker === 'next'}
                  onOpenChange={(o) => {
                    if (o) { fetchGoalOptions(); setGoalSelected(new Set()); }
                    setGoalPicker(o ? 'next' : null);
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Target className="w-3.5 h-3.5 mr-1" />
                      从月度目标添加
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[420px]">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium">选择要添加的月度目标（可多选）</Label>
                      <span className="text-xs text-[#475569]">{goalSelected.size} 已选</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto border rounded p-2 space-y-1">
                      {loadingGoals ? (
                        <div className="p-3 text-center"><Loader2 className="w-4 h-4 mx-auto animate-spin" /></div>
                      ) : goalOptions.length === 0 ? (
                        <p className="text-sm text-[#94a3b8] text-center p-3">当月暂无月度目标</p>
                      ) : goalOptions.map((g) => {
                        const checked = goalSelected.has(g.id);
                        return (
                          <label
                            key={g.id}
                            className={`flex items-start gap-2 p-2 rounded cursor-pointer ${checked ? 'bg-[#1e3a5f]/5' : 'hover:bg-gray-50'}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setGoalSelected((prev) => {
                                  const next = new Set(prev);
                                  if (v) next.add(g.id); else next.delete(g.id);
                                  return next;
                                });
                              }}
                              className="mt-0.5"
                            />
                            <span className="text-sm text-[#1e293b]">{g.goals}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={() => setGoalPicker(null)}>取消</Button>
                      <Button size="sm" className="bg-[#1e3a5f] hover:bg-[#16304f]" onClick={() => applySelectedGoals('next')}>
                        确定添加
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5 mb-2">
                {editorNext.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <Input
                      value={p.text}
                      onChange={(e) =>
                        setEditorNext((prev) => prev.map((x) => (x.id === p.id ? { ...x, text: e.target.value } : x)))
                      }
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditorNext((prev) => prev.filter((x) => x.id !== p.id))}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                {editorNext.length === 0 && (
                  <p className="text-xs text-[#94a3b8] p-2">暂无，使用「从月度目标添加」或下方输入框新增</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newNextText}
                  onChange={(e) => setNewNextText(e.target.value)}
                  placeholder="新增下周计划项（回车添加）"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newNextText.trim()) {
                      setEditorNext((prev) => [...prev, { id: newItemId(), text: newNextText.trim(), done: false }]);
                      setNewNextText('');
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!newNextText.trim()) return;
                    setEditorNext((prev) => [...prev, { id: newItemId(), text: newNextText.trim(), done: false }]);
                    setNewNextText('');
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* 实际完成：从本周计划勾选（勾选状态同步写入 editorPlan.done） */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                实际完成
                <span className="text-xs font-normal text-[#475569] ml-2">
                  从「本周计划」中勾选已完成项（保存时自动生成实际完成文本）
                </span>
              </Label>
              {editorPlan.length === 0 ? (
                <p className="text-xs text-[#94a3b8] p-2 bg-gray-50 rounded border border-gray-100">请先添加本周计划项</p>
              ) : (
                <ul className="space-y-1.5 border rounded p-3 max-h-60 overflow-y-auto bg-gray-50/40">
                  {editorPlan.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={p.done}
                        onCheckedChange={(v) =>
                          setEditorPlan((prev) => prev.map((x) => (x.id === p.id ? { ...x, done: !!v } : x)))
                        }
                      />
                      <span className={`text-sm ${p.done ? 'line-through text-[#94a3b8]' : 'text-[#1e293b]'}`}>
                        {p.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-[#475569] mt-1">
                已勾选 {editorPlan.filter((p) => p.done).length} / {editorPlan.length} 项
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">未完成原因</Label>
              <Textarea
                value={editorReason}
                onChange={(e) => setEditorReason(e.target.value)}
                rows={2}
                placeholder="若有未完成项，说明原因"
              />
            </div>

            {/* 输出产物：链接 + 文件附件（JSONB 数组） */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">输出产物</Label>
                <span className="text-xs text-[#475569]">{editorArtifacts.length} 个</span>
              </div>

              {editorArtifacts.length > 0 && (
                <ul className="space-y-1.5 mb-3 border rounded p-2 bg-gray-50/40">
                  {editorArtifacts.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 p-1">
                      {a.type === 'link' ? (
                        <LinkIcon className="w-4 h-4 text-[#1e3a5f] shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-[#1e3a5f] shrink-0" />
                      )}
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-[#1e3a5f] hover:underline truncate"
                      >
                        {a.name}
                      </a>
                      <Badge variant="outline" className="text-[10px]">{a.type === 'link' ? '链接' : '文件'}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveArtifact(i)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {/* 添加链接 */}
              <div className="flex gap-2 mb-2">
                <Input
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  placeholder="链接名称"
                  className="w-1/3"
                />
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://... 链接URL"
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={handleAddLink}>
                  <LinkIcon className="w-4 h-4 mr-1" />添加链接
                </Button>
              </div>

              {/* 上传文件 */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={uploading}>
                  <Upload className="w-4 h-4 mr-1" />
                  {uploading ? '上传中...' : '上传附件'}
                </Button>
                <span className="text-xs text-[#475569]">
                  支持任意格式，单文件≤20MB（存储由 STORAGE_DRIVER 环境变量控制）
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleUploadFile}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>取消</Button>
            <Button onClick={saveEditor} disabled={savingEditor} className="bg-[#1e3a5f] hover:bg-[#16304f]">
              {savingEditor ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中</> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
