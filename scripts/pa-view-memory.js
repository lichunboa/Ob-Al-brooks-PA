/* 文件名: Scripts/pa-view-memory.js (V3.0 Quantum)
   用途: 记忆库 UI 视图 (升级版)
   功能: 
   1. 🧠 核心数据展示 (Total, Due, Mastery)
   2. 📊 记忆曲线图表 (Load Chart)
   3. 🎲 每日一题/随机摇一摇 (Shake)
   4. ⚡️ 快速复习入口
   5. 🔄 数据强制刷新
*/

const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

// 注入样式
const styleId = "pa-mem-style-v3";
if (!document.getElementById(styleId)) {
  const style = document.createElement("style");
  style.id = styleId;
  style.innerHTML = `
        .mem-container { display: flex; flex-direction: column; gap: 16px; font-family: 'Inter', sans-serif; }
        .mem-card { 
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(51, 65, 85, 0.4) 100%);
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2); transition: transform 0.2s;
        }
        .mem-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
        
        .mem-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .mem-title { font-size: 1.1em; font-weight: 800; color: ${c.text}; display: flex; align-items: center; gap: 8px; }
        .mem-stat-big { font-size: 1.8em; font-weight: 900; line-height: 1; }
        .mem-stat-label { font-size: 0.7em; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; }
        
        .mem-bar-container { display: flex; height: 8px; width: 100%; border-radius: 4px; overflow: hidden; background: rgba(255,255,255,0.05); margin: 12px 0; }
        .mem-bar-seg { height: 100%; transition: width 0.5s ease; }
        
        .mem-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .mem-mini-stat { background: rgba(255,255,255,0.03); border-radius: 8px; padding: 10px; text-align: center; border: 1px solid rgba(255,255,255,0.05); }
        
        .mem-chart-row { display: flex; gap: 12px; height: 140px; }
        .mem-chart-box { flex: 1; display: flex; align-items: flex-end; justify-content: space-between; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 12px; }
        .mem-rec-box { flex: 1.2; display: flex; flex-direction: column; justify-content: center; padding: 16px; position: relative; overflow: hidden; }
        
        .mem-btn { 
            width: 100%; padding: 12px; border-radius: 10px; border: none; cursor: pointer; 
            font-weight: 700; font-size: 0.95em; display: flex; justify-content: center; align-items: center; gap: 8px;
            transition: all 0.2s; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        .mem-btn-primary { background: linear-gradient(90deg, ${c.accent}, #7C3AED); box-shadow: 0 4px 15px ${c.accent}66; }
        .mem-btn-primary:hover { transform: scale(1.02); box-shadow: 0 6px 20px ${c.accent}88; }
        
        .mem-icon-btn { padding: 6px; border-radius: 6px; cursor: pointer; opacity: 0.6; transition: 0.2s; }
        .mem-icon-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
        
        .shake-anim { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
    `;
  document.head.appendChild(style);
}

