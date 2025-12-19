/* 文件名: Scripts/pa-config.js
   用途: 系统配置中心 (V2.0 - Crystal Theme)
   更新: 补全了 styles 对象，修复 "glassCard" 报错
*/

module.exports = {
    // 🎨 1. 核心配色 (Color Palette)
    colors: {
        live: "#10B981",    // 实盘 - 绿
        demo: "#3B82F6",    // 模拟 - 蓝
        back: "#F59E0B",    // 回测 - 黄
        loss: "#EF4444",    // 亏损 - 红
        text: "#ececec",                
        textSub: "rgba(255,255,255,0.5)", 
        accent: "#64b5f6",              
        
        // 兼容旧代码的字段 (防止其他脚本报错)
        cardBg: "background:rgba(30,30,30,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:18px; margin-bottom:20px;",
        tagBg: "rgba(255,255,255,0.05)",
        tagBorder: "1px solid rgba(255,255,255,0.1)",
        purple: "#8B5CF6",
        
        // 新版背景体系
        bg: "#1a1a1a",
        panel: "rgba(35, 35, 35, 0.6)",
        hover: "rgba(255, 255, 255, 0.06)",
        border: "rgba(255, 255, 255, 0.08)"
    },

    // 💅 2. 通用样式库 (报错就是因为缺了这个!)
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
        `
    },

    // 📂 3. 路径与标签
    paths: {
        syllabus: "PA_Syllabus_Data.md",
        templates: "Templates"
    },
    tags: {
        trade: "#PA/Trade",
        daily: "#PA/Daily",
        course: "#PA/Course",
        flashcards: "#flashcards"
    },

    // ⚙️ 4. 业务参数
    settings: {
        masteryDivider: 2.5,
        recentLimit: 50,
        riskRewardMin: 2.0
    }
};