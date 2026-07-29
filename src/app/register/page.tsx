'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    real_name: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user) {
      window.location.href = '/dashboard';
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!form.username || !form.password || !form.email || !form.real_name) {
      setError('所有字段为必填');
      return;
    }
    
    if (form.password !== form.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    
    if (form.password.length < 6) {
      setError('密码长度至少6位');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await apiFetch<{ message: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          email: form.email,
          real_name: form.real_name,
        }),
      });
      
      setSuccess(true);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  if (user) return null;

  if (success) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#1e3a5f] mb-4">
              <Clock className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-[#1e3a5f]">工时管理系统</h1>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-[#1e3a5f] mb-2">注册成功</h2>
            <p className="text-[#475569] mb-6">{message}</p>
            <Link href="/login">
              <Button className="bg-[#1e3a5f] hover:bg-[#16304f]">
                返回登录
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo Area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#1e3a5f] mb-4">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">工时管理系统</h1>
          <p className="text-sm text-[#475569] mt-1">Time Management System</p>
        </div>

        {/* Register Card */}
        <div className="bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-8">
          <h2 className="text-lg font-semibold text-[#1e3a5f] mb-6">用户注册</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名 *</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="请输入用户名"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="real_name">真实姓名 *</Label>
              <Input
                id="real_name"
                value={form.real_name}
                onChange={(e) => setForm({ ...form, real_name: e.target.value })}
                placeholder="请输入真实姓名"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱 *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="请输入邮箱"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码 *</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="请输入密码（至少6位）"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码 *</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="请再次输入密码"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-[#1e3a5f] hover:bg-[#16304f]"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  注册中...
                </>
              ) : (
                '注册'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-sm text-[#475569]">
              已有账号？
              <Link href="/login" className="text-[#1e3a5f] font-medium ml-1 hover:underline">
                立即登录
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
