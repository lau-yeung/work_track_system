'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SimplePagination } from '@/components/simple-pagination';
import { TaskExecutionsPanel } from '@/components/task-executions-panel';
import {
  Plus,
  Trash2,
  Edit,
  Search,
  ListTodo,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

interface ProductOption {
  id: number;
  name: string;
  status: string;
}

interface ProjectOption {
  id: number;
  name: string;
  status: string;
  product_id: number | null;
  products?: { id: number; name: string } | null;
}

interface TaskVersionEntry {
  version_id: number;
  project_versions: { id: number; name: string };
}

interface TaskRow {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  created_by: number | null;
  created_at: string;
  projects: {
    id: number;
    name: string;
    product_id: number | null;
    products?: { id: number; name: string } | null;
  };
  project_task_versions?: TaskVersionEntry[] | null;
}

interface VersionOption {
  id: number;
  project_id: number;
  name: string;
  status: string;
}

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' }> = {
  active: { label: '进行中', variant: 'default' },
  closed: { label: '已关闭', variant: 'secondary' },
};

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [versions, setVersions] = useState<VersionOption[]>([]);
  // 筛选
  const [filterProductId, setFilterProductId] = useState('all');
  const [filterProjectId, setFilterProjectId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterKeyword, setFilterKeyword] = useState('');
  // 展开行（管理执行）
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  // 任务进度本地缓存（展开行实时展示）
  const [taskProgress, setTaskProgress] = useState<Record<number, number>>({});
  // 新建任务弹窗
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    project_id: '',
    name: '',
    description: '',
  });
  const [createVersionIds, setCreateVersionIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // 编辑任务弹窗
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', status: 'active' });
  const [editVersionIds, setEditVersionIds] = useState<number[]>([]);
  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<TaskRow | null>(null);

  const canManage = user?.role === 'admin' || user?.role === 'pm';

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        all: '1',
      });
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterProjectId !== 'all') params.set('project_id', filterProjectId);
      if (filterKeyword.trim()) params.set('keyword', filterKeyword.trim());
      const data = await apiFetch<{ data: TaskRow[]; total: number }>(
        `/api/tasks?${params}`
      );
      setTasks(data.data || []);
      setTotal(data.total || 0);
      // 同步任务进度本地缓存
      const progressMap: Record<number, number> = {};
      (data.data || []).forEach((t) => {
        progressMap[t.id] = t.progress || 0;
      });
      setTaskProgress(progressMap);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询任务失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, filterProjectId, filterKeyword]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const fetchProducts = async () => {
    try {
      const data = await apiFetch<{ data: ProductOption[] }>('/api/products');
      if (data.data) setProducts(data.data);
    } catch {
      // ignore
    }
  };

  const fetchProjects = async () => {
    try {
      const data = await apiFetch<{ data: ProjectOption[] }>('/api/projects/my');
      if (data.data) setProjects(data.data);
    } catch {
      // ignore
    }
  };

  const fetchVersions = async () => {
    try {
      const data = await apiFetch<{ data: VersionOption[] }>('/api/versions?all=1');
      if (data.data) setVersions(data.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchProjects();
    fetchVersions();
  }, []);

  // 按产品筛选项目
  const filteredProjects = filterProductId !== 'all'
    ? projects.filter((p) => p.product_id === Number(filterProductId))
    : projects;

  const filteredVersions = (projectId: number) =>
    versions.filter((v) => v.project_id === projectId);

  const handleCreate = async () => {
    if (!createForm.project_id || !createForm.name.trim()) {
      toast.error('请选择所属项目并填写任务名');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ data: TaskRow }>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(createForm.project_id),
          name: createForm.name.trim(),
          description: createForm.description.trim() || null,
        }),
      });
      if (createVersionIds.length > 0 && res?.data?.id) {
        await apiFetch(`/api/tasks/${res.data.id}/versions`, {
          method: 'PUT',
          body: JSON.stringify({ version_ids: createVersionIds }),
        });
      }
      toast.success('任务创建成功');
      setShowCreate(false);
      setCreateForm({ project_id: '', name: '', description: '' });
      setCreateVersionIds([]);
      fetchTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (task: TaskRow) => {
    setEditingTask(task);
    setEditForm({
      name: task.name,
      description: task.description || '',
      status: task.status,
    });
    setEditVersionIds((task.project_task_versions || []).map((v) => v.version_id));
  };

  const handleEdit = async () => {
    if (!editingTask) return;
    if (!editForm.name.trim()) {
      toast.error('任务名不能为空');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/api/tasks/${editingTask.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name.trim(),
          description: editForm.description.trim() || null,
          status: editForm.status,
        }),
      });
      // 同步版本关联
      await apiFetch(`/api/tasks/${editingTask.id}/versions`, {
        method: 'PUT',
        body: JSON.stringify({ version_ids: editVersionIds }),
      });
      toast.success('任务已更新');
      setEditingTask(null);
      fetchTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/tasks/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('任务已删除');
      setDeleteTarget(null);
      fetchTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleToggleStatus = async (task: TaskRow) => {
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: task.status === 'active' ? 'closed' : 'active',
        }),
      });
      toast.success(task.status === 'active' ? '任务已关闭' : '任务已重新开启');
      fetchTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">任务管理</h1>
          <p className="text-sm text-[#475569] mt-1">
            管理任务及其执行项，勾选执行自动算进度
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setShowCreate(true)}
            className="bg-[#1e3a5f] hover:bg-[#16304f]"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建任务
          </Button>
        )}
      </div>

      {/* 筛选 */}
      <Card className="border-[#e2e8f0] mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <Select
            value={filterProductId}
            onValueChange={(v) => {
              setFilterProductId(v);
              setFilterProjectId('all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="全部产品" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部产品</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterProjectId}
            onValueChange={(v) => {
              setFilterProjectId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="全部项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              {filteredProjects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterStatus}
            onValueChange={(v) => {
              setFilterStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">进行中</SelectItem>
              <SelectItem value="closed">已关闭</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
            <Input
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  fetchTasks();
                }
              }}
              placeholder="搜索任务名"
              className="pl-8"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPage(1);
              fetchTasks();
            }}
          >
            查询
          </Button>
        </CardContent>
      </Card>

      {/* 任务列表 */}
      <Card className="border-[#e2e8f0]">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#475569]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#94a3b8]">
              <ListTodo className="w-10 h-10 mb-2" />
              <p>暂无任务</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>任务名</TableHead>
                  <TableHead>所属项目</TableHead>
                  <TableHead>关联版本</TableHead>
                  <TableHead className="w-24">进度</TableHead>
                  <TableHead className="w-20">状态</TableHead>
                  <TableHead className="w-32 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => {
                  const expanded = expandedTaskId === task.id;
                  const progress = taskProgress[task.id] ?? task.progress ?? 0;
                  const versionEntries = task.project_task_versions || [];
                  return (
                    <Fragment key={task.id}>
                      <TableRow
                        className="hover:bg-[#f8fafc] cursor-pointer"
                        onClick={() =>
                          setExpandedTaskId(expanded ? null : task.id)
                        }
                      >
                        <TableCell className="text-[#64748b]">
                          {expanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-[#1e3a5f]">
                          {task.name}
                        </TableCell>
                        <TableCell className="text-[#475569]">
                          <div className="flex flex-col">
                            <span>{task.projects?.name || '-'}</span>
                            {task.projects?.products?.name && (
                              <span className="text-xs text-[#94a3b8]">
                                {task.projects.products.name}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {versionEntries.length === 0 ? (
                              <span className="text-xs text-[#94a3b8]">未关联</span>
                            ) : (
                              versionEntries.map((v) => (
                                <Badge
                                  key={v.version_id}
                                  variant="secondary"
                                  className="font-mono text-xs"
                                >
                                  {v.project_versions?.name || `v${v.version_id}`}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-1.5 bg-[#e2e8f0] rounded overflow-hidden min-w-[40px]">
                              <div
                                className="h-full bg-[#1e3a5f] rounded transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-[#475569] tabular-nums">
                              {progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusMap[task.status]?.variant || 'default'}>
                            {statusMap[task.status]?.label || task.status}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {canManage && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  onClick={() => openEdit(task)}
                                  title="编辑任务"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  onClick={() => handleToggleStatus(task)}
                                  title={task.status === 'active' ? '关闭任务' : '重新开启'}
                                >
                                  {task.status === 'active' ? '关闭' : '开启'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  onClick={() => setDeleteTarget(task)}
                                  title="删除任务"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-[#f8fafc] py-3 px-6">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-[#1e3a5f]">
                                执行管理
                              </span>
                              <span className="text-xs text-[#94a3b8]">
                                勾选执行后系统自动重算任务进度
                              </span>
                            </div>
                            <TaskExecutionsPanel
                              taskId={task.id}
                              mode="manage"
                              onProgressChange={(p) => {
                                setTaskProgress((prev) => ({ ...prev, [task.id]: p }));
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > pageSize && (
        <SimplePagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      {/* 新建任务弹窗 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建任务</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>所属项目 *</Label>
              <Select
                value={createForm.project_id}
                onValueChange={(v) => {
                  setCreateForm((prev) => ({ ...prev, project_id: v }));
                  setCreateVersionIds([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>任务名 *</Label>
              <Input
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="如：Starfish-4.1.0-功能测试"
              />
            </div>
            <div className="space-y-2">
              <Label>任务描述</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="可选"
                rows={2}
              />
            </div>
            {createForm.project_id && (
              <div className="space-y-2">
                <Label>关联版本（可选，多选）</Label>
                <div className="flex flex-wrap gap-2 p-2 border border-[#e2e8f0] rounded-md max-h-32 overflow-y-auto">
                  {filteredVersions(Number(createForm.project_id)).length === 0 ? (
                    <span className="text-xs text-[#94a3b8]">该项目暂无版本</span>
                  ) : (
                    filteredVersions(Number(createForm.project_id)).map((v) => {
                      const checked = createVersionIds.includes(v.id);
                      return (
                        <label
                          key={v.id}
                          className="flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded hover:bg-[#f1f5f9]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setCreateVersionIds((prev) =>
                                e.target.checked
                                  ? [...prev, v.id]
                                  : prev.filter((id) => id !== v.id)
                              );
                            }}
                          />
                          <span>{v.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={submitting}>
              取消
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#16304f]"
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  提交中...
                </>
              ) : (
                '创建任务'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑任务弹窗 */}
      <Dialog open={editingTask !== null} onOpenChange={() => setEditingTask(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑任务</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>所属项目</Label>
              <Input
                value={
                  projects.find((p) => p.id === editingTask?.project_id)?.name || ''
                }
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>任务名 *</Label>
              <Input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>任务描述</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) =>
                  setEditForm((prev) => ({ ...prev, status: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">进行中</SelectItem>
                  <SelectItem value="closed">已关闭</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editingTask && (
              <div className="space-y-2">
                <Label>关联版本（多选）</Label>
                <div className="flex flex-wrap gap-2 p-2 border border-[#e2e8f0] rounded-md max-h-32 overflow-y-auto">
                  {filteredVersions(editingTask.project_id).length === 0 ? (
                    <span className="text-xs text-[#94a3b8]">该项目暂无版本</span>
                  ) : (
                    filteredVersions(editingTask.project_id).map((v) => {
                      const checked = editVersionIds.includes(v.id);
                      return (
                        <label
                          key={v.id}
                          className="flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded hover:bg-[#f1f5f9]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setEditVersionIds((prev) =>
                                e.target.checked
                                  ? [...prev, v.id]
                                  : prev.filter((id) => id !== v.id)
                              );
                            }}
                          />
                          <span>{v.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTask(null)} disabled={submitting}>
              取消
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#16304f]"
              onClick={handleEdit}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除任务</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除任务「{deleteTarget?.name}」吗？该操作不可撤销。
              <br />
              若任务已被工时记录引用将无法删除，请改为"关闭"。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
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
