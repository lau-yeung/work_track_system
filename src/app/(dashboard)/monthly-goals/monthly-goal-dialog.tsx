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
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { Plus, Trash2, Loader2, Copy, Wand2, ClipboardPaste, ChevronDown } from 'lucide-react';
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

/**
 * 粘贴文本自动切割为多个目标。
 * 支持的编号格式：
 *   1. / 1．/ 1、 / 1，/ 1, / 1) / 1）
 *   (1) / （1） / [1] / 【1】
 *   一、 / 二．/ 三. / 一） / （一）
 *   - / • / * / · / ▪（项目符号）
 * 无编号时按换行切分，每行一个目标。
 */
function parseBulkText(text: string): string[] {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/);
  // 各类行首编号前缀正则
  const numberingRegex =
    /^\s*(?:[0-9０-９]+[.．、，,)\）]|[\(（]\s*[0-9０-９]+\s*[\)）]|\[\s*[0-9０-９]+\s*\]|【\s*[0-9０-９]+\s*】|[一二三四五六七八九十]+[.．、，,)\）]?|[•\*\-·▪])\s*/;
  const goals: string[] = [];
  for (const line of lines) {
    let g = line.trim();
    if (!g) continue;
    // 去掉行首编号前缀
    g = g.replace(numberingRegex, '').trim();
    if (!g) continue;
    // 去掉末尾的句号/分号，保持目标标题简洁
    g = g.replace(/[。；;]+$/, '').trim();
    if (!g) continue;
    goals.push(g);
  }
  return goals;
}

interface AIGenerateItem {
  goals: string;
  expected_output: string;
  task_breakdown: string;
  planned_completion_date: string;
  acceptance_criteria: string;
  risk_points: string;
}

