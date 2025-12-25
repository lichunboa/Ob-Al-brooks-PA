/* ============================================
   PA Trading System - Theme Config v3.0
   Price Action 交易系统 - 主题配置 v3.0
   
   Modern Glassmorphism + Gradient Design
   现代磨砂玻璃 + 渐变设计
   ============================================ */

module.exports = {
  // 🎨 1. Color System | 色彩系统
  colors: {
    // Trading Status | 交易状态
    live: "#10B981", // Live Trading | 实盘
    demo: "#3B82F6", // Demo Account | 模拟
    back: "#F59E0B", // Backtest | 回测
    loss: "#EF4444", // Loss | 亏损
    win: "#10B981", // Profit | 盈利

    // UI Foundation | 界面基础
    text: "#F3F4F6", // Primary Text | 主文字
    textSub: "rgba(243,244,246,0.6)", // Secondary Text | 次级文字
    textDim: "rgba(243,244,246,0.4)", // Dimmed Text | 暗文字
    accent: "#60A5FA", // Accent Blue | 强调蓝
    accentPurple: "#A78BFA", // Accent Purple | 强调紫

    // Background System | 背景系统
    bg: "#0F172A", // Base | 基础底色
    bgElevated: "#1E293B", // Elevated | 抬升层
    panel: "rgba(30, 41, 59, 0.7)", // Panel | 面板
    card: "rgba(51, 65, 85, 0.5)", // Card | 卡片
    hover: "rgba(100, 116, 139, 0.15)", // Hover | 悬停

    // Border System | 边框系统
    border: "rgba(148, 163, 184, 0.1)", // Normal | 常规
    borderLight: "rgba(148, 163, 184, 0.2)", // Light | 浅色
    borderAccent: "rgba(96, 165, 250, 0.3)", // Accent | 强调

    // Legacy Aliases | 旧键兼容（部分 View 历史版本引用）
    sub: "rgba(243,244,246,0.6)", // -> textSub
    purple: "#A78BFA", // -> accentPurple
    danger: "#EF4444", // -> loss
    warn: "#F59E0B", // -> back
    success: "#10B981", // -> live

    // Legacy Compatibility | 向后兼容 (旧视图文件使用)
    cardBg:
      "background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.6) 100%); backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05); color: #F3F4F6;",
    tagBg: "rgba(51, 65, 85, 0.5)",
    tagBorder: "1px solid rgba(148, 163, 184, 0.1)",
  },

  // 💅 2. Style Library | 样式库
  styles: {
    // Glass Card | 玻璃卡片
    glassCard: `
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.6) 100%);
            backdrop-filter: blur(16px) saturate(180%);
            -webkit-backdrop-filter: blur(16px) saturate(180%);
            border: 1px solid rgba(148, 163, 184, 0.1);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
            color: #F3F4F6;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `,

    // Pill Badge | 胶囊徽章
    pill: `
            display: inline-block;
            padding: 4px 12px;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 500;
            font-family: 'SF Mono', 'Consolas', monospace;
            background: rgba(100, 116, 139, 0.15);
            border: 1px solid rgba(148, 163, 184, 0.2);
            color: rgba(243, 244, 246, 0.9);
            transition: all 0.2s ease;
        `,

    // Gradient Pill | 渐变胶囊
    pillGradient: `
            display: inline-block;
            padding: 4px 12px;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 500;
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.2), rgba(167, 139, 250, 0.2));
            border: 1px solid rgba(96, 165, 250, 0.3);
            color: #F3F4F6;
        `,

    // Flex Layouts | 弹性布局
    flexBetween: `display: flex; justify-content: space-between; align-items: center;`,
    flexCenter: `display: flex; justify-content: center; align-items: center;`,
    flexStart: `display: flex; justify-content: flex-start; align-items: center; gap: 8px;`,

    // Header | 标题
    sectionHeader: `
            font-size: 1.125rem;
            font-weight: 600;
            color: #F3F4F6;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid rgba(96, 165, 250, 0.3);
        `,
  },

  // 📂 3. Paths & Tags | 路径与标签
  paths: {
    syllabus: "PA_Syllabus_Data.md",
    templates: "Templates",
    attachments: "Attachments",
    daily: "Daily",
    notes: "Notes 笔记",
  },

  tags: {
    trade: "#PA/Trade",
    daily: "#PA/Daily",
    course: "#PA/Course",
    flashcards: "#flashcards",
    spx: "#spx",
  },

  // ⚙️ 4. Business Settings | 业务参数
  settings: {
    masteryDivider: 2.5, // Mastery Threshold | 掌握度阈值
    recentLimit: 50, // Recent Items Limit | 最近项目限制
    riskRewardMin: 2.0, // Min Risk/Reward Ratio | 最小风险回报比
    cacheExpiry: 300000, // Cache Duration (5min) | 缓存时长
    autoRefreshDebounceMs: 900, // Auto refresh debounce | 自动刷新防抖（ms）
  },

  // 🌐 5. i18n Labels | 多语言标签
  labels: {
    en: {
      live: "Live",
      demo: "Demo",
      back: "Backtest",
      profit: "Profit",
      loss: "Loss",
      total: "Total",
      count: "Count",
      winRate: "Win Rate",
    },
    zh: {
      live: "实盘",
      demo: "模拟",
      back: "回测",
      profit: "盈利",
      loss: "亏损",
      total: "总计",
      count: "数量",
      winRate: "胜率",
    },
  },
};
