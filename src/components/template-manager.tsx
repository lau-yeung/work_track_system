'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Plus, Trash2, Pencil, Check, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

export interface TemplateField {
  key: string;
  label: string;
}

export interface ReportTemplate {
  id: number;
  name: string;
  fields: TemplateField[];
  is_default: boolean;
  user_id: number | null;
}

interface TemplateManagerProps {
  templates: ReportTemplate[];
  onChange: () => void;
}

export function TemplateManager({ templates, onChange }: TemplateManagerProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReportTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formFields, setFormFields] = useState<TemplateField[]>([]);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormFields([{ key: 'plan', label: '本周计划' }]);
  };

  const openEdit = (t: ReportTemplate) => {
    setEditing(t);
    setFormName(t.name);
    setFormFields(t.fields.map((f) => ({ ...f })));
  };

  const addField = () => {
    setFormFields((prev) => [...prev, { key: `field_${prev.length + 1}`, label: '' }]);
  };

  const updateField = (idx: number, patch: Partial<TemplateField>) => {
    setFormFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const removeField = (idx: number) => {
    setFormFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('模板名称必填');
      return;
    }
    const validFields = formFields.filter((f) => f.key.trim() && f.label.trim());
    if (validFields.length === 0) {
      toast.error('至少需要一个有效字段');
      return;
    }
    // 规范化 key
    for (const f of validFields) {
      if (!/^[a-zA-Z0-9_]+$/.test(f.key)) {
        toast.error(`字段 key 仅允许字母数字下划线: ${f.key}`);
        return;
      }
    }
    setSaving(true);
    try {
      if (editing) {
        if (editing.user_id === null) {
          toast.error('系统内置模板不可编辑');
          return;
        }
        await apiFetch(`/api/report-templates/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: formName.trim(), fields: validFields }),
        });
      } else {
        await apiFetch('/api/report-templates', {
          method: 'POST',
          body: JSON.stringify({ name: formName.trim(), fields: validFields, is_default: false }),
        });
      }
      toast.success('保存成功');
      setEditing(null);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: ReportTemplate) => {
    if (t.user_id === null) {
      toast.error('系统内置模板不可删除');
      return;
    }
    if (!confirm(`确认删除模板「${t.name}」？`)) return;
    try {
      await apiFetch(`/api/report-templates/${t.id}`, { method: 'DELETE' });
      toast.success('已删除');
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSetDefault = async (t: ReportTemplate) => {
    try {
      await apiFetch(`/api/report-templates/${t.id}/default`, { method: 'POST' });
      toast.success('已设为默认模板');
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置失败');
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="w-4 h-4 mr-2" />
          模板配置
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-[#1e3a5f]">模板配置</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6 space-y-4">
          {/* 模板列表 */}
          <div className="space-y-2">
            {templates.length === 0 ? (
              <p className="text-sm text-[#94a3b8] text-center py-4">暂无模板</p>
            ) : (
              templates.map((t) => (
                <div key={t.id} className="border border-[#e2e8f0] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-[#1e293b]">{t.name}</span>
                      {t.is_default && (
                        <span className="text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">默认</span>
                      )}
                      {t.user_id === null && (
                        <span className="text-xs text-[#94a3b8] bg-gray-50 px-1.5 py-0.5 rounded">系统内置</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {!t.is_default && (
                        <Button variant="ghost" size="sm" onClick={() => handleSetDefault(t)} title="设为默认">
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        </Button>
                      )}
                      {t.user_id !== null && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)} title="编辑">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {t.user_id !== null && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(t)} title="删除">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.fields.map((f, i) => (
                      <span key={i} className="text-xs text-[#475569] bg-gray-50 px-1.5 py-0.5 rounded">
                        {f.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {!editing ? (
            <Button onClick={openCreate} variant="outline" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              新建模板
            </Button>
          ) : (
            <div className="border border-[#e2e8f0] rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#1e3a5f]">
                  {editing.id && editing.user_id !== null ? '编辑模板' : '新建模板'}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  取消
                </Button>
              </div>
              <div>
                <Label className="text-xs mb-1 block">模板名称</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="如：项目周报模板"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">字段（key 仅字母数字下划线）</Label>
                <div className="space-y-2">
                  {formFields.map((f, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={f.key}
                        onChange={(e) => updateField(idx, { key: e.target.value })}
                        placeholder="key"
                        className="w-32"
                      />
                      <Input
                        value={f.label}
                        onChange={(e) => updateField(idx, { label: e.target.value })}
                        placeholder="显示名称"
                        className="flex-1"
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeField(idx)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2" onClick={addField}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  添加字段
                </Button>
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full bg-[#1e3a5f] hover:bg-[#16304f]">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中</> : '保存模板'}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
