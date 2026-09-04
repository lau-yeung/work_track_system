'use client';

import { useEffect, useState } from 'react';
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
import { Plus, Trash2, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';

export interface MonthlyGoal {
  id: number;
  user_id: number;
  period_year: number;
  period_month: number;
  goals: string;
  expected_output: string | null;
  task_breakdown: string | null;
  planned_completion_date: string | null;
  acceptance_criteria: string | null;
  risk_points: string | null;
  status: string;
  sort_order: number;
  users?: { id: number; real_name: string; username: string };
}

// 每行独立承载一个目标的全部字段，支持一次录入多个目标
interface GoalRow {
  goals: string;
  expected_output: string;
  task_breakdown: string;
  planned_completion_date: string;
  acceptance_criteria: string;
  risk_points: string;
}

interface MonthlyGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
  onSubmitted: () => void;
  // 传入则为单条编辑模式（PUT /:id）；为空则为批量新增模式（POST items）
  editingGoal?: MonthlyGoal | null;
}

const createEmptyRow = (): GoalRow => ({
  goals: '',
  expected_output: '',
  task_breakdown: '',
  planned_completion_date: '',
  acceptance_criteria: '',
  risk_points: '',
});

const rowFromGoal = (g: MonthlyGoal): GoalRow => ({
  goals: g.goals || '',
  expected_output: g.expected_output || '',
  task_breakdown: g.task_breakdown || '',
  planned_completion_date: g.planned_completion_date || '',
  acceptance_criteria: g.acceptance_criteria || '',
  risk_points: g.risk_points || '',
});

export function MonthlyGoalDialog({
  open,
  onOpenChange,
  year,
  month,
  onSubmitted,
  editingGoal,
}: MonthlyGoalDialogProps) {
  const isEdit = !!editingGoal;
  const [rows, setRows] = useState<GoalRow[]>([createEmptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setRows(editingGoal ? [rowFromGoal(editingGoal)] : [createEmptyRow()]);
    }
  }, [open, editingGoal]);

  const resetForm = () => setRows([createEmptyRow()]);

  const handleOpenChange = (value: boolean) => {
    if (!value) resetForm();
    onOpenChange(value);
  };

  const addRow = () => setRows([...rows, createEmptyRow()]);

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  // “上同”：一键复制上一条目标的全部字段
  const copyFromAbove = (index: number) => {
    if (index <= 0) return;
    const above = rows[index - 1];
    setRows(rows.map((row, i) => (i === index ? { ...above } : row)));
    toast.success('已同步上一条目标内容，请按需修改');
  };

  const updateRow = (index: number, field: keyof GoalRow, value: string) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleSubmit = async () => {
    // 逐行校验：目标内容必填
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].goals.trim()) {
        toast.error(`第 ${i + 1} 条目标：请填写月度目标内容`);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isEdit && editingGoal) {
        await apiFetch(`/api/monthly-goals/${editingGoal.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            goals: rows[0].goals.trim(),
            expected_output: rows[0].expected_output || null,
            task_breakdown: rows[0].task_breakdown || null,
            planned_completion_date: rows[0].planned_completion_date || null,
            acceptance_criteria: rows[0].acceptance_criteria || null,
            risk_points: rows[0].risk_points || null,
          }),
        });
        toast.success('目标已更新');
      } else {
        const items = rows
          .filter((r) => r.goals.trim())
          .map((r) => ({
            goals: r.goals.trim(),
            expected_output: r.expected_output || null,
            task_breakdown: r.task_breakdown || null,
            planned_completion_date: r.planned_completion_date || null,
            acceptance_criteria: r.acceptance_criteria || null,
            risk_points: r.risk_points || null,
          }));
        const resp = await apiFetch<{ count: number }>('/api/monthly-goals', {
          method: 'POST',
          body: JSON.stringify({ year, month, items }),
        });
        toast.success(`成功录入 ${resp.count ?? items.length} 条月度目标`);
      }
      resetForm();
      onSubmitted();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `编辑月度目标（${year}年${month}月）` : `录入月度目标（${year}年${month}月）`}
          </DialogTitle>
        </DialogHeader>

        {!isEdit && (
          <p className="text-xs text-[#64748b]">
            每个目标独立维护预期产出、任务拆解、完成时间、验收标准与风险点，支持一次录入多个目标。
            本次共 {rows.length} 条目标。
          </p>
        )}

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={index}
              className="border border-[#e2e8f0] rounded-md p-3 space-y-2 bg-[#f8fafc]/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#1e3a5f]">
                  目标 {index + 1}
                </span>
                {!isEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(index)}
                    disabled={rows.length === 1}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-[#64748b]">月度目标 *</Label>
                <Textarea
                  value={row.goals}
                  onChange={(e) => updateRow(index, 'goals', e.target.value)}
                  placeholder="最重要的几个目标"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-[#64748b]">预期产出</Label>
                  <Textarea
                    value={row.expected_output}
                    onChange={(e) => updateRow(index, 'expected_output', e.target.value)}
                    placeholder="代码、文档、版本"
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-[#64748b]">计划完成时间</Label>
                  <Input
                    type="date"
                    value={row.planned_completion_date}
                    onChange={(e) => updateRow(index, 'planned_completion_date', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-[#64748b]">计划任务拆解</Label>
                <Textarea
                  value={row.task_breakdown}
                  onChange={(e) => updateRow(index, 'task_breakdown', e.target.value)}
                  placeholder="根据目标自己拆解"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-[#64748b]">验收标准</Label>
                  <Textarea
                    value={row.acceptance_criteria}
                    onChange={(e) => updateRow(index, 'acceptance_criteria', e.target.value)}
                    placeholder="什么叫完成"
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-[#64748b]">风险点</Label>
                  <Textarea
                    value={row.risk_points}
                    onChange={(e) => updateRow(index, 'risk_points', e.target.value)}
                    placeholder="哪里可能卡住"
                    rows={2}
                  />
                </div>
              </div>

              {!isEdit && index > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyFromAbove(index)}
                  className="w-full"
                  title="一键复制上一条目标的全部字段"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  上同（同步上一条目标内容）
                </Button>
              )}
            </div>
          ))}

          {!isEdit && (
            <Button variant="outline" size="sm" onClick={addRow} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              添加一个目标
            </Button>
          )}
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
            ) : isEdit ? (
              '保存修改'
            ) : (
              `提交录入（${rows.length} 条目标）`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
