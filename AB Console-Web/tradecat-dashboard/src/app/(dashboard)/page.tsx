'use client';

import { useSyncData } from '@/hooks/useSyncData';
import { ConnectionStatus } from '@/components/dashboard/ConnectionStatus';
import { TradeStatsCard } from '@/components/dashboard/TradeStatsCard';
import { StrategyPerformanceList } from '@/components/dashboard/StrategyPerformanceList';
import { RecentTradesList } from '@/components/dashboard/RecentTradesList';
import { CandlestickChart, LineChart, BarChart3, Settings } from 'lucide-react';
import Link from 'next/link';

const quickLinks = [
  { 
    title: 'K线图表', 
    href: '/chart', 
    icon: CandlestickChart, 
    color: 'bg-blue-500',
    desc: '查看价格走势'
  },
  { 
    title: '市场扫描', 
    href: '/scanner', 
    icon: BarChart3, 
    color: 'bg-green-500',
    desc: '发现交易机会'
  },
  { 
    title: '策略分析', 
    href: '/backtest', 
    icon: LineChart, 
    color: 'bg-purple-500',
    desc: '回测策略表现'
  },
  { 
    title: '设置', 
    href: '/settings', 
    icon: Settings, 
    color: 'bg-slate-500',
    desc: '配置系统参数'
  },
];

export default function DashboardPage() {
  const { 
    isConnected, 
    isLoading, 
    error, 
    status, 
    tradeStats, 
    strategies, 
    recentTrades, 
    refresh 
  } = useSyncData();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">欢迎回来，交易员</h1>
        <p className="text-slate-400 mt-1">这是您的交易数据概览</p>
      </div>

      {/* Connection Status */}
      <ConnectionStatus 
        isConnected={isConnected}
        error={error}
        status={status}
        onRefresh={refresh}
        isLoading={isLoading}
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Trade Stats */}
        <TradeStatsCard stats={tradeStats} isLoading={isLoading} />

        {/* Strategy Performance */}
        <StrategyPerformanceList strategies={strategies} isLoading={isLoading} />

        {/* Recent Trades */}
        <RecentTradesList trades={recentTrades} isLoading={isLoading} />
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">快捷入口</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group bg-slate-900 rounded-xl border border-slate-800 p-5 
                         hover:border-slate-700 hover:bg-slate-800/50 transition-all"
            >
              <div className={`${link.color} w-10 h-10 rounded-lg flex items-center justify-center mb-3`}>
                <link.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                {link.title}
              </h3>
              <p className="text-sm text-slate-500 mt-1">{link.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4">
        <p className="text-blue-300 text-sm">
          <span className="font-semibold">💡 提示:</span> 
          数据从 Obsidian 同步服务获取。在 Obsidian 中点击"同步"按钮可将您的交易记录同步到 Web 仪表板。
        </p>
      </div>
    </div>
  );
}
