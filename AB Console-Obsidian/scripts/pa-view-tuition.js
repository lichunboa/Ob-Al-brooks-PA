const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");
const c = cfg.colors;

if (window.paData) {
  const stats = window.paData.stats; // 直接用 Engine 算好的数据
  const root = dv.el("div", "", { attr: { style: c.cardBg } });
  root.innerHTML = `<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">💸 错误的代价 (学费统计)</div>`;

  if (stats.tuition === 0) {
    root.innerHTML += `<div style="color:${c.live}; font-weight:bold;">🎉 完美！近期实盘没有因纪律问题亏损。</div>`;
  } else {
    let sortedErrors = Object.entries(stats.errors).sort((a, b) => b[1] - a[1]);
    root.innerHTML += `
        <div style="font-size:0.9em; margin-bottom:10px; opacity:0.8;">因执行错误共计亏损: <span style="color:${
          c.loss
        }; font-weight:800; font-size:1.2em;">$${stats.tuition}</span></div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            ${sortedErrors
              .map(([name, cost]) => {
                let percent = Math.round((cost / stats.tuition) * 100);
                return `<div style="display:flex; align-items:center; font-size:0.85em;">
                    <div style="width:80px; opacity:0.9;">${name}</div>
                    <div style="flex:1; background:rgba(255,255,255,0.1); height:6px; border-radius:3px; overflow:hidden; margin:0 10px;"><div style="width:${percent}%; height:100%; background:${c.loss};"></div></div>
                    <div style="width:60px; text-align:right; font-weight:bold; color:${c.loss};">-$${cost}</div>
                </div>`;
              })
              .join("")}
        </div>`;
  }
}
