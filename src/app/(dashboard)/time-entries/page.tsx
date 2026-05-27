'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
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
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface TimeEntry {
  id: number;
  project_id: number;
  work_date: string;
  hours: string;
  remarks: string | null;
  completed_work: string | null;
  coordination_matters: string | null;
  tomorrow_plan: string | null;
  projects: { id: number; name: string };
  users: { id: number; real_name: string; username: string };
}

interface ProjectOption {
  id: number;
  name: string;
  status: string;
}

export default function TimeEntriesPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [filterProject, setFilterProject] = useState('');
  const [form, setForm] = useState({
    project_id: '',
    work_date: new Date().toISOString().split('T')[0],
    hours: '',
    remarks: '',
    completed_work: '',
    coordination_matters: '',
    tomorrow_plan: '',
  });

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (filterProject) params.set('projectId', filterProject);
      const data = await apiFetch<{ data: TimeEntry[]; total: number }>(`/api/time-entries?${params}`);
      setEntries(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [page, filterProject]);

  const fetchProjects = async () => {
    try {
      const data = await apiFetch<{ data: ProjectOption[] }>('/api/projects/my');
      if (data.data) setProjects(data.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleSubmit = async () => {
    if (!form.project_id || !form.work_date || !form.hours) {
      toast.error('项目、工作日期和工时为必填');
      return;
    }
    if (!form.completed_work) {
      toast.error('请填写今日完成工作');
      return;
    }
    if (!form.tomorrow_plan) {
      toast.error('请填写明日计划工作');
      return;
    }

    try {
      await apiFetch('/api/time-entries', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      toast.success('工时填报成功');
      setShowCreate(false);
      setForm({
        project_id: '',
        work_date: new Date().toISOString().split('T')[0],
        hours: '',
        remarks: '',
        completed_work: '',
        coordination_matters: '',
        tomorrow_plan: '',
      });
      fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '填报失败');
    }
  };

  const handleEdit = async () => {
    if (!editEntry) return;
    try {
      await apiFetch(`/api/time-entries/${editEntry.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          hours: form.hours,
          remarks: form.remarks,
          completed_work: form.completed_work,
          coordination_matters: form.coordination_matters,
          tomorrow_plan: form.tomorrow_plan,
        }),
      });
      toast.success('工时更新成功');
      setEditEntry(null);
      fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该工时记录？')) return;
    try {
      await apiFetch(`/api/time-entries/${id}`, { method: 'DELETE' });
      toast.success('删除成功');
      fetchEntries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const openEdit = (entry: TimeEntry) => {
    setEditEntry(entry);
    setForm({
      project_id: String(entry.project_id),
      work_date: entry.work_date,
      hours: entry.hours,
      remarks: entry.remarks || '',
      completed_work: entry.completed_work || '',
      coordination_matters: entry.coordination_matters || '',
      tomorrow_plan: entry.tomorrow_plan || '',
    });
  };

  const totalPages = Math.ceil(total / 20);

  const entryForm = (isEdit: boolean) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>项目 *</Label>
          {isEdit ? (
            <Input value={entries.find((e) => e.id === editEntry?.id)?.projects?.name || ''} disabled />
          ) : (
            <Select
              value={form.project_id}
              onValueChange={(v) => setForm({ ...form, project_id: v })}
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
          )}
        </div>
        <div className="space-y-2">
          <Label>工作日期 *</Label>
          {isEdit ? (
            <Input value={form.work_date} disabled />
          ) : (
            <Input
              type="date"
              value={form.work_date}
              onChange={(e) => setForm({ ...form, work_date: e.target.value })}
            />
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label>工时(h) *（步长0.5，单日总工时不超8h）</Label>
        <Input
          type="number"
          step="0.5"
          min="0.5"
          max="8"
          value={form.hours}
          onChange={(e) => setForm({ ...form, hours: e.target.value })}
          placeholder="例如：4、6.5、8"
        />
      </div>
      <div className="space-y-2">
        <Label>今日完成工作 *</Label>
        <Textarea
          value={form.completed_work}
          onChange={(e) => setForm({ ...form, completed_work: e.target.value })}
          placeholder="请描述今日完成的工作内容"
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>需协调事宜</Label>
        <Textarea
          value={form.coordination_matters}
          onChange={(e) => setForm({ ...form, coordination_matters: e.target.value })}
          placeholder="可选，需要协调的事项"
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>明日计划工作 *</Label>
        <Textarea
          value={form.tomorrow_plan}
          onChange={(e) => setForm({ ...form, tomorrow_plan: e.target.value })}
          placeholder="请描述明日计划工作"
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>备注</Label>
        <Input
          value={form.remarks}
          onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          placeholder="可选备注"
        />
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">工时日报</h1>
          <p className="text-sm text-[#475569] mt-1">填报和管理每日工时</p>
        </div>
        <Button
          onClick={() => {
            setForm({
              project_id: '',
              work_date: new Date().toISOString().split('T')[0],
              hours: '',
              remarks: '',
              completed_work: '',
              coordination_matters: '',
              tomorrow_plan: '',
            });
            setShowCreate(true);
          }}
          className="bg-[#1e3a5f] hover:bg-[#16304f]"
        >
          <Plus className="w-4 h-4 mr-2" />
          填报工时
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="全部项目" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-[#e2e8f0]">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>项目</TableHead>
                <TableHead>工作日期</TableHead>
                <TableHead>工时</TableHead>
                <TableHead>完成工作</TableHead>
                <TableHead>填报人</TableHead>
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
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-[#475569]">
                    暂无工时记录
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.projects?.name || '-'}</TableCell>
                    <TableCell>{e.work_date}</TableCell>
                    <TableCell>{e.hours}h</TableCell>
                    <TableCell className="max-w-xs truncate">{e.completed_work || '-'}</TableCell>
                    <TableCell>{e.users?.real_name || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(e.users?.id === user?.id || user?.role === 'admin') && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(e)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(e.id)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </>
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
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>填报工时</DialogTitle>
          </DialogHeader>
          {entryForm(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button className="bg-[#1e3a5f] hover:bg-[#16304f]" onClick={handleSubmit}>
              提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editEntry !== null} onOpenChange={() => setEditEntry(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑工时</DialogTitle>
          </DialogHeader>
          {entryForm(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>
              取消
            </Button>
            <Button className="bg-[#1e3a5f] hover:bg-[#16304f]" onClick={handleEdit}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
