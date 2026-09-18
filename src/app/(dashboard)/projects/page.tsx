'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
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
import { Plus, Trash2, Edit, Users, ListTodo, GitBranch, Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface ProductOption {
  id: number;
  name: string;
  status: string;
}

interface VersionRow {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  release_date: string | null;
  status: string;
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
  progress?: number;
  consumed_hours?: number;
  project_task_versions?: TaskVersionEntry[] | null;
}

interface Project {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  estimated_hours: string;
  actual_hours: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  product_id: number | null;
  users: { id: number; real_name: string; username: string };
  products?: { id: number; name: string } | null;
}

interface UserOption {
  id: number;
  username: string;
  real_name: string;
  role: string;
}

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  in_progress: { label: '进行中', variant: 'default' },
  completed: { label: '已完成', variant: 'secondary' },
  at_risk: { label: '风险中', variant: 'destructive' },
};

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Project | null>(null);
  const [showMembers, setShowMembers] = useState<number | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [memberList, setMemberList] = useState<Array<{ users: UserOption }>>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  // 任务管理弹窗
  const [taskProject, setTaskProject] = useState<Project | null>(null);
  const [taskList, setTaskList] = useState<TaskRow[]>([]);
  const [taskName, setTaskName] = useState('');
  // 新建任务时初始关联的版本（多选）
  const [newTaskVersionIds, setNewTaskVersionIds] = useState<number[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  // 任务改名（行内编辑）
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [editingTaskName, setEditingTaskName] = useState('');
  const [savingTaskName, setSavingTaskName] = useState(false);
  // 任务展开（行内管理执行）
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  // 任务进度本地缓存
  const [taskProgress, setTaskProgress] = useState<Record<number, number>>({});
  // 版本管理
  const [versionList, setVersionList] = useState<VersionRow[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [versionForm, setVersionForm] = useState({ name: '', description: '', release_date: '' });
  const [editingVersion, setEditingVersion] = useState<VersionRow | null>(null);
  const [editingVersionName, setEditingVersionName] = useState('');
  const [savingVersionName, setSavingVersionName] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    owner_id: '',
    estimated_hours: '',
    status: 'in_progress',
    product_id: '',
    start_date: '',
    end_date: '',
    member_ids: [] as number[],
  });
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  // 筛选条件：keyword（项目名/描述）、productId、status、ownerId
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filterProductId, setFilterProductId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (filterKeyword.trim()) params.set('keyword', filterKeyword.trim());
      if (filterProductId && filterProductId !== 'all') params.set('productId', filterProductId);
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
      if (filterOwner && filterOwner !== 'all') params.set('ownerId', filterOwner);
      const data = await apiFetch<{ data: Project[]; total: number }>(`/api/projects?${params}`);
      setProjects(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [page, filterKeyword, filterProductId, filterStatus, filterOwner]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const fetchUsers = async () => {
    try {
      const data = await apiFetch<{ data: UserOption[] }>('/api/users?pageSize=100');
      if (data.data) setUsers(data.data);
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

  useEffect(() => {
    fetchProducts();
  }, []);

  // 任务管理
  const fetchTasks = async (projectId: number) => {
    setTaskLoading(true);
    try {
      const data = await apiFetch<{ data: TaskRow[] }>(
        `/api/tasks?project_id=${projectId}&all=1`
      );
      setTaskList(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询任务失败');
    } finally {
      setTaskLoading(false);
    }
  };

  // 版本管理
  const fetchVersions = async (projectId: number) => {
    setVersionLoading(true);
    try {
      const data = await apiFetch<{ data: VersionRow[] }>(
        `/api/versions?project_id=${projectId}&all=1`
      );
      setVersionList(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询版本失败');
    } finally {
      setVersionLoading(false);
    }
  };

  const openTasks = (project: Project) => {
    setTaskProject(project);
    setTaskName('');
    setNewTaskVersionIds([]);
    setShowVersionPanel(false);
    setVersionForm({ name: '', description: '', release_date: '' });
    cancelEditTask();
    cancelEditVersion();
    fetchTasks(project.id);
    fetchVersions(project.id);
  };

  const handleAddTask = async () => {
    if (!taskProject) return;
    if (!taskName.trim()) {
      toast.error('请填写任务名称');
      return;
    }
    try {
      const res = await apiFetch<{ data: TaskRow }>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          project_id: taskProject.id,
          name: taskName.trim(),
        }),
      });
      // 若选择了版本，立即同步 N:N 关联
      if (newTaskVersionIds.length > 0 && res?.data?.id) {
        await apiFetch(`/api/tasks/${res.data.id}/versions`, {
          method: 'PUT',
          body: JSON.stringify({ version_ids: newTaskVersionIds }),
        });
      }
      toast.success('任务创建成功');
      setTaskName('');
      setNewTaskVersionIds([]);
      fetchTasks(taskProject.id);
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  // 任务-版本 N:N 行内勾选：toggle 某个版本，提交时整体同步关联集合
  const handleToggleTaskVersion = async (task: TaskRow, versionId: number) => {
    if (!taskProject) return;
    const current = (task.project_task_versions || [])
      .map((v) => v.version_id)
      .filter((vid) => versionList.some((v) => v.id === vid));
    const next = current.includes(versionId)
      ? current.filter((v) => v !== versionId)
      : [...current, versionId];
    try {
      await apiFetch(`/api/tasks/${task.id}/versions`, {
        method: 'PUT',
        body: JSON.stringify({ version_ids: next }),
      });
      toast.success(next.includes(versionId) ? '已关联版本' : '已取消关联');
      fetchTasks(taskProject.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleToggleTask = async (task: TaskRow) => {
    if (!taskProject) return;
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: task.status === 'active' ? 'closed' : 'active',
        }),
      });
      toast.success(task.status === 'active' ? '任务已关闭' : '任务已重新开启');
      fetchTasks(taskProject.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDeleteTask = async (task: TaskRow) => {
    if (!taskProject) return;
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      toast.success('任务已删除');
      fetchTasks(taskProject.id);
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  // 任务改名（行内编辑）：进入编辑、保存、取消
  const startEditTask = (task: TaskRow) => {
    setEditingTask(task);
    setEditingTaskName(task.name);
  };
  const cancelEditTask = () => {
    setEditingTask(null);
    setEditingTaskName('');
  };
  // 版本改名（行内编辑）
  const startEditVersion = (v: VersionRow) => {
    setEditingVersion(v);
    setEditingVersionName(v.name);
  };
  const cancelEditVersion = () => {
    setEditingVersion(null);
    setEditingVersionName('');
  };
  const saveEditVersion = async () => {
    if (!editingVersion || !taskProject) return;
    const trimmed = editingVersionName.trim();
    if (!trimmed) {
      toast.error('版本名称不能为空');
      return;
    }
    if (trimmed === editingVersion.name) {
      cancelEditVersion();
      return;
    }
    setSavingVersionName(true);
    try {
      await apiFetch(`/api/versions/${editingVersion.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmed }),
      });
      toast.success('版本名称已更新');
      cancelEditVersion();
      fetchVersions(taskProject.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSavingVersionName(false);
    }
  };
  const handleAddVersion = async () => {
    if (!taskProject) return;
    if (!versionForm.name.trim()) {
      toast.error('请填写版本名称');
      return;
    }
    try {
      await apiFetch('/api/versions', {
        method: 'POST',
        body: JSON.stringify({
          project_id: taskProject.id,
          name: versionForm.name.trim(),
          description: versionForm.description.trim() || null,
          release_date: versionForm.release_date || null,
        }),
      });
      toast.success('版本创建成功');
      setVersionForm({ name: '', description: '', release_date: '' });
      fetchVersions(taskProject.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };
  const handleToggleVersion = async (v: VersionRow) => {
    if (!taskProject) return;
    try {
      await apiFetch(`/api/versions/${v.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: v.status === 'active' ? 'closed' : 'active',
        }),
      });
      toast.success(v.status === 'active' ? '版本已关闭' : '版本已重新开启');
      fetchVersions(taskProject.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };
  const handleDeleteVersion = async (v: VersionRow) => {
    if (!taskProject) return;
    try {
      await apiFetch(`/api/versions/${v.id}`, { method: 'DELETE' });
      toast.success('版本已删除');
      fetchVersions(taskProject.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };
  const saveEditTask = async () => {
    if (!editingTask || !taskProject) return;
    const trimmed = editingTaskName.trim();
    if (!trimmed) {
      toast.error('任务名称不能为空');
      return;
    }
    if (trimmed === editingTask.name) {
      // 未改动直接退出
      cancelEditTask();
      return;
    }
    setSavingTaskName(true);
    try {
      await apiFetch(`/api/tasks/${editingTask.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmed }),
      });
      toast.success('任务名称已更新');
      cancelEditTask();
      fetchTasks(taskProject.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSavingTaskName(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name || !form.owner_id || !form.estimated_hours || !form.product_id) {
      toast.error('请填写必填字段（含所属产品）');
      return;
    }

    try {
      await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          product_id: parseInt(form.product_id),
          member_ids: form.member_ids,
        }),
      });
      toast.success('项目创建成功');
      setShowCreate(false);
      setForm({ name: '', description: '', owner_id: '', estimated_hours: '', status: 'in_progress', product_id: '', start_date: '', end_date: '', member_ids: [] });
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleEdit = async () => {
    if (!showEdit) return;
    try {
      await apiFetch(`/api/projects/${showEdit.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          estimated_hours: form.estimated_hours,
          status: form.status,
          product_id: form.product_id ? parseInt(form.product_id) : null,
          start_date: form.start_date,
          end_date: form.end_date,
        }),
      });
      toast.success('项目更新成功');
      setShowEdit(null);
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
      toast.success('删除成功');
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleViewMembers = async (projectId: number) => {
    setShowMembers(projectId);
    try {
      const data = await apiFetch<{ data: Array<{ users: UserOption }> }>(`/api/projects/${projectId}/members`);
      if (data.data) setMemberList(data.data);
    } catch {
      toast.error('查询成员失败');
    }
  };

  const handleAddMember = async (projectId: number, userId: number) => {
    try {
      await apiFetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: [userId] }),
      });
      toast.success('成员添加成功');
      handleViewMembers(projectId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    }
  };

  const handleRemoveMember = async (projectId: number, userId: number) => {
    try {
      await apiFetch(`/api/projects/${projectId}/members?userId=${userId}`, {
        method: 'DELETE',
      });
      toast.success('成员移除成功');
      handleViewMembers(projectId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '移除失败');
    }
  };

  const openEdit = (project: Project) => {
    setShowEdit(project);
    setForm({
      name: project.name,
      description: project.description || '',
      owner_id: String(project.owner_id),
      estimated_hours: project.estimated_hours,
      status: project.status,
      product_id: project.product_id ? String(project.product_id) : '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      member_ids: [],
    });
  };

  // The system "admin" account is reserved for special data handling
  // and must not appear in project owner / member selection UIs.
  const nonAdminUsers = users.filter((u) => u.username !== 'admin');
  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">项目管理</h1>
          <p className="text-sm text-[#475569] mt-1">管理和查看所有项目</p>
        </div>
        {(user?.role === 'admin' || user?.role === 'pm') && (
          <Button
            onClick={() => {
              fetchUsers();
              setShowCreate(true);
            }}
            className="bg-[#1e3a5f] hover:bg-[#16304f]"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建项目
          </Button>
        )}
      </div>

      <Card className="border-[#e2e8f0]">
        <CardContent className="p-0">
          {/* 筛选栏 */}
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[#e2e8f0] bg-[#f8fafc]/60">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
              <Input
                value={filterKeyword}
                onChange={(e) => {
                  setFilterKeyword(e.target.value);
                  setPage(1);
                }}
                placeholder="搜索项目名/描述"
                className="pl-8 h-9"
              />
            </div>
            <Select
              value={filterProductId}
              onValueChange={(v) => {
                setFilterProductId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40 h-9">
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
              value={filterStatus}
              onValueChange={(v) => {
                setFilterStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-32 h-9">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="in_progress">进行中</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="at_risk">风险中</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filterOwner}
              onValueChange={(v) => {
                setFilterOwner(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="全部负责人" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部负责人</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.real_name} ({u.username})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filterKeyword || filterProductId !== 'all' || filterStatus !== 'all' || filterOwner !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-[#64748b]"
                onClick={() => {
                  setFilterKeyword('');
                  setFilterProductId('all');
                  setFilterStatus('all');
                  setFilterOwner('all');
                  setPage(1);
                }}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                重置
              </Button>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>所属产品</TableHead>
                <TableHead>项目名称</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead>预估工时</TableHead>
                <TableHead>实际工时</TableHead>
                <TableHead>使用率</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>周期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-[#475569]">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-[#475569]">
                    暂无项目
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((p) => {
                  const estimated = parseFloat(p.estimated_hours);
                  const actual = p.actual_hours || 0;
                  const usageRate = estimated > 0 ? (actual / estimated) * 100 : 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        {p.products ? (
                          <Badge variant="outline" className="bg-[#e0e7ff] text-[#3730a3] border-transparent font-normal">
                            {p.products.name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-[#94a3b8]">未分产品</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.users?.real_name || '-'}</TableCell>
                      <TableCell>{p.estimated_hours}h</TableCell>
                      <TableCell>{actual}h</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                usageRate >= 100
                                  ? 'bg-red-500'
                                  : usageRate >= 80
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(usageRate, 100)}%` }}
                            />
                          </div>
                          <span className={`text-sm font-medium ${
                            usageRate >= 100 ? 'text-red-600' : usageRate >= 80 ? 'text-amber-600' : 'text-emerald-600'
                          }`}>
                            {Math.round(usageRate)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusMap[p.status]?.variant || 'default'}>
                          {statusMap[p.status]?.label || p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-[#475569]">
                        {p.start_date && p.end_date
                          ? `${p.start_date} ~ ${p.end_date}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openTasks(p)}
                            aria-label="任务管理"
                            title="任务管理"
                          >
                            <ListTodo className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewMembers(p.id)}
                            aria-label="项目成员"
                            title="项目成员"
                          >
                            <Users className="w-4 h-4" />
                          </Button>
                          {(user?.role === 'admin' || user?.role === 'pm') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(p)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {user?.role === 'admin' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(p)}
                              aria-label="删除项目"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex justify-center py-4">
              <SimplePagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>所属产品 *</Label>
              <Select
                value={form.product_id}
                onValueChange={(v) => setForm({ ...form, product_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择所属产品" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((pr) => (
                    <SelectItem key={pr.id} value={String(pr.id)}>
                      {pr.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>项目名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="请输入项目名称，如 Starfish-V4"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>项目描述</Label>
                <span className="text-xs text-[#475569]">{form.description.length}/500</span>
              </div>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 500) })}
                placeholder="请输入项目描述（最多500字）"
                maxLength={500}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>负责人 *</Label>
                <Select
                  value={form.owner_id}
                  onValueChange={(v) => setForm({ ...form, owner_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择负责人" />
                  </SelectTrigger>
                  <SelectContent>
                    {nonAdminUsers
                      .filter((u) => u.role === 'admin' || u.role === 'pm')
                      .map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.real_name} ({u.username})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>预估工时(h) *</Label>
                <Input
                  type="number"
                  value={form.estimated_hours}
                  onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
                  placeholder="预估工时"
                  min="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>开始日期</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>结束日期</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>项目状态</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">进行中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="at_risk">风险中</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>项目成员</Label>
              <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                {nonAdminUsers.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.member_ids.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm({ ...form, member_ids: [...form.member_ids, u.id] });
                        } else {
                          setForm({
                            ...form,
                            member_ids: form.member_ids.filter((id) => id !== u.id),
                          });
                        }
                      }}
                      className="rounded"
                    />
                    <span>
                      {u.real_name} ({u.username})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button className="bg-[#1e3a5f] hover:bg-[#16304f]" onClick={handleCreate}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit !== null} onOpenChange={() => setShowEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>所属产品 *</Label>
              <Select
                value={form.product_id}
                onValueChange={(v) => setForm({ ...form, product_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择所属产品" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((pr) => (
                    <SelectItem key={pr.id} value={String(pr.id)}>
                      {pr.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>项目名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="请输入项目名称"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>项目描述</Label>
                <span className="text-xs text-[#475569]">{form.description.length}/500</span>
              </div>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 500) })}
                placeholder="请输入项目描述（最多500字）"
                maxLength={500}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>负责人</Label>
                <Input value={showEdit?.users?.real_name || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>预估工时(h) *</Label>
                <Input
                  type="number"
                  value={form.estimated_hours}
                  onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
                  placeholder="预估工时"
                  min="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>开始日期</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>结束日期</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>项目状态</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">进行中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="at_risk">风险中</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(null)}>
              取消
            </Button>
            <Button className="bg-[#1e3a5f] hover:bg-[#16304f]" onClick={handleEdit}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={showMembers !== null} onOpenChange={() => setShowMembers(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>项目成员</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {memberList.map((m) => (
              <div
                key={m.users.id}
                className="flex items-center justify-between p-2 rounded-lg bg-[#f8fafc]"
              >
                <span className="text-sm">
                  {m.users.real_name} ({m.users.username})
                </span>
                {user?.role === 'admin' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveMember(showMembers!, m.users.id)}
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
            {memberList.length === 0 && (
              <p className="text-sm text-[#475569] text-center py-4">暂无成员</p>
            )}

            {user?.role === 'admin' && showMembers && (
              <div className="pt-3 border-t">
                <Label className="text-xs text-[#475569]">添加成员</Label>
                <div className="flex gap-2 mt-1">
                  <Select
                    onValueChange={(v) => {
                      handleAddMember(showMembers, parseInt(v));
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="选择用户" />
                    </SelectTrigger>
                    <SelectContent>
                      {nonAdminUsers
                        .filter(
                          (u) =>
                            !memberList.some((m) => m.users.id === u.id)
                        )
                        .map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {u.real_name} ({u.username})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Tasks Dialog：项目内任务（禅道三级结构的"任务"层），含版本管理 */}
      <Dialog open={taskProject !== null} onOpenChange={() => setTaskProject(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              任务管理
              {taskProject && (
                <span className="ml-2 text-sm font-normal text-[#475569]">
                  {taskProject.products?.name ? `${taskProject.products.name} / ` : ''}
                  {taskProject.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* 版本管理面板（可折叠） */}
          <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc]/60">
            <button
              type="button"
              onClick={() => setShowVersionPanel((s) => !s)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-[#1e3a5f]"
            >
              <span className="flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                版本管理
                {versionList.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{versionList.length}</Badge>
                )}
              </span>
              <span className="text-xs text-[#64748b]">{showVersionPanel ? '收起 ▲' : '展开 ▼'}</span>
            </button>
            {showVersionPanel && (
              <div className="px-3 pb-3 space-y-3">
                {/* 新建版本（仅 PM/admin） */}
                {(user?.role === 'admin' || user?.role === 'pm') && (
                  <div className="grid grid-cols-[1fr_140px_44px] gap-2 items-end pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs text-[#64748b]">版本名称 *</Label>
                      <Input
                        value={versionForm.name}
                        onChange={(e) =>
                          setVersionForm({ ...versionForm, name: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddVersion();
                        }}
                        placeholder="如 V4.1.0、Build-20260908"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-[#64748b]">发布日期</Label>
                      <Input
                        type="date"
                        value={versionForm.release_date}
                        onChange={(e) =>
                          setVersionForm({ ...versionForm, release_date: e.target.value })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="bg-[#1e3a5f] hover:bg-[#16304f] h-8"
                      onClick={handleAddVersion}
                      aria-label="添加版本"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                {(user?.role === 'admin' || user?.role === 'pm') && (
                  <div className="space-y-1">
                    <Label className="text-xs text-[#64748b]">版本描述（可选）</Label>
                    <Input
                      value={versionForm.description}
                      onChange={(e) =>
                        setVersionForm({ ...versionForm, description: e.target.value })
                      }
                      placeholder="本次版本包含的功能概述"
                      className="h-8 text-sm"
                    />
                  </div>
                )}

                {/* 版本列表 */}
                {versionLoading ? (
                  <p className="text-sm text-[#475569] text-center py-3">加载中...</p>
                ) : versionList.length === 0 ? (
                  <p className="text-xs text-[#475569] text-center py-3">
                    暂无版本，可创建版本后让任务绑定
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {versionList.map((v) => {
                      const isEditingV = editingVersion?.id === v.id;
                      return (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-md bg-white border border-[#e2e8f0]"
                        >
                          <div className="min-w-0 flex-1">
                            {isEditingV ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingVersionName}
                                  onChange={(e) => setEditingVersionName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditVersion();
                                    if (e.key === 'Escape') cancelEditVersion();
                                  }}
                                  placeholder="版本名称"
                                  className="h-8 text-sm"
                                  autoFocus
                                  disabled={savingVersionName}
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs text-[#15803d] hover:text-[#15803d]"
                                  onClick={saveEditVersion}
                                  disabled={savingVersionName}
                                >
                                  保存
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={cancelEditVersion}
                                  disabled={savingVersionName}
                                >
                                  取消
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className="bg-[#e0e7ff] text-[#3730a3] border-transparent font-mono"
                                >
                                  {v.name}
                                </Badge>
                                {v.release_date && (
                                  <span className="text-xs text-[#64748b]">
                                    发布：{v.release_date}
                                  </span>
                                )}
                                {v.status === 'closed' && (
                                  <Badge variant="secondary" className="text-xs">已关闭</Badge>
                                )}
                                {v.description && (
                                  <span className="text-xs text-[#94a3b8] truncate">
                                    {v.description}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {(user?.role === 'admin' || user?.role === 'pm') && !isEditingV && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8"
                                onClick={() => startEditVersion(v)}
                                aria-label="改名"
                                title="改名"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => handleToggleVersion(v)}
                              >
                                {v.status === 'active' ? '关闭' : '重开'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8"
                                onClick={() => handleDeleteVersion(v)}
                                aria-label="删除版本"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 新建任务 */}
          {(user?.role === 'admin' || user?.role === 'pm') && (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_64px] gap-2">
                <Input
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTask();
                  }}
                  placeholder="新增任务名称，如 Starfish-4.1.0-功能测试"
                />
                <Button
                  className="bg-[#1e3a5f] hover:bg-[#16304f] shrink-0"
                  onClick={handleAddTask}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  添加
                </Button>
              </div>
              {versionList.length > 0 && (
                <div className="flex items-start gap-2 flex-wrap p-2 rounded-md bg-white border border-[#e2e8f0]">
                  <span className="text-xs text-[#64748b] shrink-0 pt-1.5">初始关联版本：</span>
                  {versionList
                    .filter((v) => v.status === 'active')
                    .map((v) => (
                      <label
                        key={v.id}
                        className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[#f1f5f9] cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={newTaskVersionIds.includes(v.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewTaskVersionIds([...newTaskVersionIds, v.id]);
                            } else {
                              setNewTaskVersionIds(
                                newTaskVersionIds.filter((id) => id !== v.id)
                              );
                            }
                          }}
                          className="rounded"
                        />
                        <span className="font-mono text-[#3730a3]">{v.name}</span>
                      </label>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* 任务列表 */}
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {taskLoading ? (
              <p className="text-sm text-[#475569] text-center py-6">加载中...</p>
            ) : taskList.length === 0 ? (
              <p className="text-sm text-[#475569] text-center py-6">
                暂无任务，请先添加任务（填报日报时必须选择任务）
              </p>
            ) : (
              taskList.map((t) => {
                const isEditing = editingTask?.id === t.id;
                const taskVersionIds = (t.project_task_versions || []).map((v) => v.version_id);
                const expanded = expandedTaskId === t.id;
                const progress = taskProgress[t.id] ?? t.progress ?? 0;
                return (
                <div
                  key={t.id}
                  className="rounded-lg bg-[#f8fafc]"
                >
                  <div className="flex items-center justify-between gap-2 p-2.5">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editingTaskName}
                          onChange={(e) => setEditingTaskName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditTask();
                            if (e.key === 'Escape') cancelEditTask();
                          }}
                          placeholder="任务名称"
                          className="h-8 text-sm"
                          autoFocus
                          disabled={savingTaskName}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-[#15803d] hover:text-[#15803d]"
                          onClick={saveEditTask}
                          disabled={savingTaskName}
                        >
                          保存
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={cancelEditTask}
                          disabled={savingTaskName}
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setExpandedTaskId(expanded ? null : t.id)}
                            className="text-[#64748b] hover:text-[#1e3a5f] shrink-0"
                            title={expanded ? '收起执行' : '展开执行管理'}
                          >
                            {expanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <span className={`text-sm truncate ${t.status === 'closed' ? 'line-through text-[#94a3b8]' : ''}`}>
                            {t.name}
                          </span>
                          {(t.project_task_versions || []).map((v) => (
                            <Badge
                              key={v.version_id}
                              variant="outline"
                              className="text-xs bg-[#e0e7ff] text-[#3730a3] border-transparent font-mono"
                            >
                              {v.project_versions?.name || `#${v.version_id}`}
                            </Badge>
                          ))}
                          <Badge
                            variant="outline"
                            className="text-xs bg-[#dcfce7] text-[#15803d] border-transparent"
                            title={`已完成执行数/总执行数=${progress}%`}
                          >
                            {progress}%
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-xs bg-[#fef9c3] text-[#a16207] border-transparent font-mono"
                            title={`该任务已消耗工时 ${t.consumed_hours ?? 0} 小时`}
                          >
                            {t.consumed_hours ?? 0}h
                          </Badge>
                          {t.status === 'closed' && (
                            <Badge variant="secondary" className="text-xs">已关闭</Badge>
                          )}
                        </div>
                        {t.description && (
                          <div className="text-xs text-[#94a3b8] truncate">{t.description}</div>
                        )}
                        {/* 行内多版本勾选（仅 PM/admin 显示，N:N 同步） */}
                        {(user?.role === 'admin' || user?.role === 'pm') && versionList.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5 pt-1.5 border-t border-dashed border-[#e2e8f0]">
                            <span className="text-[10px] text-[#94a3b8] shrink-0">关联版本：</span>
                            {versionList.map((v) => (
                              <label
                                key={v.id}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#f1f5f9] cursor-pointer text-[11px]"
                                title={v.status === 'closed' ? `${v.name}（已关闭）` : v.name}
                              >
                                <input
                                  type="checkbox"
                                  checked={taskVersionIds.includes(v.id)}
                                  onChange={() => handleToggleTaskVersion(t, v.id)}
                                  className="rounded h-3 w-3"
                                />
                                <span className={`font-mono ${v.status === 'closed' ? 'text-[#94a3b8] line-through' : 'text-[#3730a3]'}`}>
                                  {v.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {(user?.role === 'admin' || user?.role === 'pm') && !isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => startEditTask(t)}
                        aria-label="改名"
                        title="改名"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleToggleTask(t)}
                      >
                        {t.status === 'active' ? '关闭' : '重开'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => handleDeleteTask(t)}
                        aria-label="删除任务"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  )}
                  </div>
                  {/* 展开时显示执行管理面板 */}
                  {expanded && !isEditing && (
                    <div className="px-3 pb-3 pt-1 border-t border-dashed border-[#e2e8f0]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-[#1e3a5f]">执行管理</span>
                        <span className="text-[10px] text-[#94a3b8]">勾选执行后系统自动重算任务进度</span>
                      </div>
                      <TaskExecutionsPanel
                        taskId={t.id}
                        mode="manage"
                        onProgressChange={(p) => {
                          setTaskProgress((prev) => ({ ...prev, [t.id]: p }));
                        }}
                        compact
                      />
                    </div>
                  )}
                </div>
              );})
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name}及关联的工时记录将被删除，该操作不可撤销
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
