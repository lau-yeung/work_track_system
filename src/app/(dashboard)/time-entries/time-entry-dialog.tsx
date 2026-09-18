'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Loader2, Copy, Edit } from 'lucide-react';
import { toast } from 'sonner';

interface ProductOption {
  id: number;
  name: string;
}

interface ProjectOption {
  id: number;
  name: string;
  status: string;
  product_id: number | null;
}

interface TaskOption {
  id: number;
  name: string;
  project_id: number;
  status: string;
}

interface VersionOption {
  id: number;
  project_id: number;
  name: string;
  status: string;
}

// 仅使用展示所需字段，避免与页面态强耦合
interface TimeEntryLite {
  id: number;
  project_id: number;
  task_id: number | null;
  version_id: number | null;
  work_date: string;
  hours: string;
  progress: number | null;
  remarks: string | null;
  completed_work: string | null;
  coordination_matters: string | null;
  tomorrow_plan: string | null;
  projects: { id: number; name: string; products?: { id: number; name: string } | null };
  project_tasks?: { id: number; name: string } | null;
  project_versions?: { id: number; name: string } | null;
  users: { id: number; real_name: string; username: string };
}

// 每行独立承载一条工时记录的全部字段，支持不同日期
interface EntryRow {
  work_date: string;
  product_id: string;
  project_id: string;
  task_id: string;
  version_id: string;
  hours: string;
  progress: string;
  completed_work: string;
  coordination_matters: string;
  tomorrow_plan: string;
  remarks: string;
}

interface TimeEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductOption[];
  projects: ProjectOption[];
  tasks: TaskOption[];
  versions: VersionOption[];
  onSubmitted: () => void;
  // 点击日历方格时传入，用于预填新行；为空时默认今天
  initialDate?: string;
  // 当日已有记录：传入后顶部展示并支持编辑/删除
  existingEntries?: TimeEntryLite[];
  // 点击"编辑"某条已有记录时的回调（页面打开单条编辑弹窗）
  onEditEntry?: (entry: TimeEntryLite) => void;
  // 点击"删除"某条已有记录时的回调（页面打开删除确认）
  onDeleteEntry?: (entry: TimeEntryLite) => void;
  // 用于判断是否显示编辑/删除按钮
  currentUserId?: number;
  currentUserRole?: string;
}

interface CurrentUser {
  id: number;
  role?: string;
}

// 本地时区格式化，避免 UTC 偏移导致日期错位
const formatLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const todayStr = () => formatLocalDate(new Date());

// 新增行默认工时为 8，产品/项目/任务可由调用方传入
const createEmptyRow = (
  initialDate?: string,
  productId = '',
  projectId = '',
  taskId = '',
  versionId = '',
  hours = '8',
  progress = ''
): EntryRow => ({
  work_date: initialDate || todayStr(),
  product_id: productId,
  project_id: projectId,
  task_id: taskId,
  version_id: versionId,
  hours,
  progress,
  completed_work: '',
  coordination_matters: '',
  tomorrow_plan: '',
  remarks: '',
});

interface SingleMutationResult {
  data: unknown;
  daily_total: number;
  is_below_minimum: boolean;
  merged?: boolean;
}

