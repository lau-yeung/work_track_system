'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch, apiDownload } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  Loader2,
  Download,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { TimeEntryDialog } from './time-entry-dialog';
import type {
  TimeEntryLite,
  ProductOption,
  ProjectOption,
  TaskOption,
  VersionOption,
} from './time-entry-dialog';

type TimeEntry = TimeEntryLite;

interface TimeEntryMutationResult {
  data: TimeEntry;
  daily_total: number;
  is_below_minimum: boolean;
  merged?: boolean;
}

// 周日为一周起点的星期表头
const WEEK_HEADERS = ['日', '一', '二', '三', '四', '五', '六'];

// 将 Date 格式化为 YYYY-MM-DD（本地时区，避免 UTC 偏移导致日期错位）
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 取某月日历网格所需的所有日期格子（含前后补齐到完整周，周日为起点）
function getMonthGridDates(year: number, month: number): Date[] {
  // month 为 0-based
  const first = new Date(year, month, 1);
  // JS getDay(): 0=周日, 1=周一... 周日为起点时偏移即 getDay()
  const firstDayIdx = first.getDay();
  const start = new Date(year, month, 1 - firstDayIdx);
  // 总是渲染 6 行（42 个格子），保证布局稳定
  const dates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    dates.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return dates;
}

