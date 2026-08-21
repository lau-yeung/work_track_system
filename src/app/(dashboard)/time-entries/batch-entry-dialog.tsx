'use client';

import { useState } from 'react';
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
import { Plus, Trash2, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectOption {
  id: number;
  name: string;
  status: string;
}

// 每行独立承载一条工时记录的全部字段，支持不同日期
interface BatchEntryRow {
  work_date: string;
  project_id: string;
  hours: string;
  completed_work: string;
  coordination_matters: string;
  tomorrow_plan: string;
  remarks: string;
}

interface BatchEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  onSubmitted: () => void;
}

const todayStr = () => new Date().toISOString().split('T')[0];

const createEmptyRow = (): BatchEntryRow => ({
  work_date: todayStr(),
  project_id: '',
  hours: '',
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

export function BatchEntryDialog({
  open,
  onOpenChange,
  projects,
  onSubmitted,
}: BatchEntryDialogProps) {
  const [rows, setRows] = useState<BatchEntryRow[]>([createEmptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setRows([createEmptyRow()]);
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      resetForm();
    }
    onOpenChange(value);
  };

  const addRow = () => {
    setRows([...rows, createEmptyRow()]);
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

  const updateRow = (index: number, field: keyof BatchEntryRow, value: string) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

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

  const handleSubmit = async () => {
    // 逐行校验
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.work_date) {
        toast.error(`第${i + 1}行：请选择工作日期`);
        return;
      }
      if (!row.project_id) {
        toast.error(`第${i + 1}行：请选择项目`);
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
    // 同日同项目的记录会被 API 自动合并（累加工时 + 编号合并完成工作）
    const dailyTotals = new Map<string, number>();
    let successCount = 0;
    let mergedCount = 0;
    let firstError: string | null = null;

    try {
      for (const row of rows) {
        const result = await apiFetch<SingleMutationResult>('/api/time-entries', {
          method: 'POST',
          body: JSON.stringify({
            project_id: parseInt(row.project_id),
            work_date: row.work_date,
            hours: row.hours,
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

      const mergedHint = mergedCount > 0 ? `，其中 ${mergedCount} 条已合并到同日同项目记录` : '';
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
      firstError = err instanceof Error ? err.message : '批量填报失败';
      if (successCount > 0) {
        toast.error(
          `部分失败：已成功 ${successCount} 条，剩余失败：${firstError}`
        );
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
          <DialogTitle>批量填报工时（多日期）</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-[#64748b] -mt-2">
          每行可独立选择日期与项目，支持一次填报多个日期的工时。同日同项目记录会自动合并。
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
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-[#64748b]">项目 *</Label>
                  <Select
                    value={row.project_id}
                    onValueChange={(v) => updateRow(index, 'project_id', v)}
                  >
                    <SelectTrigger>
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
                </div>
                <div className="w-28 space-y-1">
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
              {index > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyFromAbove(index)}
                  className="w-full"
                  title="一键复制上一条的全部字段（日期、项目、工时、完成工作、明日计划、协调事宜、备注）"
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
                  placeholder="请描述该日期该项目完成的工作"
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
                  rows={2}
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
              `提交批量填报（${rows.length} 条）`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
