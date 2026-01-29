'use client';

import React from 'react';
import Link from 'next/link';
import { 
  CandlestickChart, 
  Scan, 
  Bell, 
  BookOpen, 
  FlaskConical 
} from 'lucide-react';

const features = [
  {
    title: 'K线图表',
    description: '专业级图表分析，支持多时间框架',
    icon: CandlestickChart,
    href: '/chart',
    color: 'bg-blue-500',
  },
  {
    title: '市场扫描',
    description: '实时监控多个品种的价格变动',
    icon: Scan,
    href: '/scanner',
    color: 'bg-green-500',
  },
  {
    title: '信号监控',
    description: '接收并管理交易信号提醒',
    icon: Bell,
    href: '/signals',
    color: 'bg-yellow-500',
  },
  {
    title: '策略管理',
    description: '管理和优化交易策略',
    icon: BookOpen,
    href: '/strategies',
    color: 'bg-purple-500',
  },
  {
    title: '策略回测',
    description: '回测策略历史表现',
    icon: FlaskConical,
    href: '/backtest',
    color: 'bg-pink-500',
  },
];

export default function DashboardPage() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* 欢迎区域 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          欢迎回来，交易员
        </h1>
        <p className="text-slate-400">
          今日市场概览和快速导航
        </p>
      </div>

      {/* 功能卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Link
              key={feature.title}
              href={feature.href}
              className="group p-6 bg-slate-900 rounded-xl border border-slate-800 hover:border-slate-700 transition-all hover:shadow-lg"
            >
              <div className={`w-12 h-12 ${feature.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-slate-400">
                {feature.description}
              </p>
            </Link>
          );
        })}
      </div>

      {/* 快速提示 */}
      <div className="mt-8 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
        <h4 className="text-sm font-medium text-blue-400 mb-1">
          💡 提示
        </h4>
        <p className="text-sm text-slate-400">
          点击左侧导航栏或上方卡片快速访问各个功能模块。
          确保后端服务已启动以获得实时数据。
        </p>
      </div>
    </div>
  );
}