export function TimeEntryDialog({
  open,
  onOpenChange,
  products,
  projects,
  tasks,
  versions,
  onSubmitted,
  initialDate,
  existingEntries,
  onEditEntry,
  onDeleteEntry,
  currentUserId,
  currentUserRole,
}: TimeEntryDialogProps) {
  const [rows, setRows] = useState<EntryRow[]>([createEmptyRow(initialDate)]);
  const [submitting, setSubmitting] = useState(false);

  // 用 ref 保存最新的产品/项目/任务列表，避免 useEffect 因数组引用变化重复触发
  const projectsRef = useRef(projects);
  const productsRef = useRef(products);
  const tasksRef = useRef(tasks);
  const versionsRef = useRef(versions);
  projectsRef.current = projects;
  productsRef.current = products;
  tasksRef.current = tasks;
  versionsRef.current = versions;

  // 每次打开时：默认工时为 8、产品/项目/任务取最近一次录入的记录、
  // "今日完成工作"默认复制"上一个工作日"的"明日计划工作"（跳过周末和法定节假日，支持手动修改）
  useEffect(() => {
    if (!open) return;
    const date = initialDate || todayStr();
    let cancelled = false;

    (async () => {
      let prevStr = '';
      try {
        // 调内部 /api/holiday/info 获取上一个工作日
        // timor.tech: type=0 工作日、3 调休上班 都算工作日；1 周末、2 节假日 跳过
        const cursor = new Date(date);
        for (let i = 0; i < 15; i++) {
          cursor.setDate(cursor.getDate() - 1);
          const candidate = formatLocalDate(cursor);
          const hres = await apiFetch<{ isWorkday: boolean; fallback?: boolean }>(
            `/api/holiday/info?date=${candidate}`
          );
          if (hres.isWorkday) {
            prevStr = candidate;
            break;
          }
        }
        if (!prevStr) {
          // 节假日查询全失败时退化为简单"前一天"
          const prev = new Date(date);
          prev.setDate(prev.getDate() - 1);
          prevStr = formatLocalDate(prev);
        }
      } catch {
        // 兜底：前一天
        const prev = new Date(date);
        prev.setDate(prev.getDate() - 1);
        prevStr = formatLocalDate(prev);
      }

      let defaultCompletedWork = '';
      let latestProductId = '';
      let latestProjectId = '';
      let latestTaskId = '';
      let latestVersionId = '';
      let latestProgress = '';

      try {
        const [prevRes, latestRes] = await Promise.all([
          // 上一个工作日的所有记录，汇总 tomorrow_plan
          apiFetch<{ data: TimeEntryLite[] }>(
            `/api/time-entries?page=1&pageSize=50&startDate=${prevStr}&endDate=${prevStr}&mine=1`
          ),
          // 当前填报日期之前最近一次录入的记录，用于默认产品/项目/任务
          // 必须限定 endDate，否则补填历史日期时会取到未来的记录（如4月28日却默认9月数据）
          apiFetch<{ data: TimeEntryLite[] }>(
            `/api/time-entries?page=1&pageSize=1&endDate=${date}&mine=1`
          ),
        ]);

        const plans = (prevRes.data || [])
          .map((e) => e.tomorrow_plan?.trim())
          .filter(Boolean) as string[];
        defaultCompletedWork = plans.join('\n');

        const latest = latestRes.data?.[0];
        if (latest) {
          // 直接从最近记录取值，再用下拉列表校验是否存在
          const proj = projectsRef.current.find((p) => p.id === latest.project_id);
          if (proj) {
            latestProjectId = String(proj.id);
            const pid = proj.product_id ?? latest.projects?.products?.id ?? null;
            if (pid != null && productsRef.current.some((p) => p.id === pid)) {
              latestProductId = String(pid);
            }
          }
          if (latest.task_id && tasksRef.current.some((t) => t.id === latest.task_id)) {
            latestTaskId = String(latest.task_id);
          }
          if (latest.version_id && versionsRef.current.some((v) => v.id === latest.version_id)) {
            latestVersionId = String(latest.version_id);
          }
          if (latest.progress != null) {
            latestProgress = String(latest.progress);
          }
        }
      } catch {
        // 无历史记录时使用空默认值
      }

      if (cancelled) return;
      setRows([
        {
          work_date: date,
          product_id: latestProductId,
          project_id: latestProjectId,
          task_id: latestTaskId,
          version_id: latestVersionId,
          hours: '8',
          progress: latestProgress,
          completed_work: defaultCompletedWork,
          coordination_matters: '',
          tomorrow_plan: '',
          remarks: '',
        },
      ]);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initialDate]);

  const resetForm = () => {
    setRows([createEmptyRow(initialDate)]);
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      resetForm();
    }
    onOpenChange(value);
  };

  const addRow = () => {
    // 新行继承上一行的日期、产品/项目/任务与工时，便于连续填报
    const lastRow = rows[rows.length - 1];
    setRows([
      ...rows,
      createEmptyRow(
        lastRow?.work_date || initialDate,
        lastRow?.product_id,
        lastRow?.project_id,
        lastRow?.task_id,
        lastRow?.version_id,
        lastRow?.hours || '8',
        lastRow?.progress || ''
      ),
    ]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  // "上同"：一键同步上一条工时明细到当前行（含日期在内的全部字段）
  const copyFromAbove = (index: number) => {
    if (index <= 0) return;
    const above = rows[index - 1];
    setRows(rows.map((row, i) => (i === index ? { ...above } : row)));
    toast.success('已同步上一条明细，请按需修改');
  };

  const updateRow = (index: number, field: keyof EntryRow, value: string) => {
    setRows(
      rows.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [field]: value } as EntryRow;
        // 联动：切换产品时清空项目/任务/版本；切换项目时清空任务/版本
        if (field === 'product_id') {
          next.project_id = '';
          next.task_id = '';
          next.version_id = '';
        } else if (field === 'project_id') {
          next.task_id = '';
          next.version_id = '';
          // 若项目归属产品与当前所选产品不一致，自动纠正产品
          const proj = projects.find((p) => p.id === Number(value));
          if (proj?.product_id != null) {
            next.product_id = String(proj.product_id);
          }
        }
        return next;
      })
    );
  };

  // 某行在选定产品/项目下可选项
  const projectsForRow = (row: EntryRow) =>
    row.product_id
      ? projects.filter((p) => p.product_id === Number(row.product_id))
      : projects;
  const tasksForRow = (row: EntryRow) =>
    row.project_id
      ? tasks.filter(
          (t) => t.project_id === Number(row.project_id) && t.status === 'active'
        )
      : [];
  // 项目下所有版本（按需求4：填报时可选项目下所有版本，不区分任务关联）
  const versionsForRow = (row: EntryRow) =>
    row.project_id
      ? versions.filter((v) => v.project_id === Number(row.project_id))
      : [];

  // 合计工时与覆盖日期数（用于顶部汇总提示）
  const batchTotal = rows.reduce((sum, row) => {
    const h = parseFloat(row.hours);
    return sum + (isNaN(h) ? 0 : h);
  }, 0);

  // 覆盖日期数：只要选了日期就统计（工时为空按 0 计），避免选了多日期但工时未填全时显示错误
  const hoursByDate = new Map<string, number>();
  for (const row of rows) {
    if (row.work_date) {
      const h = parseFloat(row.hours);
      hoursByDate.set(row.work_date, (hoursByDate.get(row.work_date) || 0) + (isNaN(h) ? 0 : h));
    }
  }

  // 已有记录合计（仅展示用）
  const existingTotal = existingEntries
    ? Math.round(
        existingEntries.reduce((s, e) => s + parseFloat(e.hours || '0'), 0) * 10
      ) / 10
    : 0;

  const hasExisting = !!existingEntries && existingEntries.length > 0;

  const title = hasExisting
    ? `编辑/追加工时（${initialDate || existingEntries?.[0]?.work_date || ''}）`
    : initialDate
      ? `填报工时（${initialDate}）`
      : '填报工时';

  const canModifyEntry = (entry: TimeEntryLite): boolean => {
    if (currentUserRole === 'admin') return true;
    return entry.users?.id === currentUserId;
  };

  const handleSubmit = async () => {
    // 逐行校验
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.work_date) {
        toast.error(`第${i + 1}行：请选择工作日期`);
        return;
      }
      if (!row.product_id) {
        toast.error(`第${i + 1}行：请选择所属产品`);
        return;
      }
      if (!row.project_id) {
        toast.error(`第${i + 1}行：请选择所属项目`);
        return;
      }
      if (!row.task_id) {
        toast.error(`第${i + 1}行：请选择所属任务`);
        return;
      }
      // 一致性校验：任务必须归属所选项目，项目必须归属所选产品
      const proj = projects.find((p) => p.id === Number(row.project_id));
      const task = tasks.find((t) => t.id === Number(row.task_id));
      if (proj?.product_id != null && proj.product_id !== Number(row.product_id)) {
        toast.error(`第${i + 1}行：项目与产品不匹配，请重新选择`);
        return;
      }
      if (!task || task.project_id !== Number(row.project_id)) {
        toast.error(`第${i + 1}行：任务与项目不匹配，请重新选择`);
        return;
      }
      if (!row.hours) {
        toast.error(`第${i + 1}行：请填写工时`);
        return;
      }
      const h = parseFloat(row.hours);
      if (isNaN(h) || h <= 0 || h > 8) {
        toast.error(`第${i + 1}行：工时必须在 0-8 之间`);
        return;
      }
      if (h * 2 !== Math.floor(h * 2)) {
        toast.error(`第${i + 1}行：工时必须是 0.5 的倍数`);
        return;
      }
      if (!row.completed_work.trim()) {
        toast.error(`第${i + 1}行：请填写今日完成工作`);
        return;
      }
      if (!row.tomorrow_plan.trim()) {
        toast.error(`第${i + 1}行：请填写明日计划工作`);
        return;
      }
    }

    setSubmitting(true);

    // 循环调用单条填报 API，每行独立提交
    // 同日同项目同任务的记录会被 API 自动合并（累加工时 + 编号合并完成工作）
    const dailyTotals = new Map<string, number>();
    let successCount = 0;
    let mergedCount = 0;

    try {
      for (const row of rows) {
        const result = await apiFetch<SingleMutationResult>('/api/time-entries', {
          method: 'POST',
          body: JSON.stringify({
            product_id: parseInt(row.product_id),
            project_id: parseInt(row.project_id),
            task_id: parseInt(row.task_id),
            version_id: row.version_id ? parseInt(row.version_id) : null,
            work_date: row.work_date,
            hours: row.hours,
            progress: row.progress !== '' ? Number(row.progress) : 0,
            remarks: row.remarks,
            completed_work: row.completed_work,
            coordination_matters: row.coordination_matters,
            tomorrow_plan: row.tomorrow_plan,
          }),
        });
        dailyTotals.set(row.work_date, result.daily_total);
        successCount++;
        if (result.merged) mergedCount++;
      }

      const mergedHint = mergedCount > 0 ? `，其中 ${mergedCount} 条已合并到同日同任务记录` : '';
      toast.success(`成功填报 ${successCount} 条工时，覆盖 ${dailyTotals.size} 个日期${mergedHint}`);

      // 对每个日期检查是否不足 8h
      for (const [date, total] of dailyTotals) {
        if (total < 8) {
          toast.warning(`${date} 已填报 ${total} 小时，不足 8 小时，请确认是否需要补填`);
        }
      }

      resetForm();
      onSubmitted();
      onOpenChange(false);
    } catch (err) {
      const firstError = err instanceof Error ? err.message : '填报失败';
      if (successCount > 0) {
        toast.error(`部分失败：已成功 ${successCount} 条，剩余失败：${firstError}`);
        onSubmitted();
        onOpenChange(false);
      } else {
        toast.error(firstError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {hasExisting && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#475569]">当日已有合计</span>
              <span
                className={[
                  'font-semibold px-2 py-0.5 rounded',
                  existingTotal >= 8
                    ? 'bg-[#dcfce7] text-[#15803d]'
                    : existingTotal >= 4
                      ? 'bg-[#fef9c3] text-[#a16207]'
                      : 'bg-[#fee2e2] text-[#b91c1c]',
                ].join(' ')}
              >
                {existingTotal}h
              </span>
            </div>

            {existingEntries!.map((e) => (
              <div
                key={e.id}
                className="border border-[#e2e8f0] rounded-lg p-3 space-y-2 bg-[#f8fafc]/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#e0e7ff] text-[#3730a3] shrink-0">
                      {e.projects?.products?.name || '未分产品'}
                    </span>
                    <span className="font-medium text-[#1e3a5f] truncate">
                      {e.projects?.name || '-'}
                    </span>
                    {e.project_versions?.name && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#3730a3] font-mono shrink-0">
                        {e.project_versions.name}
                      </span>
                    )}
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#475569] truncate">
                      {e.project_tasks?.name || '未分任务'}
                    </span>
                    <span className="text-xs text-[#94a3b8] shrink-0">
                      {e.users?.real_name || '-'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.progress != null && e.progress > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#dcfce7] text-[#15803d]">
                        {e.progress}%
                      </span>
                    )}
                    <span className="text-sm font-semibold text-[#1e3a5f]">{e.hours}h</span>
                  </div>
                </div>
                {e.completed_work && (
                  <div className="text-xs text-[#475569]">
                    <span className="text-[#64748b]">完成工作：</span>
                    <span className="whitespace-pre-wrap">{e.completed_work}</span>
                  </div>
                )}
                {e.tomorrow_plan && (
                  <div className="text-xs text-[#475569]">
                    <span className="text-[#64748b]">明日计划：</span>
                    <span className="whitespace-pre-wrap">{e.tomorrow_plan}</span>
                  </div>
                )}
                {e.coordination_matters && (
                  <div className="text-xs text-[#475569]">
                    <span className="text-[#64748b]">协调事宜：</span>
                    <span className="whitespace-pre-wrap">{e.coordination_matters}</span>
                  </div>
                )}
                {e.remarks && (
                  <div className="text-xs text-[#475569]">
                    <span className="text-[#64748b]">备注：</span>
                    <span className="whitespace-pre-wrap">{e.remarks}</span>
                  </div>
                )}
                {canModifyEntry(e) && (
                  <div className="flex items-center justify-end gap-1 pt-1 border-t border-[#e2e8f0]">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditEntry?.(e)}
                      title="编辑此条记录"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteEntry?.(e)}
                      aria-label="删除工时记录"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                )}
              </div>
            ))}

            <div className="border-t border-dashed border-[#e2e8f0] pt-2">
              <p className="text-xs font-medium text-[#1e3a5f]">追加工时</p>
            </div>
          </div>
        )}

        <p className="text-xs text-[#64748b]">
          每行需选择 产品 → 项目 → 任务，支持一次填报多个日期的工时。同日同项目同任务记录会自动合并。
          {hoursByDate.size > 0 && (
            <span className="text-[#1e3a5f] font-medium">
              {' '}本次合计 {batchTotal} 小时，覆盖 {hoursByDate.size} 个日期。
            </span>
          )}
        </p>

        <div className="space-y-3">
          <Label>工时明细</Label>
          {rows.map((row, index) => (
            <div
              key={index}
              className="border border-[#e2e8f0] rounded-md p-3 space-y-2 bg-[#f8fafc]/50"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-[#64748b]">工作日期 *</Label>
                  <Input
                    type="date"
                    value={row.work_date}
                    onChange={(e) => updateRow(index, 'work_date', e.target.value)}
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs text-[#64748b]">工时(h) *</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="8"
                    value={row.hours}
                    onChange={(e) => updateRow(index, 'hours', e.target.value)}
                    placeholder="如 4"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(index)}
                  disabled={rows.length === 1}
                  className="mt-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {/* 产品 → 项目 → 版本 → 任务 四级联动（版本为可选） */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs text-[#64748b]">产品 *</Label>
                  <Select
                    value={row.product_id}
                    onValueChange={(v) => updateRow(index, 'product_id', v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择产品" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs text-[#64748b]">项目 *</Label>
                  <Select
                    value={row.project_id}
                    onValueChange={(v) => updateRow(index, 'project_id', v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择项目" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectsForRow(row).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs text-[#64748b]">版本（可选）</Label>
                  <Select
                    value={row.version_id || 'none'}
                    onValueChange={(v) => updateRow(index, 'version_id', v === 'none' ? '' : v)}
                    disabled={!row.project_id}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          row.project_id
                            ? versionsForRow(row).length > 0
                              ? '不选版本'
                              : '该项目暂无版本'
                            : '请先选项目'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不选版本</SelectItem>
                      {versionsForRow(row).map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs text-[#64748b]">任务 *</Label>
                  <Select
                    value={row.task_id}
                    onValueChange={(v) => updateRow(index, 'task_id', v)}
                    disabled={!row.project_id}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={row.project_id ? '选择任务' : '请先选项目'} />
                    </SelectTrigger>
                    <SelectContent>
                      {tasksForRow(row).map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 进度（手动录入，0-100 整数） */}
              <div className="space-y-1">
                <Label className="text-xs text-[#64748b]">任务进度(%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={row.progress}
                  onChange={(e) => updateRow(index, 'progress', e.target.value)}
                  placeholder="如 30，表示 30%"
                  disabled={!row.task_id}
                />
              </div>

              {index > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyFromAbove(index)}
                  className="w-full"
                  title="一键复制上一条的全部字段（日期、产品、项目、任务、工时、完成工作、明日计划、协调事宜、备注）"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  上同（同步上一条明细）
                </Button>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-[#64748b]">今日完成工作 *</Label>
                <Textarea
                  value={row.completed_work}
                  onChange={(e) => updateRow(index, 'completed_work', e.target.value)}
                  placeholder="请描述该日期该任务完成的工作"
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#64748b]">明日计划工作 *</Label>
                <Textarea
                  value={row.tomorrow_plan}
                  onChange={(e) => updateRow(index, 'tomorrow_plan', e.target.value)}
                  placeholder="请描述明日计划工作"
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#64748b]">需协调事宜</Label>
                <Textarea
                  value={row.coordination_matters}
                  onChange={(e) => updateRow(index, 'coordination_matters', e.target.value)}
                  placeholder="可选，需要协调的事项"
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#64748b]">备注</Label>
                <Textarea
                  value={row.remarks}
                  onChange={(e) => updateRow(index, 'remarks', e.target.value)}
                  placeholder="可选备注"
                  rows={1}
                />
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addRow} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            添加一行
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            className="bg-[#1e3a5f] hover:bg-[#16304f]"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                提交中...
              </>
            ) : (
              `提交填报（${rows.length} 条）`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { TimeEntryLite, ProductOption, ProjectOption, TaskOption, VersionOption, CurrentUser };
