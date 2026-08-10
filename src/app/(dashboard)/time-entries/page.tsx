'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch, apiDownload } from '@/lib/api';
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
import { Plus, Edit, Trash2, Calendar, Loader2, Download, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { BatchEntryDialog } from './batch-entry-dialog';

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

interface TimeEntryMutationResult {
  data: TimeEntry;
  daily_total: number;
  is_below_minimum: boolean;
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
  const [submitting, setSubmitting] = useState(false);
  const [filterProject, setFilterProject] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [form, setForm] = useState({
    project_id: '',
    work_date: new Date().toISOString().split('T')[0],
    hours: '',
    remarks: '',
    completed_work: '',
    coordination_matters: '',
    tomorrow_plan: '',
  });
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [existingDailyTotal, setExistingDailyTotal] = useState<number | undefined>(undefined);
  const [exportForm, setExportForm] = useState({
    dimension: 'month' as 'day' | 'week' | 'month' | 'year' | 'custom',
    format: 'excel' as 'excel' | 'csv' | 'markdown',
    date: new Date().toISOString().split('T')[0],
    startDate: '',
    endDate: '',
    projectId: 'all',
  });

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (filterProject && filterProject !== 'all') params.set('projectId', filterProject);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const data = await apiFetch<{ data: TimeEntry[]; total: number }>(`/api/time-entries?${params}`);
      setEntries(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [page, filterProject, startDate, endDate]);

  const fetchProjects = async () => {
    try {
      const data = await apiFetch<{ data: ProjectOption[] }>('/api/projects/my');
      if (data.data) setProjects(data.data);
    } catch {
      // ignore
    }
  };

  const openBatchDialog = async () => {
    // Query today's existing total for the current user
    const today = new Date().toISOString().split('T')[0];
    try {
      const data = await apiFetch<{ data: TimeEntry[] }>(
        `/api/time-entries?startDate=${today}&endDate=${today}&pageSize=100`
      );
      const total = (data.data || []).reduce(
        (sum, e) => sum + parseFloat(e.hours),
        0
      );
      setExistingDailyTotal(Math.round(total * 10) / 10);
    } catch {
      setExistingDailyTotal(undefined);
    }
    setShowBatch(true);
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
    if (!form.completed_work.trim()) {
      toast.error('请填写今日完成工作');
      return;
    }
    if (!form.tomorrow_plan.trim()) {
      toast.error('请填写明日计划工作');
      return;
    }

    setSubmitting(true);
    try {
      const hours = parseFloat(form.hours);
      if (isNaN(hours) || hours <= 0 || hours > 24) {
        toast.error('工时必须在 0-24 之间');
        setSubmitting(false);
        return;
      }

      const result = await apiFetch<TimeEntryMutationResult>('/api/time-entries', {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(form.project_id),
          work_date: form.work_date,
          hours: String(hours),
          remarks: form.remarks,
          completed_work: form.completed_work,
          coordination_matters: form.coordination_matters,
          tomorrow_plan: form.tomorrow_plan,
        }),
      });
      toast.success('工时填报成功');
      if (result.is_below_minimum) {
        toast.warning(
          `今日已填报 ${result.daily_total} 小时，不足 8 小时，请确认是否需要补填`
        );
      }
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
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editEntry) return;
    try {
      const result = await apiFetch<TimeEntryMutationResult>(`/api/time-entries/${editEntry.id}`, {
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
      if (result.is_below_minimum) {
        toast.warning(
          `今日已填报 ${result.daily_total} 小时，不足 8 小时，请确认是否需要补填`
        );
      }
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

  const handleResetFilters = () => {
    setFilterProject('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const openExportDialog = () => {
    // Prefill export form with current filter values for convenience
    setExportForm((prev) => ({
      ...prev,
      date: new Date().toISOString().split('T')[0],
      startDate: startDate || prev.startDate,
      endDate: endDate || prev.endDate,
      projectId: filterProject && filterProject !== 'all' ? filterProject : 'all',
    }));
    setShowExport(true);
  };

  const handleExport = async () => {
    const { dimension, format, date, startDate: exStart, endDate: exEnd, projectId } = exportForm;

    if (dimension === 'custom') {
      if (!exStart || !exEnd) {
        toast.error('自定义维度需要选择开始和结束日期');
        return;
      }
      if (exStart > exEnd) {
        toast.error('开始日期不能晚于结束日期');
        return;
      }
    } else if (!date) {
      toast.error('请选择日期');
      return;
    }

    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('format', format);
      params.set('dimension', dimension);
      if (dimension === 'custom') {
        params.set('startDate', exStart);
        params.set('endDate', exEnd);
      } else {
        params.set('date', date);
      }
      if (projectId && projectId !== 'all') params.set('projectId', projectId);

      const { blob, filename } = await apiDownload(`/api/time-entries/export?${params}`);

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('导出成功');
      setShowExport(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openExportDialog}>
            <Download className="w-4 h-4 mr-2" />
            导出日报
          </Button>
          <Button variant="outline" onClick={openBatchDialog}>
            <Layers className="w-4 h-4 mr-2" />
            批量填报
          </Button>
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
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-3 mb-4">
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

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#475569]" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            placeholder="开始日期"
            className="w-40"
          />
          <span className="text-[#475569]">至</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            placeholder="结束日期"
            className="w-40"
          />
        </div>

        {(filterProject || startDate || endDate) && (
          <Button variant="outline" onClick={handleResetFilters}>
            重置筛选
          </Button>
        )}
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
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={submitting}>
              取消
            </Button>
            <Button className="bg-[#1e3a5f] hover:bg-[#16304f]" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  提交中...
                </>
              ) : (
                '提交'
              )}
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

      {/* Export Dialog */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>导出工时日报</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>统计维度 *</Label>
              <Select
                value={exportForm.dimension}
                onValueChange={(v) =>
                  setExportForm({ ...exportForm, dimension: v as typeof exportForm.dimension })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择统计维度" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">按日</SelectItem>
                  <SelectItem value="week">按周（周一至周日）</SelectItem>
                  <SelectItem value="month">按月</SelectItem>
                  <SelectItem value="year">按年</SelectItem>
                  <SelectItem value="custom">自定义范围</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-[#64748b]">
                {exportForm.dimension === 'day' && '导出所选日期当天的工时记录'}
                {exportForm.dimension === 'week' && '导出所选日期所在周（周一至周日）的工时记录'}
                {exportForm.dimension === 'month' && '导出所选日期所在月的工时记录'}
                {exportForm.dimension === 'year' && '导出所选日期所在年的工时记录'}
                {exportForm.dimension === 'custom' && '导出指定起止日期范围内的工时记录'}
              </p>
            </div>

            {exportForm.dimension === 'custom' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>开始日期 *</Label>
                  <Input
                    type="date"
                    value={exportForm.startDate}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, startDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>结束日期 *</Label>
                  <Input
                    type="date"
                    value={exportForm.endDate}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, endDate: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>基准日期 *</Label>
                <Input
                  type="date"
                  value={exportForm.date}
                  onChange={(e) => setExportForm({ ...exportForm, date: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>项目（可选）</Label>
              <Select
                value={exportForm.projectId}
                onValueChange={(v) => setExportForm({ ...exportForm, projectId: v })}
              >
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label>导出格式 *</Label>
              <Select
                value={exportForm.format}
                onValueChange={(v) =>
                  setExportForm({ ...exportForm, format: v as typeof exportForm.format })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择导出格式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                  <SelectItem value="markdown">Markdown (.md)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-[#64748b]">
                {exportForm.format === 'excel' && '适合表格软件打开，含合并标题行与合计行'}
                {exportForm.format === 'csv' && '通用纯文本格式，UTF-8 编码（含 BOM）'}
                {exportForm.format === 'markdown' && '按日期分组的 Markdown 文档，便于阅读与归档'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExport(false)} disabled={exporting}>
              取消
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#16304f]"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  导出
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Entry Dialog */}
      <BatchEntryDialog
        open={showBatch}
        onOpenChange={setShowBatch}
        projects={projects}
        onSubmitted={fetchEntries}
        existingDailyTotal={existingDailyTotal}
      />
    </div>
  );
}
