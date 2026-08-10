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
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectOption {
  id: number;
  name: string;
  status: string;
}

interface BatchEntryRow {
  project_id: string;
  hours: string;
  completed_work: string;
  remarks: string;
}

interface BatchMutationResult {
  data: Array<Record<string, unknown>>;
  daily_total: number;
  is_below_minimum: boolean;
}

interface BatchEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  onSubmitted: () => void;
  existingDailyTotal?: number;
}

const createEmptyRow = (): BatchEntryRow => ({
  project_id: '',
  hours: '',
  completed_work: '',
  remarks: '',
});

const todayStr = () => new Date().toISOString().split('T')[0];

export function BatchEntryDialog({
  open,
  onOpenChange,
  projects,
  onSubmitted,
  existingDailyTotal,
}: BatchEntryDialogProps) {
  const [workDate, setWorkDate] = useState(todayStr());
  const [coordinationMatters, setCoordinationMatters] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [rows, setRows] = useState<BatchEntryRow[]>([createEmptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setWorkDate(todayStr());
    setCoordinationMatters('');
    setTomorrowPlan('');
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

  const updateRow = (index: number, field: keyof BatchEntryRow, value: string) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const batchTotal = rows.reduce((sum, row) => {
    const h = parseFloat(row.hours);
    return sum + (isNaN(h) ? 0 : h);
  }, 0);

  const remaining = existingDailyTotal !== undefined ? 8 - existingDailyTotal : 8;

  const handleSubmit = async () => {
    // Validation
    if (!workDate) {
      toast.error('请选择工作日期');
      return;
    }
    if (!tomorrowPlan.trim()) {
      toast.error('请填写明日计划工作');
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
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
    }

    // Check duplicate projects
    const projectIds = rows.map((r) => r.project_id);
    if (new Set(projectIds).size !== projectIds.length) {
      toast.error('批量填报中存在重复项目，每个项目只能填报一次');
      return;
    }

    // Check daily total
    if (existingDailyTotal !== undefined && existingDailyTotal + batchTotal > 8) {
      toast.error(
        `单日工时总计不能超过8小时（已填报${existingDailyTotal}小时，本次拟填报${batchTotal}小时）`
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch<BatchMutationResult>('/api/time-entries/batch', {
        method: 'POST',
        body: JSON.stringify({
          work_date: workDate,
          coordination_matters: coordinationMatters,
          tomorrow_plan: tomorrowPlan,
          entries: rows.map((r) => ({
            project_id: parseInt(r.project_id),
            hours: r.hours,
            completed_work: r.completed_work,
            remarks: r.remarks,
          })),
        }),
      });

      toast.success(`成功填报 ${result.data.length} 条工时`);
      if (result.is_below_minimum) {
        toast.warning(
          `今日已填报 ${result.daily_total} 小时，不足 8 小时，请确认是否需要补填`
        );
      }

      resetForm();
      onSubmitted();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '批量填报失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>批量填报工时</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Shared date */}
          <div className="space-y-2">
            <Label>工作日期 *</Label>
            <Input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
            {existingDailyTotal !== undefined && (
              <p className="text-xs text-[#64748b]">
                今日已填报 {existingDailyTotal} 小时，剩余 {remaining} 小时可填报
                {batchTotal > 0 && (
                  <span className={batchTotal > remaining ? 'text-red-500' : ''}>
                    {' '}| 本次拟填报 {batchTotal} 小时
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Dynamic rows */}
          <div className="space-y-3">
            <Label>工时明细（每行一个项目）</Label>
            {rows.map((row, index) => (
              <div
                key={index}
                className="border border-[#e2e8f0] rounded-md p-3 space-y-2 bg-[#f8fafc]/50"
              >
                <div className="flex items-start gap-2">
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
                <div className="space-y-1">
                  <Label className="text-xs text-[#64748b]">今日完成工作 *</Label>
                  <Textarea
                    value={row.completed_work}
                    onChange={(e) => updateRow(index, 'completed_work', e.target.value)}
                    placeholder="请描述该项目今日完成的工作"
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

          {/* Shared fields */}
          <div className="space-y-2">
            <Label>需协调事宜</Label>
            <Textarea
              value={coordinationMatters}
              onChange={(e) => setCoordinationMatters(e.target.value)}
              placeholder="可选，需要协调的事项（所有项目共用）"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>明日计划工作 *</Label>
            <Textarea
              value={tomorrowPlan}
              onChange={(e) => setTomorrowPlan(e.target.value)}
              placeholder="请描述明日计划工作（所有项目共用）"
              rows={3}
            />
          </div>
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
              '提交批量填报'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
