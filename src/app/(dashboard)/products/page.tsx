'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { Plus, Trash2, Edit, Package, Search, X } from 'lucide-react';
import { toast } from 'sonner';

interface Product {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  owner_id: number | null;
  status: string;
  project_count: number;
  task_count: number;
  active_task_count: number;
  users?: { id: number; real_name: string; username: string } | null;
}

interface UserOption {
  id: number;
  username: string;
  real_name: string;
  role: string;
}

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Product | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  // 筛选条件：includeClosed 控制是否含已关闭；keyword 搜索名称/编号；status/statusFilter；ownerFilter
  const [includeClosed, setIncludeClosed] = useState(false);
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    owner_id: '',
    status: 'active',
  });
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const canManage = user?.role === 'admin' || user?.role === 'pm';

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (includeClosed) params.set('all', '1');
      if (filterKeyword.trim()) params.set('keyword', filterKeyword.trim());
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
      if (filterOwner && filterOwner !== 'all') params.set('ownerId', filterOwner);
      const data = await apiFetch<{ data: Product[] }>(
        `/api/products${params.toString() ? `?${params}` : ''}`
      );
      setProducts(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [includeClosed, filterKeyword, filterStatus, filterOwner]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const fetchUsers = async () => {
    try {
      const data = await apiFetch<{ data: UserOption[] }>('/api/users?pageSize=100');
      if (data.data) setUsers(data.data);
    } catch {
      // ignore
    }
  };

  const resetForm = () => {
    setForm({ name: '', code: '', description: '', owner_id: '', status: 'active' });
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('请填写产品名称');
      return;
    }
    try {
      await apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description,
          owner_id: form.owner_id ? parseInt(form.owner_id) : null,
        }),
      });
      toast.success('产品创建成功');
      setShowCreate(false);
      resetForm();
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const openEdit = (p: Product) => {
    setShowEdit(p);
    setForm({
      name: p.name,
      code: p.code || '',
      description: p.description || '',
      owner_id: p.owner_id ? String(p.owner_id) : '',
      status: p.status,
    });
  };

  const handleEdit = async () => {
    if (!showEdit) return;
    if (!form.name.trim()) {
      toast.error('请填写产品名称');
      return;
    }
    try {
      await apiFetch(`/api/products/${showEdit.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description,
          owner_id: form.owner_id ? parseInt(form.owner_id) : null,
          status: form.status,
        }),
      });
      toast.success('产品更新成功');
      setShowEdit(null);
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('删除成功');
      setDeleteTarget(null);
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
      setDeleteTarget(null);
    }
  };

  const nonAdminUsers = users.filter((u) => u.username !== 'admin');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">产品管理</h1>
          <p className="text-sm text-[#475569] mt-1">
            禅道风格三级结构：产品 → 项目 → 任务，填报日报时需逐级勾选
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              onClick={() => {
                fetchUsers();
                resetForm();
                setShowCreate(true);
              }}
              className="bg-[#1e3a5f] hover:bg-[#16304f]"
            >
              <Plus className="w-4 h-4 mr-2" />
              新建产品
            </Button>
          )}
        </div>
      </div>

      <Card className="border-[#e2e8f0]">
        <CardContent className="p-0">
          {/* 筛选栏 */}
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-[#e2e8f0] bg-[#f8fafc]/60">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
              <Input
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                placeholder="搜索产品名称/编号"
                className="pl-8 h-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">进行中</SelectItem>
                <SelectItem value="closed">已关闭</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="全部负责人" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部负责人</SelectItem>
                {nonAdminUsers.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.real_name} ({u.username})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={includeClosed ? 'default' : 'outline'}
              size="sm"
              className="h-9"
              onClick={() => setIncludeClosed((v) => !v)}
              title={includeClosed ? '当前：含已关闭' : '当前：仅进行中'}
            >
              {includeClosed ? '含已关闭' : '仅进行中'}
            </Button>
            {(filterKeyword || filterStatus !== 'all' || filterOwner !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-[#64748b]"
                onClick={() => {
                  setFilterKeyword('');
                  setFilterStatus('all');
                  setFilterOwner('all');
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
                <TableHead>产品名称</TableHead>
                <TableHead>产品编号</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead>项目数</TableHead>
                <TableHead>任务数（进行中）</TableHead>
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
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-[#475569]">
                    <Package className="w-8 h-8 mx-auto mb-2 text-[#cbd5e1]" />
                    暂无产品，请先创建产品
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <div>{p.name}</div>
                      {p.description && (
                        <div className="text-xs text-[#94a3b8] truncate max-w-[280px]">
                          {p.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-[#475569]">{p.code || '-'}</TableCell>
                    <TableCell>{p.users?.real_name || '-'}</TableCell>
                    <TableCell>{p.project_count}</TableCell>
                    <TableCell>
                      {p.task_count}
                      <span className="text-xs text-[#94a3b8]">（{p.active_task_count}）</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
                        {p.status === 'active' ? '进行中' : '已关闭'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && (
                          <Button variant="ghost" size="sm" onClick={() => { fetchUsers(); openEdit(p); }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {user?.role === 'admin' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(p)}
                            aria-label="删除产品"
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
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新建产品</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>产品名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如 Starfish"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>产品编号</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="可选，如 SF"
                />
              </div>
              <div className="space-y-2">
                <Label>负责人</Label>
                <Select
                  value={form.owner_id}
                  onValueChange={(v) => setForm({ ...form, owner_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择负责人（可选）" />
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
            </div>
            <div className="space-y-2">
              <Label>产品描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 500) })}
                placeholder="产品定位、包含的版本/项目等（最多500字）"
                maxLength={500}
                rows={3}
              />
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
            <DialogTitle>编辑产品</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>产品名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如 Starfish"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>产品编号</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="可选"
                />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
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
            </div>
            <div className="space-y-2">
              <Label>负责人</Label>
              <Select
                value={form.owner_id}
                onValueChange={(v) => setForm({ ...form, owner_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择负责人（可选）" />
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
              <Label>产品描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 500) })}
                maxLength={500}
                rows={3}
              />
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

      {/* Delete AlertDialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除产品</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除产品「{deleteTarget?.name}」吗？
              {deleteTarget && deleteTarget.project_count > 0
                ? `该产品下仍有 ${deleteTarget.project_count} 个项目，无法删除，请先转移或删除项目，或将产品状态改为"关闭"。`
                : '该操作不可撤销。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50"
              disabled={!!deleteTarget && deleteTarget.project_count > 0}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
