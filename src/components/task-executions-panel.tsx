'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

export interface TaskExecution {
  id: number;
  task_id: number;
  name: string;
  description: string | null;
  status: string; // 'active' | 'done'
  sort_order: number;
  completed_at: string | null;
  completed_by: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  users?: { id: number; real_name: string } | null;
  completer?: { id: number; real_name: string } | null;
}

interface TaskExecutionsPanelProps {
  taskId: number;
  /**
   * manage: 完整 CRUD + 勾选（任务管理页/项目页用）
   * select: 仅勾选，状态由父组件受控（日报填报用）
   */
  mode?: 'manage' | 'select';
  /** mode='select' 时受控的选中执行 id 列表 */
  selectedIds?: number[];
  /** mode='select' 时勾选变化回调 */
  onSelectionChange?: (ids: number[]) => void;
  /** mode='manage' 时切换状态后回调，通知最新任务进度 */
  onProgressChange?: (progress: number) => void;
  /** 是否禁用（如填报弹窗中未选任务时） */
  disabled?: boolean;
  /** 紧凑模式（高度受限场景） */
  compact?: boolean;
}

/**
 * 任务执行管理面板（共用组件）
 *
 * - mode='manage'：任务管理页/项目页用，展示执行列表 + 增删改 + 勾选完成（调 toggle API 后 refetch）
 * - mode='select'：日报填报用，展示执行列表 + 勾选（受控），勾选状态通过 onSelectionChange 回传父组件
 */
export function TaskExecutionsPanel({
  taskId,
  mode = 'manage',
  selectedIds,
  onSelectionChange,
  onProgressChange,
  disabled = false,
  compact = false,
}: TaskExecutionsPanelProps) {
  const [executions, setExecutions] = useState<TaskExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchExecutions = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ data: TaskExecution[] }>(
        `/api/tasks/${taskId}/executions`
      );
      setExecutions(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询执行失败');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  // 管理模式：添加执行
  const handleAdd = async () => {
    if (mode !== 'manage') return;
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error('请填写执行名称');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${taskId}/executions`, {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      toast.success('执行已添加');
      setNewName('');
      fetchExecutions();
      onProgressChange?.(0); // 触发父组件 refetch 任务进度
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 管理模式：保存编辑
  const saveEdit = async (id: number) => {
    if (mode !== 'manage') return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error('执行名称不能为空');
      return;
    }
    if (trimmed === executions.find((e) => e.id === id)?.name) {
      setEditingId(null);
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/api/executions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmed }),
      });
      toast.success('已更新');
      setEditingId(null);
      fetchExecutions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 管理模式：删除
  const handleDelete = async (id: number) => {
    if (mode !== 'manage') return;
    if (!window.confirm('确认删除该执行？此操作不可撤销。')) return;
    try {
      await apiFetch(`/api/executions/${id}`, { method: 'DELETE' });
      toast.success('已删除');
      fetchExecutions();
      onProgressChange?.(0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  // 管理模式：切换完成状态（调 toggle API）
  const handleToggleManage = async (exec: TaskExecution) => {
    if (mode !== 'manage') return;
    try {
      const res = await apiFetch<{ progress: number }>(
        `/api/executions/${exec.id}/toggle`,
        {
          method: 'PUT',
          body: JSON.stringify({ unmark: exec.status === 'done' }),
        }
      );
      toast.success(exec.status === 'done' ? '已取消完成' : '已标记完成');
      fetchExecutions();
      onProgressChange?.(res.progress);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  // 填报模式：勾选/取消勾选（受控）
  const handleToggleSelect = (exec: TaskExecution, checked: boolean) => {
    if (mode !== 'select' || !onSelectionChange) return;
    const current = selectedIds || [];
    const next = checked
      ? [...new Set([...current, exec.id])]
      : current.filter((id) => id !== exec.id);
    onSelectionChange(next);
  };

  if (!taskId) {
    return (
      <p className="text-xs text-[#94a3b8]">请先选择任务</p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#64748b]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        加载执行...
      </div>
    );
  }

  const isSelect = mode === 'select';

  return (
    <div className={`space-y-2 ${compact ? '' : 'mt-2'}`}>
      {executions.length === 0 ? (
        <p className="text-xs text-[#94a3b8]">
          {isSelect ? '该任务暂无可勾选的执行' : '暂无执行，请在下方添加'}
        </p>
      ) : (
        <div className="space-y-1">
          {executions.map((exec) => {
            const isSelected = isSelect
              ? (selectedIds || []).includes(exec.id)
              : exec.status === 'done';
            const isEditing = editingId === exec.id;
            return (
              <div
                key={exec.id}
                className="flex items-center gap-2 py-1 px-2 rounded hover:bg-[#f8fafc] border border-transparent hover:border-[#e2e8f0]"
              >
                <Checkbox
                  checked={isSelected}
                  disabled={disabled}
                  onCheckedChange={(v) => {
                    if (isSelect) {
                      handleToggleSelect(exec, v === true);
                    } else {
                      void handleToggleManage(exec);
                    }
                  }}
                  className="data-[state=checked]:bg-[#1e3a5f] data-[state=checked]:border-[#1e3a5f]"
                />
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-1">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-7 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void saveEdit(exec.id);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => void saveEdit(exec.id)}
                      disabled={submitting}
                      title="保存"
                    >
                      <Check className="w-3.5 h-3.5 text-[#15803d]" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setEditingId(null)}
                      title="取消"
                    >
                      <X className="w-3.5 h-3.5 text-[#94a3b8]" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span
                      className={`flex-1 text-sm truncate ${
                        exec.status === 'done'
                          ? 'line-through text-[#94a3b8]'
                          : 'text-[#1e3a5f]'
                      }`}
                      title={exec.description || exec.name}
                    >
                      {exec.name}
                    </span>
                    {exec.status === 'done' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#dcfce7] text-[#15803d] shrink-0">
                        {exec.completed_at || '已完成'}
                        {exec.completer?.real_name ? ` · ${exec.completer.real_name}` : ''}
                      </span>
                    )}
                    {!isSelect && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => {
                            setEditingId(exec.id);
                            setEditingName(exec.name);
                          }}
                          title="编辑"
                        >
                          <Edit className="w-3 h-3 text-[#475569]" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => void handleDelete(exec.id)}
                          title="删除"
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isSelect && (
        <div className="flex items-center gap-1 pt-1 border-t border-dashed border-[#e2e8f0]">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="添加执行，如：登录流程验证"
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              }
            }}
            disabled={submitting}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleAdd()}
            disabled={submitting || !newName.trim()}
            className="shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            添加
          </Button>
        </div>
      )}
    </div>
  );
}
