'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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
import { Plus, Edit, Trash2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface UserRow {
  id: number;
  username: string;
  email: string;
  real_name: string;
  role: string;
  status: string;
  created_at: string;
}

const roleMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  admin: { label: '管理员', variant: 'default' },
  pm: { label: '项目负责人', variant: 'destructive' },
  user: { label: '普通用户', variant: 'secondary' },
};

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  active: { label: '正常', variant: 'default' },
  disabled: { label: '禁用', variant: 'destructive' },
  pending: { label: '待审核', variant: 'secondary' },
};

export default function UsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<UserRow | null>(null);
  const [showChangePassword, setShowChangePassword] = useState<UserRow | null>(null);
  const [form, setForm] = useState({
    username: '',
    password: '',
    email: '',
    real_name: '',
    role: 'user',
    status: 'active',
  });
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ data: UserRow[]; total: number }>(`/api/users?page=${page}&pageSize=20`);
      setUsers(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (user?.role === 'admin') fetchUsers();
  }, [fetchUsers, user]);

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.email || !form.real_name) {
      toast.error('所有字段为必填');
      return;
    }
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      toast.success('用户创建成功');
      setShowCreate(false);
      setForm({ username: '', password: '', email: '', real_name: '', role: 'user', status: 'active' });
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleEdit = async () => {
    if (!showEdit) return;
    try {
      const body: Record<string, string> = {};
      if (form.email) body.email = form.email;
      if (form.real_name) body.real_name = form.real_name;
      if (form.role) body.role = form.role;
      if (form.status) body.status = form.status;
      if (form.password) body.password = form.password;

      await apiFetch(`/api/users/${showEdit.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      toast.success('用户更新成功');
      setShowEdit(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
      toast.success('删除成功');
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
      setDeleteTarget(null);
    }
  };

  const handleChangePassword = async () => {
    if (!showChangePassword) return;
    if (!passwordForm.newPassword) {
      toast.error('请输入新密码');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('两次输入的密码不一致');
      return;
    }
    try {
      await apiFetch(`/api/users/${showChangePassword.id}`, {
        method: 'PUT',
        body: JSON.stringify({ password: passwordForm.newPassword }),
      });
      toast.success('密码修改成功');
      setShowChangePassword(null);
      setPasswordForm({ newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改失败');
    }
  };

  const openChangePassword = (user: UserRow) => {
    setShowChangePassword(user);
    setPasswordForm({ newPassword: '', confirmPassword: '' });
  };

  if (!user || user.role !== 'admin') return null;

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">用户管理</h1>
          <p className="text-sm text-[#475569] mt-1">管理系统用户和角色权限</p>
        </div>
        <Button
          onClick={() => {
            setForm({ username: '', password: '', email: '', real_name: '', role: 'user', status: 'active' });
            setShowCreate(true);
          }}
          className="bg-[#1e3a5f] hover:bg-[#16304f]"
        >
          <Plus className="w-4 h-4 mr-2" />
          创建用户
        </Button>
      </div>

      <Card className="border-[#e2e8f0]">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>用户名</TableHead>
                <TableHead>真实姓名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-[#475569]">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.id}</TableCell>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.real_name}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleMap[u.role]?.variant || 'default'}>
                        {roleMap[u.role]?.label || u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusMap[u.status]?.variant || 'default'}>
                        {statusMap[u.status]?.label || u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openChangePassword(u)}
                        >
                          <KeyRound className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowEdit(u);
                            setForm({
                              username: u.username,
                              password: '',
                              email: u.email,
                              real_name: u.real_name,
                              role: u.role,
                              status: u.status,
                            });
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(u)}
                          aria-label="删除用户"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建用户</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>用户名 *</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="请输入用户名"
              />
            </div>
            <div className="space-y-2">
              <Label>密码 *</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="请输入密码"
              />
            </div>
            <div className="space-y-2">
              <Label>真实姓名 *</Label>
              <Input
                value={form.real_name}
                onChange={(e) => setForm({ ...form, real_name: e.target.value })}
                placeholder="请输入真实姓名"
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱 *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="请输入邮箱"
              />
            </div>
            <div className="space-y-2">
              <Label>角色 *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="pm">项目负责人</SelectItem>
                  <SelectItem value="user">普通用户</SelectItem>
                </SelectContent>
              </Select>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input value={showEdit?.username || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>重置密码（留空不修改）</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="输入新密码"
              />
            </div>
            <div className="space-y-2">
              <Label>真实姓名</Label>
              <Input
                value={form.real_name}
                onChange={(e) => setForm({ ...form, real_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>角色</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="pm">项目负责人</SelectItem>
                    <SelectItem value="user">普通用户</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">正常</SelectItem>
                    <SelectItem value="disabled">禁用</SelectItem>
                    <SelectItem value="pending">待审核</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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

      {/* Change Password Dialog */}
      <Dialog open={showChangePassword !== null} onOpenChange={() => setShowChangePassword(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input value={showChangePassword?.username || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>新密码 *</Label>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="请输入新密码"
              />
            </div>
            <div className="space-y-2">
              <Label>确认密码 *</Label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="请再次输入新密码"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangePassword(null)}>
              取消
            </Button>
            <Button className="bg-[#1e3a5f] hover:bg-[#16304f]" onClick={handleChangePassword}>
              确认修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除用户「{deleteTarget?.real_name || deleteTarget?.username || '-'}（{deleteTarget?.username || '-'} · ID: {deleteTarget?.id}）」吗？
              <br />
              该操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
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