export default function TimeEntriesPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [versions, setVersions] = useState<VersionOption[]>([]);
  // 统一的填报/追加弹窗：替代原 showCreate、dayDetail、showBatch 三个状态
  const [entryDialog, setEntryDialog] = useState<{
    open: boolean;
    initialDate?: string;
    existingEntries?: TimeEntry[];
  }>({ open: false });
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [filterProject, setFilterProject] = useState('');
  // admin 可按成员筛选；普通用户仅看自己，无需此筛选项
  const [filterUser, setFilterUser] = useState('all');
  const [userOptions, setUserOptions] = useState<Array<{ id: number; real_name: string; username: string }>>([]);
  // currentMonth 形如 '2026-09'，默认当月
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [form, setForm] = useState({
    project_id: '',
    task_id: '',
    version_id: '',
    work_date: new Date().toISOString().split('T')[0],
    hours: '',
    progress: '',
    remarks: '',
    completed_work: '',
    coordination_matters: '',
    tomorrow_plan: '',
  });
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimeEntry | null>(null);
  const [exportForm, setExportForm] = useState({
    dimension: 'month' as 'day' | 'week' | 'month' | 'year' | 'custom',
    format: 'excel' as 'excel' | 'csv' | 'markdown',
    date: new Date().toISOString().split('T')[0],
    startDate: '',
    endDate: '',
    projectId: 'all',
  });

  // 按 currentMonth 计算起止日期
  const [monthStart, monthEnd] = useMemo(() => {
    const [yStr, mStr] = currentMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return [formatLocalDate(start), formatLocalDate(end)];
  }, [currentMonth]);

  // 月历网格日期
  const gridDates = useMemo(() => {
    const [yStr, mStr] = currentMonth.split('-');
    return getMonthGridDates(parseInt(yStr, 10), parseInt(mStr, 10) - 1);
  }, [currentMonth]);

  // 按 work_date 分组的映射
  const entriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      const list = map.get(e.work_date) || [];
      list.push(e);
      map.set(e.work_date, list);
    }
    return map;
  }, [entries]);

  // 月度合计
  const monthTotalHours = useMemo(() => {
    const sum = entries.reduce((s, e) => s + parseFloat(e.hours || '0'), 0);
    return Math.round(sum * 10) / 10;
  }, [entries]);

  // 月度填报天数
  const monthFilledDays = useMemo(() => entriesByDate.size, [entriesByDate]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '1000',
        startDate: monthStart,
        endDate: monthEnd,
      });
      if (filterProject && filterProject !== 'all') params.set('projectId', filterProject);
      // admin 可按 userId 过滤；普通用户 API 自动只看本人
      if (user?.role === 'admin' && filterUser !== 'all') {
        params.set('userId', filterUser);
      }
      const data = await apiFetch<{ data: TimeEntry[]; total: number }>(`/api/time-entries?${params}`);
      setEntries(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd, filterProject, filterUser, user?.role]);

  const fetchProjects = async () => {
    try {
      const data = await apiFetch<{ data: ProjectOption[] }>('/api/projects/my');
      if (data.data) setProjects(data.data);
    } catch {
      // ignore
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await apiFetch<{ data: ProductOption[] }>('/api/products');
      if (data.data) setProducts(data.data);
    } catch {
      // ignore
    }
  };

  const fetchTasks = async () => {
    try {
      // 填报下拉只需要进行中的任务
      const data = await apiFetch<{ data: TaskOption[] }>('/api/tasks?status=active');
      if (data.data) setTasks(data.data);
    } catch {
      // ignore
    }
  };

  const fetchVersions = async () => {
    try {
      // 填报下拉返回所有可见版本（包括已关闭的，便于历史填报）
      const data = await apiFetch<{ data: VersionOption[] }>('/api/versions?all=1');
      if (data.data) setVersions(data.data);
    } catch {
      // ignore
    }
  };

  const fetchUserOptions = async () => {
    // 仅管理员需要成员筛选
    if (user?.role !== 'admin') return;
    try {
      const data = await apiFetch<{ data: Array<{ id: number; real_name: string; username: string }> }>(
        '/api/users?pageSize=200'
      );
      setUserOptions((data.data || []).filter((u) => u.username !== 'admin'));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchProjects();
    fetchProducts();
    fetchTasks();
    fetchVersions();
    fetchUserOptions();
  }, []);

  // 月份导航
  const goPrevMonth = () => {
    const [y, m] = currentMonth.split('-').map((n) => parseInt(n, 10));
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const goNextMonth = () => {
    const [y, m] = currentMonth.split('-').map((n) => parseInt(n, 10));
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const goToday = () => {
    const now = new Date();
    setCurrentMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  };

  // 点击任意日期格子直接打开统一的"填报/追加工时"弹窗：
  // 若当日已有数据则附带 existingEntries，弹窗顶部展示并支持追加；否则为空白新建模式
  const openEntryDialogForDate = (dateStr: string) => {
    const existing = entriesByDate.get(dateStr) || [];
    setEntryDialog({
      open: true,
      initialDate: dateStr,
      existingEntries: existing.length > 0 ? existing : undefined,
    });
  };

  const handleEdit = async () => {
    if (!editEntry) return;
    try {
      const result = await apiFetch<TimeEntryMutationResult>(`/api/time-entries/${editEntry.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          hours: form.hours,
          task_id: form.task_id ? parseInt(form.task_id) : editEntry.task_id,
          version_id: form.version_id && form.version_id !== 'none' ? parseInt(form.version_id) : null,
          progress: form.progress !== '' ? Number(form.progress) : 0,
          remarks: form.remarks,
          completed_work: form.completed_work,
          coordination_matters: form.coordination_matters,
          tomorrow_plan: form.tomorrow_plan,
        }),
      });
      toast.success('工时更新成功');
      if (result.is_below_minimum) {
        toast.warning(
          `今日已填报 ${result.daily_total} 小时，不足 8 小时，请确认是否需要补填`
        );
      }
      setEditEntry(null);
      fetchEntries();
      // 编辑可能改变了任务进度，刷新任务列表
      fetchTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await apiFetch(`/api/time-entries/${id}`, { method: 'DELETE' });
      toast.success('删除成功');
      setDeleteTarget(null);
      fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
      setDeleteTarget(null);
    }
  };

  const openEdit = (entry: TimeEntry) => {
    setEditEntry(entry);
    setForm({
      project_id: String(entry.project_id),
      task_id: entry.task_id ? String(entry.task_id) : '',
      version_id: entry.version_id ? String(entry.version_id) : '',
      work_date: entry.work_date,
      hours: entry.hours,
      progress: entry.progress != null ? String(entry.progress) : '',
      remarks: entry.remarks || '',
      completed_work: entry.completed_work || '',
      coordination_matters: entry.coordination_matters || '',
      tomorrow_plan: entry.tomorrow_plan || '',
    });
  };

  const handleResetFilters = () => {
    setFilterProject('');
    setFilterUser('all');
  };

  const openExportDialog = () => {
    setExportForm((prev) => ({
      ...prev,
      date: new Date().toISOString().split('T')[0],
      startDate: monthStart,
      endDate: monthEnd,
      projectId: filterProject && filterProject !== 'all' ? filterProject : 'all',
    }));
    setShowExport(true);
  };

  const handleExport = async () => {
    const { dimension, format, date, startDate: exStart, endDate: exEnd, projectId } = exportForm;

    if (dimension === 'custom') {
      if (!exStart || !exEnd) {
        toast.error('自定义维度需要选择开始和结束日期');
        return;
      }
      if (exStart > exEnd) {
        toast.error('开始日期不能晚于结束日期');
        return;
      }
    } else if (!date) {
      toast.error('请选择日期');
      return;
    }

    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('format', format);
      params.set('dimension', dimension);
      if (dimension === 'custom') {
        params.set('startDate', exStart);
        params.set('endDate', exEnd);
      } else {
        params.set('date', date);
      }
      if (projectId && projectId !== 'all') params.set('projectId', projectId);

      const { blob, filename } = await apiDownload(`/api/time-entries/export?${params}`);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('导出成功');
      setShowExport(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  // 计算某日工时合计
  const getDayTotalHours = (dateStr: string): number => {
    const list = entriesByDate.get(dateStr);
    if (!list || list.length === 0) return 0;
    return Math.round(list.reduce((s, e) => s + parseFloat(e.hours || '0'), 0) * 10) / 10;
  };

  // 单条编辑表单（由统一弹窗内"编辑"按钮触发，产品/项目与日期只读，任务/版本可在同项目内调整）
  // 字段顺序与录入弹窗保持一致：工作日期 → 产品/项目 → 版本/任务 → 工时 → 今日完成工作 → 明日计划工作 → 需协调事宜 → 备注
  const entryForm = () => {
    const editing = entries.find((e) => e.id === editEntry?.id) || editEntry;
    const productName = editing?.projects?.products?.name;
    const projectName = editing?.projects?.name;
    // 任务下拉：同项目下进行中的任务，并包含当前已选（可能已关闭）任务
    const projectTasks = tasks.filter((t) => t.project_id === editing?.project_id);
    const currentTaskId = editing?.task_id;
    const currentTaskInList = projectTasks.some((t) => t.id === currentTaskId);
    // 版本下拉：同项目下所有可见版本
    const projectVersions = versions.filter((v) => v.project_id === editing?.project_id);
    return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>工作日期 *</Label>
          <Input value={form.work_date} disabled />
        </div>
        <div className="space-y-2">
          <Label>所属产品</Label>
          <Input value={productName || '未分产品'} disabled />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>所属项目</Label>
          <Input value={projectName || ''} disabled />
        </div>
        <div className="space-y-2">
          <Label>所属版本</Label>
          <Select
            value={form.version_id || 'none'}
            onValueChange={(v) => setForm({ ...form, version_id: v === 'none' ? '' : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="不选版本" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不选版本</SelectItem>
              {projectVersions.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>所属任务 *</Label>
          <Select
            value={form.task_id}
            onValueChange={(v) => {
              // 切换任务时仅更新任务字段
              setForm({ ...form, task_id: v });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择任务" />
            </SelectTrigger>
            <SelectContent>
              {editing?.project_tasks?.name && !currentTaskInList && (
                <SelectItem value={String(editing.task_id)}>
                  {editing.project_tasks.name}（当前）
                </SelectItem>
              )}
              {projectTasks
                .filter((t) => t.status === 'active')
                .map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>任务进度(%)</Label>
          <Input
            type="number"
            min="0"
            max="100"
            step="1"
            value={form.progress}
            onChange={(e) => setForm({ ...form, progress: e.target.value })}
            placeholder="如 30，表示 30%"
            disabled={!form.task_id}
            title="手动录入任务进度（0-100 整数）"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>工时(h) *（步长0.5，单日总工时不超8h）</Label>
        <Input
          type="number"
          step="0.5"
          min="0.5"
          max="8"
          value={form.hours}
          onChange={(e) => setForm({ ...form, hours: e.target.value })}
          placeholder="例如：4、6.5、8"
        />
      </div>
      <div className="space-y-2">
        <Label>今日完成工作 *</Label>
        <Textarea
          value={form.completed_work}
          onChange={(e) => setForm({ ...form, completed_work: e.target.value })}
          placeholder="请描述今日完成的工作内容"
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>明日计划工作 *</Label>
        <Textarea
          value={form.tomorrow_plan}
          onChange={(e) => setForm({ ...form, tomorrow_plan: e.target.value })}
          placeholder="请描述明日计划工作"
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>需协调事宜</Label>
        <Textarea
          value={form.coordination_matters}
          onChange={(e) => setForm({ ...form, coordination_matters: e.target.value })}
          placeholder="可选，需要协调的事项"
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>备注</Label>
        <Input
          value={form.remarks}
          onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          placeholder="可选备注"
        />
      </div>
    </div>
    );
  };

  const todayStr = formatLocalDate(new Date());
  const [currentY, currentM] = currentMonth.split('-').map((n) => parseInt(n, 10));
  const monthLabel = `${currentY} 年 ${currentM} 月`;

  // 年月快速选择：年选项（当前年前后各 3 年），月选项（1-12）
  const now = new Date();
  const yearOptions = (() => {
    const baseYear = now.getFullYear();
    const opts: number[] = [];
    for (let y = baseYear - 3; y <= baseYear + 3; y++) opts.push(y);
    return opts;
  })();
  const monthList = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">工时日报</h1>
          <p className="text-sm text-[#475569] mt-1">按日历查看和管理每日工时</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openExportDialog}>
            <Download className="w-4 h-4 mr-2" />
            导出日报
          </Button>
          <Button
            onClick={() => setEntryDialog({ open: true })}
            className="bg-[#1e3a5f] hover:bg-[#16304f]"
          >
            <Plus className="w-4 h-4 mr-2" />
            填报工时
          </Button>
        </div>
      </div>

      {/* 项目筛选 + 成员筛选（仅 admin） */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="全部项目" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {user?.role === 'admin' && (
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="全部成员" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部成员</SelectItem>
              {userOptions.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.real_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(filterProject && filterProject !== 'all') || (user?.role === 'admin' && filterUser !== 'all') ? (
          <Button variant="outline" onClick={handleResetFilters}>
            重置筛选
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2 text-sm text-[#475569]">
          <CalendarDays className="w-4 h-4" />
          <span>
            本月合计 <strong className="text-[#1e3a5f]">{monthTotalHours}h</strong>
            <span className="mx-2 text-[#cbd5e1]">|</span>
            填报 <strong className="text-[#1e3a5f]">{monthFilledDays}</strong> 天
          </span>
        </div>
      </div>

      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrevMonth} aria-label="上一月">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {/* 年月独立选择 */}
          <Select
            value={String(currentY)}
            onValueChange={(v) => {
              const y = parseInt(v);
              setCurrentMonth(`${y}-${String(currentM).padStart(2, '0')}`);
            }}
          >
            <SelectTrigger className="w-[90px] ml-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y} 年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(currentM)}
            onValueChange={(v) => {
              const m = parseInt(v);
              setCurrentMonth(`${currentY}-${String(m).padStart(2, '0')}`);
            }}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthList.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} 月
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={goNextMonth} aria-label="下一月">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={goToday}>
          回到今天
        </Button>
      </div>

      {/* 月历 */}
      <Card className="border-[#e2e8f0]">
        <CardContent className="p-3 sm:p-4">
          {/* 星期表头 */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2">
            {WEEK_HEADERS.map((w) => (
              <div
                key={w}
                className="text-center text-xs font-medium text-[#64748b] py-1"
              >
                {w}
              </div>
            ))}
          </div>

          {/* 日期格子 */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#475569]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {gridDates.map((d) => {
                const dateStr = formatLocalDate(d);
                const dayEntries = entriesByDate.get(dateStr) || [];
                const dayTotal = getDayTotalHours(dateStr);
                const hasCoordination = dayEntries.some((e) => e.coordination_matters?.trim());
                const isCurrentMonth = d.getMonth() === currentM - 1;
                const isToday = dateStr === todayStr;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => openEntryDialogForDate(dateStr)}
                    title={
                      hasCoordination
                        ? `${dateStr} 有需协调事宜，点击查看/追加工时`
                        : dayTotal > 0
                          ? `点击查看/追加 ${dateStr} 的工时`
                          : `点击填报 ${dateStr} 的工时`
                    }
                    className={[
                      'relative min-h-[96px] sm:min-h-[112px] p-1.5 sm:p-2 rounded-md border text-left transition-colors cursor-pointer hover:border-[#1e3a5f]/50 hover:bg-[#f1f5f9]',
                      isCurrentMonth ? 'bg-white' : 'bg-[#f8fafc] text-[#94a3b8]',
                      isToday ? 'border-[#1e3a5f] ring-1 ring-[#1e3a5f]' : 'border-[#e2e8f0]',
                      isWeekend && isCurrentMonth ? 'bg-[#fafbfc]' : '',
                    ].join(' ')}
                  >
                    {/* 日期号 */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={[
                          'text-xs font-medium',
                          isToday ? 'text-[#1e3a5f] font-bold' : isCurrentMonth ? 'text-[#475569]' : 'text-[#cbd5e1]',
                        ].join(' ')}
                      >
                        {d.getDate()}
                      </span>
                      {dayTotal > 0 && (
                        <span
                          title="当日合计（点击格子查看/追加）"
                          className={[
                            'text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded',
                            dayTotal >= 8
                              ? 'bg-[#dcfce7] text-[#15803d]'
                              : dayTotal >= 4
                                ? 'bg-[#fef9c3] text-[#a16207]'
                                : 'bg-[#fee2e2] text-[#b91c1c]',
                          ].join(' ')}
                        >
                          {dayTotal}h
                        </span>
                      )}
                    </div>

                    {/* 任务摘要：产品/版本/任务/进度 拼接，悬浮提示完整路径 */}
                    {dayEntries.length > 0 && (
                      <div className="space-y-0.5">
                        {dayEntries.slice(0, 3).map((e) => {
                          // 小框展示 产品+版本+任务+进度
                          const productName = e.projects?.products?.name || '';
                          const versionName = e.project_versions?.name || '';
                          const taskName = e.project_tasks?.name || '';
                          const parts: string[] = [];
                          if (productName) parts.push(productName);
                          if (versionName) parts.push(versionName);
                          if (taskName) parts.push(taskName);
                          let label = parts.length > 0 ? parts.join('/') : '-';
                          if (e.progress != null && e.progress > 0) {
                            label += ` ${e.progress}%`;
                          }
                          const title = [
                            productName,
                            versionName,
                            taskName,
                            e.progress != null && e.progress > 0
                              ? `进度 ${e.progress}%`
                              : null,
                            `${e.hours}h`,
                          ]
                            .filter(Boolean)
                            .join(' / ');
                          return (
                            <div
                              key={e.id}
                              className="text-[10px] sm:text-[11px] text-[#475569] truncate leading-tight"
                              title={title}
                            >
                              {label}
                            </div>
                          );
                        })}
                        {dayEntries.length > 3 && (
                          <div className="text-[10px] text-[#94a3b8]">
                            +{dayEntries.length - 3} 项
                          </div>
                        )}
                      </div>
                    )}

                    {/* 协调事宜标签 */}
                    {hasCoordination && (
                      <span
                        className="absolute bottom-1 left-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#fef3c7] text-[#b45309] border border-[#fde68a]"
                        title="当日有需协调事宜"
                      >
                        协调
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* 图例 */}
          <div className="flex items-center justify-end gap-3 mt-3 text-[10px] sm:text-xs text-[#64748b]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-[#dcfce7]" /> ≥8h 满工时
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-[#fef9c3]" /> 4-7h
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-[#fee2e2]" /> &lt;4h
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block px-1.5 rounded bg-[#fef3c7] text-[#b45309] border border-[#fde68a] text-[10px]">协调</span>
              有协调事宜
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog (单条编辑，由统一弹窗内"编辑"按钮触发) */}
      <Dialog open={editEntry !== null} onOpenChange={() => setEditEntry(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑工时</DialogTitle>
          </DialogHeader>
          {entryForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>
              取消
            </Button>
            <Button className="bg-[#1e3a5f] hover:bg-[#16304f]" onClick={handleEdit}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>导出工时日报</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>统计维度 *</Label>
              <Select
                value={exportForm.dimension}
                onValueChange={(v) =>
                  setExportForm({ ...exportForm, dimension: v as typeof exportForm.dimension })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择统计维度" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">按日</SelectItem>
                  <SelectItem value="week">按周（周一至周日）</SelectItem>
                  <SelectItem value="month">按月</SelectItem>
                  <SelectItem value="year">按年</SelectItem>
                  <SelectItem value="custom">自定义范围</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-[#64748b]">
                {exportForm.dimension === 'day' && '导出所选日期当天的工时记录'}
                {exportForm.dimension === 'week' && '导出所选日期所在周（周一至周日）的工时记录'}
                {exportForm.dimension === 'month' && '导出所选日期所在月的工时记录'}
                {exportForm.dimension === 'year' && '导出所选日期所在年的工时记录'}
                {exportForm.dimension === 'custom' && '导出指定起止日期范围内的工时记录'}
              </p>
            </div>

            {exportForm.dimension === 'custom' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>开始日期 *</Label>
                  <Input
                    type="date"
                    value={exportForm.startDate}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, startDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>结束日期 *</Label>
                  <Input
                    type="date"
                    value={exportForm.endDate}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, endDate: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>基准日期 *</Label>
                <Input
                  type="date"
                  value={exportForm.date}
                  onChange={(e) => setExportForm({ ...exportForm, date: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>项目（可选）</Label>
              <Select
                value={exportForm.projectId}
                onValueChange={(v) => setExportForm({ ...exportForm, projectId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="全部项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部项目</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>导出格式 *</Label>
              <Select
                value={exportForm.format}
                onValueChange={(v) =>
                  setExportForm({ ...exportForm, format: v as typeof exportForm.format })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择导出格式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                  <SelectItem value="markdown">Markdown (.md)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-[#64748b]">
                {exportForm.format === 'excel' && '适合表格软件打开，含合并标题行与合计行'}
                {exportForm.format === 'csv' && '通用纯文本格式，UTF-8 编码（含 BOM）'}
                {exportForm.format === 'markdown' && '按日期分组的 Markdown 文档，便于阅读与归档'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExport(false)} disabled={exporting}>
              取消
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#16304f]"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  导出
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 统一填报/追加弹窗：合并原"批量填报"与"填报工时"，并支持点击已有数据的日期格子追加 */}
      <TimeEntryDialog
        open={entryDialog.open}
        onOpenChange={(open) => setEntryDialog((prev) => ({ ...prev, open }))}
        products={products}
        projects={projects}
        tasks={tasks}
        versions={versions}
        onSubmitted={() => {
          fetchEntries();
          fetchTasks();
        }}
        initialDate={entryDialog.initialDate}
        existingEntries={entryDialog.existingEntries}
        onEditEntry={(entry) => {
          setEntryDialog((prev) => ({ ...prev, open: false }));
          openEdit(entry);
        }}
        onDeleteEntry={(entry) => {
          setEntryDialog((prev) => ({ ...prev, open: false }));
          setDeleteTarget(entry);
        }}
        currentUserId={user?.id}
        currentUserRole={user?.role}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
            确定删除工时记录「{deleteTarget?.projects?.products?.name ? `${deleteTarget.projects.products.name} / ` : ''}{deleteTarget?.projects?.name || '-'}{deleteTarget?.project_versions?.name ? ` / ${deleteTarget.project_versions.name}` : ''} / {deleteTarget?.project_tasks?.name || '未分任务'} · {deleteTarget?.work_date} · {deleteTarget?.hours}h」吗？
              <br />
              该操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
              onClick={handleDelete}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
