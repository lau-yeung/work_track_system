'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import {
  LayoutDashboard,
  FolderKanban,
  Clock,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Sparkles,
  Target,
  CalendarCheck2,
  TrendingUp,
  Award,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/projects', label: '项目管理', icon: FolderKanban },
  { href: '/time-entries', label: '工时日报', icon: Clock },
  { href: '/monthly-goals', label: '月度目标', icon: Target },
  { href: '/weekly-reports', label: '周报汇总', icon: CalendarCheck2 },
  { href: '/work-summary', label: '工作总结', icon: Sparkles },
  { href: '/my-performance', label: '我的绩效', icon: TrendingUp },
  { href: '/analytics', label: '数据分析', icon: BarChart3 },
];

const adminItems = [
  { href: '/performance', label: '绩效评分', icon: Award },
  { href: '/users', label: '用户管理', icon: Users },
  { href: '/settings', label: '系统配置', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-[#1e3a5f] text-white flex flex-col z-50">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-white/10">
        <Clock className="w-6 h-6 mr-2 text-amber-400" />
        <span className="font-semibold text-lg tracking-tight">工时管理系统</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}

        {user?.role === 'admin' && (
          <>
            <div className="pt-4 pb-2 px-3">
              <span className="text-xs text-white/40 uppercase tracking-wider">管理</span>
            </div>
            {adminItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User Info */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-400 text-sm font-bold">
            {user?.real_name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.real_name}</p>
            <p className="text-xs text-white/50">
              {user?.role === 'admin' ? '管理员' : user?.role === 'pm' ? '项目负责人' : '普通用户'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>
      </div>
    </aside>
  );
}
