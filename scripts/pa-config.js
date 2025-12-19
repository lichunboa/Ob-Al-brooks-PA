/* 文件名: Scripts/pa-config.js
   用途: 系统配置中心 (V2.0 - Crystal Theme)
*/

module.exports = {
    // 🎨 1. 核心配色 (Color Palette)
    colors: {
        // 业务状态色 (Business Status)
        live: "#10B981",
        demo: "#3B82F6",
        back: "#F59E0B",
        loss: "#EF4444",
        win:  "#10B981",
        
        // UI 基础色 (UI Foundation)
        text: "#ececec",
        textSub: "rgba(255,255,255,0.5)",
        accent: "#64b5f6",

        // 背景体系 (Background System)
        bg: "#1a1a1a",
        panel: "rgba(35, 35, 35, 0.6)",
        card: "rgba(45, 45, 45, 0.4)",
        hover: "rgba(255, 255, 255, 0.06)",

        // 边框体系 (Borders)
        border: "rgba(255, 255, 255, 0.08)",
        borderLight: "rgba(255, 255, 255, 0.15)",

        // 兼容旧视图字段（别名）
        cardBg: "rgba(45, 45, 45, 0.4)",
        tagBg: "rgba(255,255,255,0.02)",
        tagBorder: "1px solid rgba(255,255,255,0.06)",

        // 额外色彩
        purple: "#7C3AED"
    },

    // 💅 2. 通用样式库 (Reusable Styles)
    styles: {
        glassCard: `
            background: rgba(30, 30, 30, 0.6);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 18px;
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            color: #ececec;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        `,
        pill: `
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.85em;
            font-family: monospace;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.8);
        `,
        flexBetween: `display:flex; justify-content:space-between; align-items:center;`
    },

    // 📂 3. 路径与标签 (Paths & Tags)
    paths: {
        syllabus: "PA_Syllabus_Data.md",
        templates: "Templates",
        attachments: "Attachments"
    },
    tags: {
        trade: "#PA/Trade",
        daily: "#PA/Daily",
        course: "#PA/Course",
        flashcards: "#flashcards"
    },

    // ⚙️ 4. 业务参数 (Settings)
    settings: {
        masteryDivider: 2.5,
        recentLimit: 50,
        riskRewardMin: 2.0
    }
};
/* 文件名: Scripts/pa-config.js
   用途: 系统配置中心 (V2.0 - Crystal Theme)
   更新: 统一了全局的磨砂玻璃质感、配色方案和通用 CSS 样式。
*/

module.exports = {
    // 🎨 1. 核心配色 (Color Palette)
    colors: {
        // 业务状态色 (Business Status)
        live: "#10B981",    // 实盘 - 鲜亮绿
        demo: "#3B82F6",    // 模拟 - 科技蓝
        back: "#F59E0B",    // 回测 - 警示黄
        loss: "#EF4444",    // 亏损 - 柔和红
        win:  "#10B981",    // 盈利 - 绿
        
        // UI 基础色 (UI Foundation)
        text: "#ececec",                // 主文字 (更亮，防透底)
        textSub: "rgba(255,255,255,0.5)", // 次级文字
        accent: "#64b5f6",              // 强调色 (舒适蓝)
        
        // 背景体系 (Background System)
        bg: "#1a1a1a",                  // 纯底色
        panel: "rgba(35, 35, 35, 0.6)", // 面板背景 (半透)
        card: "rgba(45, 45, 45, 0.4)",  // 卡片背景 (更透)
        hover: "rgba(255, 255, 255, 0.06)", // 悬停高亮
        
        // 边框体系 (Borders)
        border: "rgba(255, 255, 255, 0.08)", // 常规边框
        borderLight: "rgba(255, 255, 255, 0.15)" // 高亮边框
    },

    // 💅 2. 通用样式库 (Reusable Styles)
    // 在其他脚本中可以直接引用: `style="${cfg.styles.glassCard}"`
    styles: {
        // 水晶卡片 (Glass Card) - 核心容器样式
        glassCard: `
            background: rgba(30, 30, 30, 0.6);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 18px;
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            color: #ececec;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        `,
        
        // 胶囊标签 (Pill Tag)
        pill: `
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.85em;
            font-family: monospace;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.8);
        `,

        // 弹性布局 (Flex Center)
        flexBetween: `display:flex; justify-content:space-between; align-items:center;`
    },

    // 📂 3. 路径与标签 (Paths & Tags)
    paths: {
        syllabus: "PA_Syllabus_Data.md",
        templates: "Templates",
        attachments: "Attachments"
    },
    tags: {
        trade: "#PA/Trade",
        daily: "#PA/Daily",
        course: "#PA/Course",
        flashcards: "#flashcards"
    },

    // ⚙️ 4. 业务参数 (Settings)
    settings: {
        masteryDivider: 2.5,
        recentLimit: 50,      // 增加统计范围
        riskRewardMin: 2.0
    }
};