interface AIGenerateResponse {
  data: {
    items: AIGenerateItem[];
    usedExternalAI: boolean;
    fallback?: 'none' | 'section-parse' | 'fallback-factory';
  };
}

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
  // 粘贴文本批量录入
  const [bulkText, setBulkText] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  // AI 一键生成
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratingRow, setAiGeneratingRow] = useState<number | null>(null);
  // 单字段 AI 生成状态：key=`${rowIndex}-${fieldName}`
  const [aiGeneratingField, setAiGeneratingField] = useState<string | null>(null);
  // AI 配置状态（用于前端提示）
  const [aiStatus, setAiStatus] = useState<{
    enabled: boolean;
    provider: 'builtin' | 'external';
    isConfigured: boolean;
    configComplete: boolean;
    message: string;
    endpoint?: string;
    model?: string;
  } | null>(null);
  // AI 最近一次调用结果提示
  const [aiResultTip, setAiResultTip] = useState<{
    usedExternalAI: boolean;
    count: number;
    fallback?: 'none' | 'section-parse' | 'fallback-factory';
    message?: string;
    error?: string;
  } | null>(null);

  // 打开弹窗时拉取 AI 配置状态
  useEffect(() => {
    if (open) {
      setRows(editingGoal ? [rowFromGoal(editingGoal)] : [createEmptyRow()]);
      setBulkText('');
      setBulkOpen(false);
      setAiResultTip(null);
      if (!isEdit) {
        apiFetch<{ data: typeof aiStatus }>('/api/ai/config-status')
          .then((resp) => setAiStatus(resp?.data || null))
          .catch(() => setAiStatus(null));
      } else {
        setAiStatus(null);
      }
    }
  }, [open, editingGoal, isEdit]);

  const resetForm = () => {
    setRows([createEmptyRow()]);
    setBulkText('');
    setBulkOpen(false);
  };

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

  // 粘贴文本解析并填充到 rows
  const handleParseBulk = () => {
    const goals = parseBulkText(bulkText);
    if (goals.length === 0) {
      toast.error('未识别到有效目标，请检查粘贴的文本');
      return;
    }
    setRows(goals.map((g) => ({ ...createEmptyRow(), goals: g })));
    toast.success(`已切割为 ${goals.length} 个目标，可继续编辑或一键 AI 生成`);
    setBulkText('');
    setBulkOpen(false);
  };

  // AI 一键生成所有目标的详细字段
  const handleAIGenerateAll = async () => {
    const goalsWithTitle = rows
      .map((r) => r.goals.trim())
      .filter((g) => g.length > 0);
    if (goalsWithTitle.length === 0) {
      toast.error('请先填写目标标题，或粘贴文本切割后再 AI 生成');
      return;
    }
    setAiGenerating(true);
    setAiResultTip(null);
    try {
      const resp = await apiFetch<AIGenerateResponse>('/api/ai/monthly-goal-generate', {
        method: 'POST',
        body: JSON.stringify({ year, month, goals: goalsWithTitle }),
      });
      const items = resp?.data?.items || [];
      const usedAI = !!resp?.data?.usedExternalAI;
      const fallback = resp?.data?.fallback;
      if (items.length === 0) {
        setAiResultTip({ usedExternalAI: usedAI, count: 0, fallback, message: 'AI 未返回有效内容' });
        toast.error('AI 未返回有效内容，请稍后重试或手动填写');
        return;
      }
      // 按 goals 顺序回填：仅当行有标题时才覆盖 AI 字段
      setRows((prev) =>
        prev.map((row, i) => {
          const titleIdx = prev
            .slice(0, i + 1)
            .filter((r) => r.goals.trim().length > 0).length - 1;
          const ai = items[titleIdx];
          if (!ai) return row;
          return {
            ...row,
            expected_output: ai.expected_output || row.expected_output,
            task_breakdown: ai.task_breakdown || row.task_breakdown,
            planned_completion_date: ai.planned_completion_date || row.planned_completion_date,
            acceptance_criteria: ai.acceptance_criteria || row.acceptance_criteria,
            risk_points: ai.risk_points || row.risk_points,
          };
        })
      );
      setAiResultTip({
        usedExternalAI: usedAI,
        count: items.length,
        fallback,
      });
      // 根据 usedExternalAI 和 fallback 给出明确提示
      if (usedAI && fallback === 'none') {
        toast.success(`✅ 外部 AI 已生成 ${items.length} 条目标详细字段，可手动调整`);
      } else if (usedAI && fallback === 'section-parse') {
        toast.success(`✅ 外部 AI 已生成 ${items.length} 条目标详细字段（分节解析），可手动调整`);
      } else if (usedAI && fallback === 'fallback-factory') {
        toast.warning(`⚠️ 外部 AI 调用失败，已用兜底规则生成 ${items.length} 条，请检查 AI 配置或手动填写`);
      } else if (!usedAI && fallback === 'fallback-factory') {
        toast.warning(`⚠️ 未走外部 AI，已用兜底规则生成 ${items.length} 条，请在「系统配置 → AI配置」检查开关`);
      } else {
        toast.success(`✅ 已生成 ${items.length} 条目标详细字段，可手动调整`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI 生成失败';
      setAiResultTip({ usedExternalAI: false, count: 0, error: msg });
      toast.error(msg);
    } finally {
      setAiGenerating(false);
    }
  };

  // 单条目标 AI 重新生成
  const handleAIGenerateRow = async (index: number) => {
    const title = rows[index]?.goals.trim();
    if (!title) {
      toast.error('请先填写目标标题');
      return;
    }
    setAiGeneratingRow(index);
    try {
      const resp = await apiFetch<AIGenerateResponse>('/api/ai/monthly-goal-generate', {
        method: 'POST',
        body: JSON.stringify({ year, month, goals: [title] }),
      });
      const ai = resp?.data?.items?.[0];
      const usedAI = !!resp?.data?.usedExternalAI;
      if (!ai) {
        toast.error('AI 未返回有效内容');
        return;
      }
      setRows((prev) =>
        prev.map((row, i) =>
          i === index
            ? {
                ...row,
                expected_output: ai.expected_output || row.expected_output,
                task_breakdown: ai.task_breakdown || row.task_breakdown,
                planned_completion_date:
                  ai.planned_completion_date || row.planned_completion_date,
                acceptance_criteria: ai.acceptance_criteria || row.acceptance_criteria,
                risk_points: ai.risk_points || row.risk_points,
              }
            : row
        )
      );
      toast.success(
        usedAI
          ? `✅ 外部 AI 已重新生成该目标的详细字段，可手动调整`
          : `⚠️ 未走外部 AI，已用内置规则重新生成，请检查 AI 配置`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 生成失败');
    } finally {
      setAiGeneratingRow(null);
    }
  };

  // 单字段 AI 生成：仅生成指定行的指定字段
  const handleAIGenerateField = async (
    index: number,
    field: 'expected_output' | 'task_breakdown' | 'planned_completion_date' | 'acceptance_criteria' | 'risk_points'
  ) => {
    const title = rows[index]?.goals.trim();
    if (!title) {
      toast.error('请先填写目标标题');
      return;
    }
    const key = `${index}-${field}`;
    setAiGeneratingField(key);
    try {
      const resp = await apiFetch<{
        data: {
          field: string;
          value: string;
          usedExternalAI: boolean;
          fallback?: 'none' | 'section-parse' | 'fallback-factory';
        };
      }>('/api/ai/monthly-goal-generate', {
        method: 'POST',
        body: JSON.stringify({ year, month, goals: [title], field }),
      });
      const value = resp?.data?.value || '';
      const usedAI = !!resp?.data?.usedExternalAI;
      const fb = resp?.data?.fallback;
      if (!value) {
        toast.error('AI 未返回有效内容');
        return;
      }
      setRows((prev) =>
        prev.map((row, i) =>
          i === index ? { ...row, [field]: value } : row
        )
      );
      if (usedAI && fb === 'none') {
        toast.success(`✅ AI 已生成「${fieldLabel(field)}」`);
      } else if (fb === 'fallback-factory') {
        toast.warning(`⚠️ 兜底规则生成「${fieldLabel(field)}」（AI 调用失败或未配置）`);
      } else {
        toast.success(`✅ 已生成「${fieldLabel(field)}」`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 生成失败');
    } finally {
      setAiGeneratingField(null);
    }
  };

  // 字段名中文映射
  function fieldLabel(field: string): string {
    const map: Record<string, string> = {
      expected_output: '预期产出',
      task_breakdown: '计划任务拆解',
      planned_completion_date: '计划完成时间',
      acceptance_criteria: '验收标准',
      risk_points: '风险点',
    };
    return map[field] || field;
  }

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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 border-b border-[#e2e8f0] shrink-0 flex-row items-center justify-between">
          <DialogTitle className="text-base">
            {isEdit ? `编辑月度目标（${year}年${month}月）` : `录入月度目标（${year}年${month}月）`}
          </DialogTitle>
          {!isEdit && (
            <div className="flex items-center gap-2 pr-8">
              {aiStatus && (
                <span
                  className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    aiStatus.enabled && aiStatus.configComplete
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      aiStatus.enabled && aiStatus.configComplete
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                    }`}
                  />
                  {aiStatus.enabled && aiStatus.configComplete
                    ? `AI 就绪`
                    : aiStatus.enabled
                      ? 'AI 未配置完整'
                      : 'AI 未启用'}
                </span>
              )}
              <Button
                size="sm"
                onClick={handleAIGenerateAll}
                disabled={
                  aiGenerating ||
                  aiGeneratingRow !== null ||
                  aiGeneratingField !== null ||
                  rows.every((r) => !r.goals.trim())
                }
                title={
                  !aiStatus?.enabled || !aiStatus.configComplete
                    ? 'AI 未配置完整，将使用内置规则生成。请在「系统配置 → AI配置」中开启外部 AI'
                    : '根据已填写的目标标题，结合上月日报一键 AI 生成全部详细字段'
                }
                className="bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] text-white hover:from-[#2c5282] hover:to-[#1e3a5f] border-0 font-semibold shadow-sm"
              >
                {aiGenerating ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-1" />
                )}
                {aiGenerating ? '生成中...' : 'AI 一键生成（全部）'}
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* AI 最近一次调用结果 */}
        {aiResultTip && (
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                aiResultTip.error
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : aiResultTip.usedExternalAI && aiResultTip.fallback === 'none'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : aiResultTip.fallback === 'fallback-factory'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              {aiResultTip.error ? (
                <>❌ {aiResultTip.error}</>
              ) : aiResultTip.usedExternalAI && aiResultTip.fallback === 'none' ? (
                <>✅ 外部 AI 生成 {aiResultTip.count} 条</>
              ) : aiResultTip.usedExternalAI && aiResultTip.fallback === 'section-parse' ? (
                <>✅ 外部 AI 生成 {aiResultTip.count} 条（分节解析）</>
              ) : aiResultTip.fallback === 'fallback-factory' ? (
                <>⚠️ 兜底规则生成 {aiResultTip.count} 条（AI 调用失败或未配置）</>
              ) : aiResultTip.usedExternalAI ? (
                <>✅ 外部 AI 生成 {aiResultTip.count} 条</>
              ) : (
                <>⚠️ 内置规则生成 {aiResultTip.count} 条</>
              )}
            </span>
          </div>
        )}

        {!isEdit && (
          <p className="text-xs text-[#64748b]">
            每个目标独立维护预期产出、任务拆解、完成时间、验收标准与风险点，支持一次录入多个目标。
            本次共 {rows.length} 条目标。
          </p>
        )}

        <div className="space-y-3">
          {!isEdit && (
            <>
              {/* 快速录入：仅粘帖文本自动切割 */}
              <Collapsible open={bulkOpen} onOpenChange={setBulkOpen}>
                <div className="border border-[#cbd5e1] rounded-md bg-[#f1f5f9]/60">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-3 text-sm font-medium text-[#1e3a5f] hover:bg-[#e2e8f0]/50 rounded-md"
                    >
                      <span className="flex items-center gap-2">
                        <ClipboardPaste className="w-4 h-4" />
                        快速录入（粘贴文本自动切割）
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${bulkOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="p-3 pt-0 space-y-2">
                    <Textarea
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder={`粘贴多行文本，自动识别编号并切割，例如：\n1，Starfish V5.0 仿真版本测试\n2，Dolphin V2.2 版本测试\n3，Manta V2.x UE4 版本测试`}
                      rows={5}
                      className="bg-white"
                    />
                    <div className="flex flex-wrap gap-2 items-center">
                      <Button
                        size="sm"
                        onClick={handleParseBulk}
                        disabled={!bulkText.trim()}
                      >
                        <ClipboardPaste className="w-4 h-4 mr-1" />
                        解析并填充
                      </Button>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </>
          )}

          {rows.map((row, index) => (
            <div
              key={index}
              className="border border-[#e2e8f0] rounded-md p-3 space-y-2 bg-[#f8fafc]/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#1e3a5f]">
                  目标 {index + 1}
                </span>
                <div className="flex items-center gap-1">
                  {!isEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAIGenerateRow(index)}
                      disabled={
                        aiGenerating ||
                        aiGeneratingRow !== null ||
                        aiGeneratingField !== null ||
                        !row.goals.trim()
                      }
                      className="border-[#1e3a5f]/40 text-[#1e3a5f] hover:bg-[#1e3a5f]/5"
                      title="根据该目标标题，结合上月日报重新生成全部五个字段"
                    >
                      {aiGeneratingRow === index ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Wand2 className="w-3 h-3 mr-1" />
                      )}
                      {aiGeneratingRow === index ? '生成中...' : 'AI 生成全部字段'}
                    </Button>
                  )}
                  {!isEdit && index > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyFromAbove(index)}
                      className="text-[#64748b] hover:text-[#1e3a5f] hover:bg-[#e2e8f0]/50"
                      title="一键复制上一条目标的全部字段"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                  {!isEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(index)}
                      disabled={rows.length === 1}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      title="删除该目标"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
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
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-[#64748b]">预期产出</Label>
                    {!isEdit && (
                      <button
                        type="button"
                        onClick={() => handleAIGenerateField(index, 'expected_output')}
                        disabled={
                          aiGenerating ||
                          aiGeneratingRow !== null ||
                          aiGeneratingField !== null ||
                          !row.goals.trim()
                        }
                        className="text-[#1e3a5f] hover:text-[#2c5282] disabled:opacity-40 disabled:cursor-not-allowed"
                        title="AI 仅生成「预期产出」"
                      >
                        {aiGeneratingField === `${index}-expected_output` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <Textarea
                    value={row.expected_output}
                    onChange={(e) => updateRow(index, 'expected_output', e.target.value)}
                    placeholder="代码、文档、版本"
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-[#64748b]">计划完成时间</Label>
                    {!isEdit && (
                      <button
                        type="button"
                        onClick={() => handleAIGenerateField(index, 'planned_completion_date')}
                        disabled={
                          aiGenerating ||
                          aiGeneratingRow !== null ||
                          aiGeneratingField !== null ||
                          !row.goals.trim()
                        }
                        className="text-[#1e3a5f] hover:text-[#2c5282] disabled:opacity-40 disabled:cursor-not-allowed"
                        title="AI 仅生成「计划完成时间」"
                      >
                        {aiGeneratingField === `${index}-planned_completion_date` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <Input
                    type="date"
                    value={row.planned_completion_date}
                    onChange={(e) => updateRow(index, 'planned_completion_date', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-[#64748b]">计划任务拆解</Label>
                  {!isEdit && (
                    <button
                      type="button"
                      onClick={() => handleAIGenerateField(index, 'task_breakdown')}
                      disabled={
                        aiGenerating ||
                        aiGeneratingRow !== null ||
                        aiGeneratingField !== null ||
                        !row.goals.trim()
                      }
                      className="text-[#1e3a5f] hover:text-[#2c5282] disabled:opacity-40 disabled:cursor-not-allowed"
                      title="AI 仅生成「计划任务拆解」"
                    >
                      {aiGeneratingField === `${index}-task_breakdown` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Wand2 className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
                <Textarea
                  value={row.task_breakdown}
                  onChange={(e) => updateRow(index, 'task_breakdown', e.target.value)}
                  placeholder="根据目标自己拆解"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-[#64748b]">验收标准</Label>
                    {!isEdit && (
                      <button
                        type="button"
                        onClick={() => handleAIGenerateField(index, 'acceptance_criteria')}
                        disabled={
                          aiGenerating ||
                          aiGeneratingRow !== null ||
                          aiGeneratingField !== null ||
                          !row.goals.trim()
                        }
                        className="text-[#1e3a5f] hover:text-[#2c5282] disabled:opacity-40 disabled:cursor-not-allowed"
                        title="AI 仅生成「验收标准」"
                      >
                        {aiGeneratingField === `${index}-acceptance_criteria` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <Textarea
                    value={row.acceptance_criteria}
                    onChange={(e) => updateRow(index, 'acceptance_criteria', e.target.value)}
                    placeholder="什么叫完成"
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-[#64748b]">风险点</Label>
                    {!isEdit && (
                      <button
                        type="button"
                        onClick={() => handleAIGenerateField(index, 'risk_points')}
                        disabled={
                          aiGenerating ||
                          aiGeneratingRow !== null ||
                          aiGeneratingField !== null ||
                          !row.goals.trim()
                        }
                        className="text-[#1e3a5f] hover:text-[#2c5282] disabled:opacity-40 disabled:cursor-not-allowed"
                        title="AI 仅生成「风险点」"
                      >
                        {aiGeneratingField === `${index}-risk_points` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <Textarea
                    value={row.risk_points}
                    onChange={(e) => updateRow(index, 'risk_points', e.target.value)}
                    placeholder="哪里可能卡住"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))}

          {!isEdit && (
            <Button variant="outline" size="sm" onClick={addRow} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              添加一个目标
            </Button>
          )}
        </div>
        </div>

        <DialogFooter className="p-6 pt-3 border-t border-[#e2e8f0] shrink-0">
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
