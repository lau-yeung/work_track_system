'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
} from '@/components/ui/alert-dialog';
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  ArrowUp,
  ArrowDown,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

export interface TemplateField {
  id?: number;
  field_name: string;
  field_type: 'text' | 'textarea';
  description: string;
  sort_order: number;
}

export interface SummaryTemplate {
  id: number;
  name: string;
  applicable_dimension: 'week' | 'month' | 'both' | 'custom';
  is_default: boolean;
  created_at: string;
  fields: TemplateField[];
}

const DIM_OPTIONS: Array<{ value: SummaryTemplate['applicable_dimension']; label: string }> = [
  { value: 'week', label: '仅周报' },
  { value: 'month', label: '仅月报' },
  { value: 'both', label: '周报+月报' },
  { value: 'custom', label: '自定义周期' },
];

export function TemplatesTab() {
  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SummaryTemplate | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<{
    name: string;
    applicable_dimension: SummaryTemplate['applicable_dimension'];
    fields: TemplateField[];
  }>({
    name: '',
    applicable_dimension: 'both',
    fields: [
      { field_name: '', field_type: 'textarea', description: '', sort_order: 1 },
    ],
  });

  const resetForm = () => {
    setForm({
      name: '',
      applicable_dimension: 'both',
      fields: [{ field_name: '', field_type: 'textarea', description: '', sort_order: 1 }],
    });
    setEditingId(null);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ data: SummaryTemplate[] }>('/api/templates');
      setTemplates(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载模板失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (t: SummaryTemplate) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      applicable_dimension: t.applicable_dimension,
      fields: [...(t.fields || [])].sort((a, b) => a.sort_order - b.sort_order),
    });
    setDialogOpen(true);
  };

  const addField = () => {
    setForm({
      ...form,
      fields: [
        ...form.fields,
        {
          field_name: '',
          field_type: 'textarea',
          description: '',
          sort_order: form.fields.length + 1,
        },
      ],
    });
  };

  const removeField = (i: number) => {
    if (form.fields.length === 1) return;
    const next = form.fields.filter((_, idx) => idx !== i).map((f, idx) => ({ ...f, sort_order: idx + 1 }));
    setForm({ ...form, fields: next });
  };

  const moveField = (i: number, dir: -1 | 1) => {
    const arr = form.fields.slice();
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    arr.forEach((f, idx) => (f.sort_order = idx + 1));
    setForm({ ...form, fields: arr });
  };

  const updateField = (i: number, patch: Partial<TemplateField>) => {
    const arr = form.fields.slice();
    arr[i] = { ...arr[i], ...patch };
    setForm({ ...form, fields: arr });
  };

  const submit = async () => {
    if (!form.name.trim()) return toast.error('模板名称必填');
    const names = form.fields.map((f) => f.field_name.trim()).filter(Boolean);
    if (names.length === 0) return toast.error('至少填写一个字段名');
    if (new Set(names).size !== names.length) return toast.error('字段名不可重复');

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        applicable_dimension: form.applicable_dimension,
        fields: form.fields
          .filter((f) => f.field_name.trim())
          .map((f, idx) => ({ ...f, field_name: f.field_name.trim(), sort_order: idx + 1 })),
      };
      if (editingId) {
        await apiFetch(`/api/templates/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success('模板已更新');
      } else {
        await apiFetch('/api/templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('模板已创建');
      }
      setDialogOpen(false);
      resetForm();
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const setDefault = async (id: number) => {
    try {
      await apiFetch(`/api/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_default: true }),
      });
      toast.success('已设为默认模板');
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/templates/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('已删除');
      setDeleteTarget(null);
      fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-[#e2e8f0]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold text-[#1e3a5f]">模板管理</CardTitle>
          <Button onClick={openNew} className="bg-[#1e3a5f] hover:bg-[#16304f]">
            <Plus className="w-4 h-4 mr-2" />
            新建模板
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-[#64748b]">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> 加载中...
            </div>
          ) : templates.length === 0 ? (
            <div className="py-10 text-center text-[#64748b]">暂无模板，点击右上角创建</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>模板名</TableHead>
                  <TableHead>适用维度</TableHead>
                  <TableHead>字段数</TableHead>
                  <TableHead>默认</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      {DIM_OPTIONS.find((o) => o.value === t.applicable_dimension)?.label ||
                        t.applicable_dimension}
                    </TableCell>
                    <TableCell>{t.fields?.length || 0}</TableCell>
                    <TableCell>
                      {t.is_default ? (
                        <span className="inline-flex items-center text-[14px] text-[#a16207]">
                          <Star className="w-4 h-4 mr-1 fill-yellow-400 text-yellow-500" />
                          默认
                        </span>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setDefault(t.id)}>
                          设为默认
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={t.is_default}
                        onClick={() => setDeleteTarget(t)}
                        title={t.is_default ? '默认模板不可删除' : '删除'}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 新建/编辑弹窗 */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) resetForm();
          setDialogOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑模板' : '新建模板'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>模板名 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如：标准周报模板"
                />
              </div>
              <div className="space-y-2">
                <Label>适用维度</Label>
                <Select
                  value={form.applicable_dimension}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      applicable_dimension: v as SummaryTemplate['applicable_dimension'],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIM_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>自定义字段（按顺序）</Label>
                <Button variant="outline" size="sm" onClick={addField}>
                  <Plus className="w-4 h-4 mr-1" />
                  添加字段
                </Button>
              </div>
              <div className="space-y-2">
                {form.fields.map((f, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[auto_1fr_1fr_2fr_auto] gap-2 items-center p-2 border border-[#e2e8f0] rounded-md bg-[#f8fafc]/50"
                  >
                    <div className="flex flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveField(i, -1)}
                        disabled={i === 0}
                        className="h-7 w-7 p-0"
                        aria-label="上移"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveField(i, 1)}
                        disabled={i === form.fields.length - 1}
                        className="h-7 w-7 p-0"
                        aria-label="下移"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div>
                      <Input
                        value={f.field_name}
                        onChange={(e) => updateField(i, { field_name: e.target.value })}
                        placeholder="字段名 *"
                      />
                    </div>
                    <div>
                      <Select
                        value={f.field_type}
                        onValueChange={(v) =>
                          updateField(i, { field_type: v as TemplateField['field_type'] })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">短文本</SelectItem>
                          <SelectItem value="textarea">长文本</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Input
                        value={f.description}
                        onChange={(e) => updateField(i, { description: e.target.value })}
                        placeholder="字段说明（可选）"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeField(i)}
                      disabled={form.fields.length === 1}
                      className="text-red-500 hover:bg-red-50 h-8 w-8 p-0"
                      aria-label="移除字段"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#16304f]"
              onClick={submit}
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
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除模板</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除模板「{deleteTarget?.name}」吗？
              <br />
              已引用该模板的 work_summaries 将保留历史内容，但 template_id 会置空。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmDelete}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
