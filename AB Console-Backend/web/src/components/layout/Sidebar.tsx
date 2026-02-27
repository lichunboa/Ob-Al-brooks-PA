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
  Wallet,
  BarChart3,
  FlaskConical,
  TableProperties,
  Shield,
  Wrench,
  Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BackendControl } from './BackendControl';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Obsidian',
    items: [
      { href: '/strategies', label: '策略管理', icon: BookOpen },
    ],
  },
  {
    title: '后端',
    items: [
      { href: '/', label: '仪表板', icon: LayoutDashboard },
      { href: '/data-overview', label: '数据总览', icon: Database },
      { href: '/chart', label: 'K线图表', icon: CandlestickChart },
      { href: '/scanner', label: '市场扫描', icon: Scan },
      { href: '/vpvr', label: 'VPVR 分析', icon: BarChart3 },
      { href: '/backtest', label: '回测分析', icon: FlaskConical },
    ],
  },
  {
    title: 'Agent',
    items: [
      { href: '/signals', label: '信号监控', icon: Bell },
      { href: '/execution', label: '交易总览', icon: Wallet },
      { href: '/execution/positions', label: '持仓管理', icon: TableProperties },
      { href: '/execution/risk', label: '风控配置', icon: Shield },
      { href: '/execution/ops', label: '运维工具', icon: Wrench },
      { href: '/pa-bot', label: 'PA Bot', icon: Bot },
      { href: '/trades', label: '交易记录', icon: Receipt },
    ],
  },
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

        {/* 分组导航 */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.title}>
              <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

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
              </div>
            </div>
          ))}

          {/* 设置 — 底部分隔 */}
          <div className="border-t border-slate-800 pt-4">
            <Link
              href="/settings"
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname === '/settings'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Settings className="w-5 h-5" />
              设置
            </Link>
          </div>
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
