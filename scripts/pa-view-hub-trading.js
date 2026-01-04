/* 文件名: Scripts/pa-view-hub-trading.js
   用途: 交易中心 (Trading Hub) - 整合今日看板、快速行动、实时趋势
   版本: v5.0 (Consolidated)
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

if (window.paData) {
  const trades = window.paData.trades;
  const today = moment().format("YYYY-MM-DD");

  // --- 1. 布局容器 (Grid) ---
  // 左侧 (2/3): 今日看板
  // 右侧 (1/3): 快速行动 + 趋势指标
  const isNarrow = (window?.innerWidth || 1200) < 980;
  const root = dv.el("div", "", {
    attr: {
      style: `display: grid; grid-template-columns: ${
        isNarrow ? "1fr" : "2fr 1fr"
      }; gap: 20px; width: 100%; max-width: 1200px; margin: 0 auto; align-items: start;`,
    },
  });

  // --- 左侧: 今日看板 (Today Dashboard) ---
  const leftCol = document.createElement("div");
  leftCol.style.cssText = `${c.cardBg}; padding: 20px; display: flex; flex-direction: column; gap: 15px;`;

  // 1.1 头部状态
  // 单一信源：直接使用 pa-core 输出的 tradesAsc
  const todayTrades = (window.paData.tradesAsc || [])
    .filter((t) => t && t.date === today)
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

  const todayPnL = todayTrades.reduce(
    (acc, t) => acc + (Number(t.pnl) || 0),
    0
  );
  const todayCount = todayTrades.length;

  leftCol.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:15px;">
        <div>
            <div style="font-size:1.2em; font-weight:bold; opacity:0.9;">📅 今日交易 (${today})</div>
            <div style="font-size:0.8em; opacity:0.6;">专注执行质量（Execution Quality）</div>
        </div>
        <div style="text-align:right;">
            <div style="font-size:1.8em; font-weight:900; color:${
              todayPnL >= 0 ? c.live : c.loss
            };">${todayPnL > 0 ? "+" : ""}${todayPnL}</div>
            <div style="font-size:0.8em; opacity:0.6;">今日 ${todayCount} 笔</div>
        </div>
    </div>`;

  // 1.2 市场环境 (Context)
  const todayJournal = window.paData?.daily?.todayJournal;
  const coachFocus =
    window.paData?.coach?.combined?.focus ||
    window.paData?.coach?.today?.focus ||
    window.paData?.coach?.week?.focus ||
    window.paData?.coach?.last30?.focus;

  const recs = Array.isArray(window.paData?.recommendations?.ranked)
    ? window.paData.recommendations.ranked
    : [];
  const pickRec = (source) => recs.find((r) => r && r.source === source);
  const renderActionLink = (action) => {
    const p = action?.path;
    const label = (action?.label || "打开").toString();
    if (!p) return "";
    const safeHref = encodeURI(p);
    return `<a href="${safeHref}" data-href="${p}" class="internal-link" style="text-decoration:none; font-weight:700; cursor:pointer;">${label}</a>`;
  };
  const formatCoachLine = (f) => {
    if (!f) return "";
    const label = (f.label || f.key || "").toString();
    const completed = Number(f?.stats?.completed) || 0;
    const winRate = Number(f?.stats?.winRate) || 0;
    const exp = Number(f?.stats?.expectancyR);
    const expStr = Number.isFinite(exp) ? exp.toFixed(2) : "0.00";
    const dim = (f.dimLabel || f.kind || "").toString();
    const streak = Number(f?.weekStreak) || 0;
    const streakStr = streak >= 2 ? `，连续${streak}周` : "";
    return `🧭 复盘焦点：${dim} → ${
      label || "Unknown"
    }（样本${completed}，期望R ${expStr}，胜率 ${winRate}%${streakStr}）`;
  };

  if (todayJournal && todayJournal.market_cycle) {
    const coachLine = formatCoachLine(coachFocus);
    const rTrade = pickRec("trade");
    const rCourse = pickRec("course");
    const rSr = pickRec("sr");
    leftCol.innerHTML += `
      <div style="padding: 12px; background: ${
        c.hover
      }; border-left: 4px solid ${c.accent}; border-radius: 10px;">
        <div style="font-weight:bold; color:${
          c.accent
        }; margin-bottom:4px;">🌊 市场环境：${todayJournal.market_cycle}</div>
            <div style="font-size:0.85em; opacity:0.85; line-height:1.55;">
              <div>${
                coachLine || "策略建议: 顺势而为，寻找回调入场机会。"
              }</div>
              ${
                rCourse
                  ? `<div style="margin-top:6px; opacity:0.9;">📚 ${
                      rCourse.title
                    } · ${renderActionLink(rCourse.action)}</div>`
                  : ""
              }
              ${
                rSr
                  ? `<div style="margin-top:4px; opacity:0.9;">🧠 ${
                      rSr.title
                    } · ${renderActionLink(rSr.action)}</div>`
                  : ""
              }
              ${
                rTrade && rTrade.action
                  ? `<div style="margin-top:4px; opacity:0.85;">📉 ${renderActionLink(
                      rTrade.action
                    )}</div>`
                  : ""
              }
            </div>
        </div>`;
  } else {
    const coachLine = formatCoachLine(coachFocus);
    const rCourse = pickRec("course");
    const rSr = pickRec("sr");
    leftCol.innerHTML += `
        <div style="padding: 12px; border: 1px dashed rgba(255,255,255,0.2); border-radius: 6px; text-align: center; font-size: 0.9em; opacity: 0.6;">
            <a href="obsidian://new?file=Daily/${today}_Journal&content=Templates/每日复盘模版 (Daily Journal).md">📝 创建今日日记</a> 以激活策略推荐
            ${
              coachLine
                ? `<div style="margin-top:8px; font-size:0.85em; opacity:0.85;">${coachLine}</div>`
                : ""
            }
            ${
              rCourse
                ? `<div style="margin-top:10px; font-size:0.85em; opacity:0.9;">📚 ${
                    rCourse.title
                  } · ${renderActionLink(rCourse.action)}</div>`
                : ""
            }
            ${
              rSr
                ? `<div style="margin-top:6px; font-size:0.85em; opacity:0.9;">🧠 ${
                    rSr.title
                  } · ${renderActionLink(rSr.action)}</div>`
                : ""
            }
        </div>`;
  }

  // 1.3 活跃交易 (Active Trade)
  const activeTrade = todayTrades.find(
    (t) => !(t.outcome || "").toString().trim()
  );
  if (activeTrade) {
    leftCol.innerHTML += `
        <div style="flex:1; background:rgba(255,255,255,0.03); border-radius:8px; padding:15px; border:1px solid ${
          c.accent
        };">
            <div style="color:${
              c.accent
            }; font-weight:bold; margin-bottom:10px;">⚡️ 进行中: ${
      activeTrade.link
    }</div>
            <div style="font-size:0.9em; opacity:0.8;">
                <div>方向: ${activeTrade.dir || "-"}</div>
                <div>形态: ${
                  Array.isArray(activeTrade.patterns) &&
                  activeTrade.patterns.length > 0
                    ? activeTrade.patterns
                        .map((x) => x.toString().trim())
                        .filter(Boolean)
                        .join(", ")
                    : activeTrade.patterns || "-"
                }</div>
            </div>
        </div>`;
  } else {
    leftCol.innerHTML += `
        <div style="flex:1; display:flex; align-items:center; justify-content:center; opacity:0.3; font-size:0.9em;">
            等待交易机会...
        </div>`;
  }

  root.appendChild(leftCol);

  // --- 右侧: 快速行动 & 趋势 (Right Column) ---
  const rightCol = document.createElement("div");
  rightCol.style.cssText = "display:flex; flex-direction:column; gap:20px;";

  // 2.1 快速行动 (Quick Actions)
  const actionsPanel = document.createElement("div");
  actionsPanel.style.cssText = `${c.cardBg}; padding: 15px;`;
  const btn = (color, text, cmd) =>
    `<button type="button" onclick="app.commands.executeCommandById('${cmd}')" style="width:100%; background:${color}; color:white; border:none; padding:12px; border-radius:10px; cursor:pointer; font-weight:800; margin-bottom:8px; text-align:left; display:flex; justify-content:space-between; align-items:center; transition: transform 180ms ease, filter 180ms ease, box-shadow 180ms ease; outline:none;" onmouseover="this.style.transform='translateY(-1px)'; this.style.filter='brightness(1.04)';" onmouseout="this.style.transform='translateY(0)'; this.style.filter='none';" onfocus="this.style.boxShadow='0 0 0 2px var(--interactive-accent)';" onblur="this.style.boxShadow='none';">
            <span>${text}</span> <span>+</span>
        </button>`;

  actionsPanel.innerHTML = `
        <div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🚀 快速开仓</div>
        ${btn(c.live, "🟢 实盘交易", "quickadd:choice:New Live Trade")}
        ${btn(c.demo, "🔵 模拟交易", "quickadd:choice:New Demo Trade")}
        ${btn(c.back, "🟡 回测记录", "quickadd:choice:New Backtest")}
    `;
  rightCol.appendChild(actionsPanel);

  // 2.2 实时趋势 (Trend / R-Multiples)
  const trendPanel = document.createElement("div");
  trendPanel.style.cssText = `${c.cardBg}; padding: 15px; flex:1;`;

  // 简化版 R 值图
  const recentTrades = trades.slice(0, 10); // 最近 10 笔
  let bars = `<div style="display:flex; align-items:flex-end; gap:4px; height:60px; margin-top:10px;">`;
  if (recentTrades.length > 0) {
    let maxVal = Math.max(...recentTrades.map((t) => Math.abs(t.r || 0))) || 1;
    for (let t of recentTrades) {
      let r = t.r || 0;
      let h = Math.round((Math.abs(r) / maxVal) * 50);
      if (h < 4) h = 4;
      let color = r >= 0 ? (t.type === "Live" ? c.live : c.demo) : c.loss;
      bars += `<div style="flex:1; height:${h}px; background:${color}; border-radius:2px; opacity:${
        r >= 0 ? 1 : 0.7
      };" title="R: ${r}"></div>`;
    }
  } else {
    bars += `<div style="width:100%; text-align:center; opacity:0.5; font-size:0.8em; align-self:center;">暂无数据</div>`;
  }
  bars += `</div>`;

  trendPanel.innerHTML = `
      <div style="font-weight:700; opacity:0.7; margin-bottom:5px;">📈 近期趋势（最近 10 笔）</div>
        ${bars}
    `;
  rightCol.appendChild(trendPanel);

  root.appendChild(rightCol);
}