if (window.paData && window.paData.sr) {
  const sr = window.paData.sr;
  const course = window.paData.course;
  const pTotal = Math.max(sr.total, 1);

  // --- 逻辑处理 ---
  // 1. 随机摇一摇
  const randomCard = () => {
    if (sr.quizPool && sr.quizPool.length > 0) {
      const idx = Math.floor(Math.random() * sr.quizPool.length);
      return sr.quizPool[idx];
    }
    return null;
  };

  // 2. 推荐内容 (优先 Due, 其次 Hybrid, 最后 Random)
  let recItem = null;
  let recType = "Random";

  if (sr.due > 0 && sr.focusFile) {
    recType = "Focus";
    recItem = {
      title: sr.focusFile.name.replace(".md", ""),
      path: sr.focusFile.path,
      desc: `到期: ${sr.focusFile.due} | 易度: ${sr.focusFile.avgEase}`,
    };
  } else if (course.hybridRec) {
    recType = course.hybridRec.type; // New or Review
    recItem = {
      title: course.hybridRec.data.t || course.hybridRec.data.q,
      path: course.hybridRec.data.path,
      desc: recType === "New" ? "新主题" : "闪卡测验",
    };
  } else {
    const rnd = randomCard();
    if (rnd) {
      recType = "Shake";
      recItem = { title: rnd.q, path: rnd.path, desc: "🎲 随机抽取" };
    }
  }

  // --- 渲染构建 ---
  const root = dv.el("div", "", { cls: "mem-container" });

  // Header
  const header = `
        <div class="mem-header">
            <div class="mem-title">
                <span style="font-size:1.4em">🧠</span>
                <div>
            <div>记忆核心</div>
                    <div style="font-size:0.7em; opacity:0.5; font-weight:normal;">v3.0 Quantum</div>
                </div>
            </div>
            <div style="display:flex; gap:8px;">
          <div class="mem-icon-btn" title="强制刷新" onclick="this.innerHTML='⏳'; setTimeout(()=> (window.paRefreshViews ? window.paRefreshViews({hard:true}) : app.commands.executeCommandById('dataview:force-refresh-views')), 200);">🔄</div>
            </div>
        </div>
    `;

  // Stats Row
  const statsRow = `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; padding: 0 8px;">
            <div>
                <div class="mem-stat-label">卡片总数</div>
                <div class="mem-stat-big" style="color:${c.text}">${
    sr.total
  }</div>
            </div>
            <div style="text-align:right;">
                <div class="mem-stat-label">今日到期</div>
                <div class="mem-stat-big" style="color:${
                  sr.due > 0 ? c.loss : c.live
                }; text-shadow:0 0 15px ${sr.due > 0 ? c.loss : c.live}44;">${
    sr.due
  }</div>
            </div>
        </div>
    `;

  // Progress Bar
  const bar = `
        <div class="mem-bar-container">
            <div class="mem-bar-seg" style="width:${
              (sr.cnt.sNorm / pTotal) * 100
            }%; background:${c.demo}"></div>
            <div class="mem-bar-seg" style="width:${
              ((sr.cnt.sRev * 2) / pTotal) * 100
            }%; background:${c.demo}88"></div>
            <div class="mem-bar-seg" style="width:${
              (sr.cnt.mNorm / pTotal) * 100
            }%; background:${c.live}"></div>
            <div class="mem-bar-seg" style="width:${
              ((sr.cnt.mRev * 2) / pTotal) * 100
            }%; background:${c.live}88"></div>
            <div class="mem-bar-seg" style="width:${
              (sr.cnt.cloze / pTotal) * 100
            }%; background:${c.accent}; box-shadow:0 0 10px ${c.accent}"></div>
        </div>
    `;

  // Mini Stats
  const miniStats = `
        <div class="mem-grid-3">
            <div class="mem-mini-stat">
                <div style="color:${
                  c.demo
                }; font-size:0.7em; font-weight:bold;">基础</div>
                <div style="font-weight:800;">${
                  sr.cnt.sNorm + sr.cnt.sRev * 2
                }</div>
            </div>
            <div class="mem-mini-stat">
                <div style="color:${
                  c.live
                }; font-size:0.7em; font-weight:bold;">多选</div>
                <div style="font-weight:800;">${
                  sr.cnt.mNorm + sr.cnt.mRev * 2
                }</div>
            </div>
            <div class="mem-mini-stat">
                <div style="color:${
                  c.accent
                }; font-size:0.7em; font-weight:bold;">填空</div>
                <div style="font-weight:800;">${sr.cnt.cloze}</div>
            </div>
        </div>
    `;

  // Chart & Rec
  // Chart Logic
  const days = [];
  const loadCounts = [];
  for (let i = 1; i <= 7; i++) {
    let d = moment().add(i, "days").format("YYYY-MM-DD");
    days.push(`+${i}`);
    loadCounts.push(sr.load[d] || 0);
  }
  const maxLoad = Math.max(...loadCounts, 3);
  const chartBars = loadCounts
    .map((val, i) => {
      let h = Math.max(4, (val / maxLoad) * 80);
      let bg = val > 0 ? c.accent : "rgba(255,255,255,0.1)";
      return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
            <div style="width:6px; height:${h}%; background:${bg}; border-radius:3px; min-height:4px;"></div>
            <div style="font-size:0.5em; opacity:0.4;">${days[i]}</div>
        </div>`;
    })
    .join("");

  // Rec Logic
  let recColor = recType === "Focus" ? c.loss : c.accent;
  let recContent = recItem
    ? `
        <div style="color:${recColor}; font-size:0.7em; font-weight:bold; letter-spacing:1px; margin-bottom:6px;">${
        recType === "Focus"
          ? "🔥 优先复习"
          : recType === "Shake"
          ? "🎲 随机抽取"
          : "🚀 推荐"
      }</div>
        <div style="font-weight:bold; font-size:0.95em; line-height:1.4; margin-bottom:8px; display:-webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${
          recItem.title
        }</div>
        <div style="font-size:0.8em; opacity:0.6; margin-bottom:12px;">${
          recItem.desc
        }</div>
        <a href="${
          recItem.path
        }" class="internal-link" style="text-decoration:none; background:${recColor}22; color:${recColor}; padding:6px 12px; border-radius:6px; font-size:0.8em; font-weight:bold; display:inline-block;">👉 打开卡片</a>
    `
    : `<div style="opacity:0.5; text-align:center;">今日已清空！</div>`;

  const chartRow = `
        <div class="mem-chart-row">
            <div class="mem-chart-box">
                ${chartBars}
            </div>
            <div class="mem-rec-box mem-card" style="border-color:${recColor}44; background: linear-gradient(135deg, ${recColor}11 0%, rgba(0,0,0,0) 100%);">
                ${recContent}
              <div style="position:absolute; top:10px; right:10px; cursor:pointer; opacity:0.5;" onclick="this.classList.add('shake-anim'); setTimeout(()=>this.classList.remove('shake-anim'), 500); (window.paRefreshViews ? window.paRefreshViews({hard:false}) : app.commands.executeCommandById('dataview:force-refresh-views'));" title="摇一摇换卡片">🎲</div>
            </div>
        </div>
    `;

  // Action Button
  const btn = `
        <button class="mem-btn mem-btn-primary" onclick="app.commands.executeCommandById('obsidian-spaced-repetition:srs-review-flashcards')">
        <span>⚡️ 开始复习</span>
        </button>
    `;

  root.innerHTML = `
        <div class="mem-card">
            ${header}
            ${statsRow}
            ${bar}
            ${miniStats}
        </div>
        ${chartRow}
        ${btn}
    `;
} else {
  dv.el("div", "🦁 Engine Loading...", {
    attr: { style: "opacity:0.5; padding:20px; text-align:center;" },
  });
}
