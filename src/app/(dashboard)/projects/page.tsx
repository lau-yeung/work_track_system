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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SimplePagination } from '@/components/simple-pagination';
import { Plus, Trash2, Edit, Users } from 'lucide-react';
import { toast } from 'sonner';

interface Project {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  estimated_hours: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  users: { id: number; real_name: string; username: string };
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
  const [showMembers, setShowMembers] = useState<number | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [memberList, setMemberList] = useState<Array<{ users: UserOption }>>([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    owner_id: '',
    estimated_hours: '',
    start_date: '',
    end_date: '',
    member_ids: [] as number[],
  });

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ data: Project[]; total: number }>(`/api/projects?page=${page}&pageSize=20`);
      setProjects(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [page]);

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

  const handleCreate = async () => {
    if (!form.name || !form.owner_id || !form.estimated_hours) {
      toast.error('请填写必填字段');
      return;
    }

    try {
      await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          member_ids: form.member_ids,
        }),
      });
      toast.success('项目创建成功');
      setShowCreate(false);
      setForm({ name: '', description: '', owner_id: '', estimated_hours: '', start_date: '', end_date: '', member_ids: [] });
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该项目？关联的工时记录也会被删除。')) return;
    try {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
      toast.success('删除成功');
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>项目名称</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead>预估工时</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>周期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-[#475569]">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-[#475569]">
                    暂无项目
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.users?.real_name || '-'}</TableCell>
                    <TableCell>{p.estimated_hours}h</TableCell>
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
                          onClick={() => handleViewMembers(p.id)}
                        >
                          <Users className="w-4 h-4" />
                        </Button>
                        {user?.role === 'admin' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(p.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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
              <Label>项目名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="请输入项目名称"
              />
            </div>
            <div className="space-y-2">
              <Label>项目描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="请输入项目描述"
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
                    {users
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
              <Label>项目成员</Label>
              <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                {users.map((u) => (
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
                      {users
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
    </div>
  );
}
