'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch, apiDownload } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Target, Plus, Pencil, Trash2, Loader2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { MonthlyGoalDialog, MonthlyGoal } from './monthly-goal-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download } from 'lucide-react';

// 可拖拽行
function SortableRow({
  goal,
  idx,
  canModify,
  onEdit,
  onDelete,
}: {
  goal: MonthlyGoal;
  idx: number;
  canModify: boolean;
  onEdit: (g: MonthlyGoal) => void;
  onDelete: (g: MonthlyGoal) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(goal.id),
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="text-[#94a3b8] text-sm w-10">
        <div className="flex items-center gap-1">
          {canModify ? (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-[#94a3b8] hover:text-[#1e3a5f]"
              title="拖拽排序"
            >
              <GripVertical className="w-4 h-4" />
            </button>
          ) : null}
          <span>{idx + 1}</span>
          {idx === 0 ? <Badge className="ml-1 text-[10px] px-1 py-0">最高</Badge> : null}
        </div>
      </TableCell>
      <TableCell className="font-medium">{goal.users?.real_name || '-'}</TableCell>
      <TableCell className="whitespace-pre-wrap">{truncate(goal.goals, 60)}</TableCell>
      <TableCell className="whitespace-pre-wrap">{truncate(goal.expected_output, 40)}</TableCell>
      <TableCell className="whitespace-pre-wrap">{truncate(goal.task_breakdown, 60)}</TableCell>
      <TableCell>{fmtDate(goal.planned_completion_date)}</TableCell>
      <TableCell className="whitespace-pre-wrap">{truncate(goal.acceptance_criteria, 40)}</TableCell>
      <TableCell className="whitespace-pre-wrap">{truncate(goal.risk_points, 40)}</TableCell>
      <TableCell>
        {canModify && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(goal)} title="编辑">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(goal)} title="删除">
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

interface UserOption {
  id: number;
  real_name: string;
  username: string;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function fmtDate(s: string | null): string {
  if (!s) return '-';
  try {
    return new Date(s).toLocaleDateString('zh-CN');
  } catch {
    return s;
  }
}

function truncate(s: string | null, n = 40): string {
  if (!s) return '-';
  return s.length > n ? s.slice(0, n) + '...' : s;
}

export default function MonthlyGoalsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [userId, setUserId] = useState<string>('all');
  const [users, setUsers] = useState<UserOption[]>([]);

  const [goals, setGoals] = useState<MonthlyGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<MonthlyGoal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MonthlyGoal | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
      });
      if (isAdmin && userId !== 'all') params.set('userId', userId);
      const data = await apiFetch<{ data: MonthlyGoal[] }>(`/api/monthly-goals?${params}`);
      setGoals(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, userId]);

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditingGoal(null);
    setDialogOpen(true);
  };

  const openEdit = (g: MonthlyGoal) => {
    setEditingGoal(g);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/monthly-goals/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('目标已删除');
      setDeleteTarget(null);
      fetchGoals();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const canModify = (g: MonthlyGoal): boolean => isAdmin || g.user_id === user?.id;

  // 拖拽排序
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = goals.findIndex((g) => String(g.id) === String(active.id));
    const newIndex = goals.findIndex((g) => String(g.id) === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...goals];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    setGoals(next);
    try {
      await apiFetch('/api/monthly-goals/reorder', {
        method: 'PUT',
        body: JSON.stringify({ items: next.map((g, i) => ({ id: g.id, sort_order: i + 1 })) }),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '排序保存失败');
      fetchGoals();
    }
  };

  const handleExport = async (format: 'excel' | 'csv' | 'markdown') => {
    const params = new URLSearchParams({ year: String(year), month: String(month), format });
    if (isAdmin && userId !== 'all') params.set('userId', userId);
    try {
      const { blob, filename } = await apiDownload(`/api/monthly-goals/export?${params}`);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f] flex items-center gap-2">
            <Target className="w-6 h-6" />
            月度目标
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            月初录入目标、产出、任务拆解与风险点，支持一次批量录入多个目标
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
          <Button onClick={openCreate} className="bg-[#1e3a5f] hover:bg-[#16304f]">
            <Plus className="w-4 h-4 mr-2" />
            录入月度目标
          </Button>
        </div>
      </div>

      <Card className="mb-4 border-[#e2e8f0]">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm">年份</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}年
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">月份</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m}月
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 ml-auto">
                <Label className="text-sm">成员</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部成员</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.real_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#e2e8f0]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#1e3a5f]">
            {year}年{month}月 月度目标
            {goals.length > 0 && <span className="text-sm font-normal text-[#475569] ml-2">共 {goals.length} 条</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-[#475569]">
              <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
              加载中...
            </div>
          ) : goals.length === 0 ? (
            <div className="p-8 text-center text-[#475569]">
              <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>本月暂无月度目标</p>
              <p className="text-xs mt-1">点击右上角「录入月度目标」，可一次录入多个目标</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">优先级</TableHead>
                    <TableHead className="min-w-[80px]">负责人</TableHead>
                    <TableHead className="min-w-[160px]">月度目标</TableHead>
                    <TableHead className="min-w-[140px]">预期产出</TableHead>
                    <TableHead className="min-w-[180px]">计划任务拆解</TableHead>
                    <TableHead className="min-w-[110px]">计划完成时间</TableHead>
                    <TableHead className="min-w-[140px]">验收标准</TableHead>
                    <TableHead className="min-w-[140px]">风险点</TableHead>
                    <TableHead className="w-[90px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={goals.map((g) => String(g.id))}
                      strategy={verticalListSortingStrategy}
                    >
                      {goals.map((g, idx) => (
                        <SortableRow
                          key={g.id}
                          goal={g}
                          idx={idx}
                          canModify={canModify(g)}
                          onEdit={openEdit}
                          onDelete={setDeleteTarget}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <MonthlyGoalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        year={year}
        month={month}
        onSubmitted={fetchGoals}
        editingGoal={editingGoal}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除月度目标</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除该条月度目标？
              <br />
              <span className="text-[#475569]">
                「{deleteTarget ? truncate(deleteTarget.goals, 30) : ''}」
              </span>
              <br />
              删除后不可恢复，已生成的周报计划不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
