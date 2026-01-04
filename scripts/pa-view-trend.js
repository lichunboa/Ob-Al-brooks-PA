/* 文件名: Scripts/pa-view-trend.js
   用途: 综合趋势与心态 (Multi-Trend & Mind)
   修复: 还原 R 值图表的颜色逻辑 (Live=Green, Demo=Blue, Back=Orange)
*/
const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

if (window.paData) {
  // 取最近 30 笔交易，倒序排列（最新的在最右边/最后）
  const trades = window.paData.trades.slice(0, 30);

  const typeLabel = (type) => {
    if (type === "Live") return "实盘";
    if (type === "Demo") return "模拟";
    if (type === "Backtest") return "回测";
    return type || "未知";
  };

  // 1. R值柱状图
  let bars = "";
  if (trades.length > 0) {
    // 找出最大值用于归一化高度
    let maxVal = Math.max(...trades.map((t) => Math.abs(t.r || 0))) || 1;

    bars = `<div style="display:flex; align-items:flex-end; gap:4px; height:60px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">`;

    for (let t of trades) {
      let r = t.r || 0;
      let h = Math.round((Math.abs(r) / maxVal) * 50);
      if (h < 4) h = 4;

      // 颜色逻辑：盈利使用账户色，亏损使用红色
      let color = c.loss; // 默认亏损红
      if (r >= 0) {
        if (t.type === "Live") color = c.live;
        else if (t.type === "Demo") color = c.demo;
        else color = c.back;
      }

      let title = `${t.name}\n${typeLabel(t.type)}\nR: ${r.toFixed(2)}`;
      bars += `<div style="width:6px; height:${h}px; background:${color}; border-radius:2px; opacity:${
        r >= 0 ? 1 : 0.7
      };" title="${title}"></div>`;
    }
    bars += `</div>`;
  } else {
    bars = `<div style="opacity:0.5; font-size:0.8em;">暂无交易数据</div>`;
  }

  // 2. 心态监控 (只看最近 7 笔 Live 交易)
  const recentLive = trades.filter((t) => t.type === "Live").slice(0, 7);
  let tilt = 0,
    fomo = 0;

  for (let t of recentLive) {
    let err = (t.error || "").toString();
    if (err.includes("Tilt") || err.includes("上头")) tilt++;
    if (err.includes("FOMO") || err.includes("追单")) fomo++;
  }

  let mindStatus =
    tilt + fomo === 0
      ? "🛡️ 状态极佳"
      : tilt + fomo < 3
      ? "⚠️ 有点起伏"
      : "🔥 极度危险";
  let mindColor =
    tilt + fomo === 0 ? c.live : tilt + fomo < 3 ? c.back : c.loss;

  const root = dv.el("div", "", {
    attr: { style: c.cardBg + " display:flex; gap:20px;" },
  });
  root.innerHTML = `
    <div style="flex:2;">
      <div style="font-weight:700; opacity:0.7; margin-bottom:10px;">📈 综合趋势 <span style="font-weight:600; opacity:0.5; font-size:0.85em;">(R-Multiples)</span></div>
        <div style="display:flex; gap:10px; font-size:0.6em; margin-bottom:4px; opacity:0.6;">
            <span style="color:${c.live}">● 实盘</span>
            <span style="color:${c.demo}">● 模拟</span>
            <span style="color:${c.back}">● 回测</span>
        </div>
        ${bars}
    </div>
    <div style="flex:1; border-left:1px solid rgba(255,255,255,0.1); padding-left:20px; display:flex; flex-direction:column; justify-content:center;">
        <div style="font-weight:700; opacity:0.7; margin-bottom:5px;">🧠 实盘心态</div>
        <div style="font-size:1.4em; font-weight:800; color:${mindColor};">${mindStatus}</div>
        <div style="font-size:0.7em; opacity:0.6; margin-top:4px;">
            近期错误:<br>
            冲动 (FOMO): ${fomo} | 上头 (Tilt): ${tilt}
        </div>
    </div>`;
}
