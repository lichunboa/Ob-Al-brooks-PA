'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CandlestickChart,
  Scan,
  Bell,
  BookOpen,
  Settings,
  Menu,
  X,
  Receipt,
  Database,
  Wallet
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BackendControl } from './BackendControl';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const navItems = [
  { href: '/', label: '仪表板', icon: LayoutDashboard },
  { href: '/data-overview', label: '数据总览', icon: Database },
  { href: '/execution', label: '交易执行', icon: Wallet },
  { href: '/chart', label: 'K线图表', icon: CandlestickChart },
  { href: '/scanner', label: '市场扫描', icon: Scan },
  { href: '/signals', label: '信号监控', icon: Bell },
  { href: '/strategies', label: '策略管理', icon: BookOpen },
  { href: '/trades', label: '交易记录', icon: Receipt },
  { href: '/settings', label: '设置', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const pathname = usePathname();

  return (
    <>
      {/* 移动端遮罩 */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full bg-slate-900 border-r border-slate-800 transition-transform duration-300 ease-in-out',
          'w-64 flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:static'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🦁</span>
            <span className="text-lg font-bold text-white">AB Console</span>
          </Link>
          <button
            onClick={onToggle}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 导航 */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* 后端控制面板 */}
        <BackendControl />

        {/* 底部信息 */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            系统正常
          </div>
          <p className="mt-1 text-xs text-slate-600">
            v2.7.0
          </p>
        </div>
      </aside>
    </>
  );
};

export const SidebarToggle: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 lg:hidden"
  >
    <Menu className="w-5 h-5" />
  </button>
);
