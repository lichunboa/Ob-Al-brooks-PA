/* 文件名: Scripts/pa-view-manager.js (V17 - Crystal Edition)
   用途: 交易系统后台管理
*/
var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
let cfg;
try { cfg = require(basePath + "/Scripts/pa-config.js"); } catch(e) { cfg = null; }

if (typeof dv === 'undefined') return;

// manager 可以在没有 paData 时也工作

const container = document.createElement('div');
container.innerHTML = `<div style="padding:12px;">🛠️ 管理后台 (Manager)</div>`;
dv.container.innerHTML = ""; dv.container.appendChild(container);
/* 文件名: Scripts/pa-view-manager.js (V17 - Crystal Edition)
   用途: 交易系统后台管理
   更新内容:
   1. 视觉升级: 弹窗背景改为"磨砂玻璃 (Glassmorphism)"效果，半透明且模糊。
   2. 交互升级: 弹窗增加 resize 属性，支持右下角拖拽改变大小。
   3. 细节打磨: 滚动条美化、字体对比度优化、逻辑稳定性检查。
*/

// ============================================================
// 🛠️ 分组配置 (CONFIG)
// ============================================================

const GROUP_CONFIG = {
    "⭐ 核心要素 (Core)": ["status", "date", "ticker", "profit", "outcome", "strategy"],
    "📊 量化数据 (Data)": ["price", "entry", "exit", "risk", "amount", "r_", "cycle"],
    "🏷️ 归档信息 (Meta)": ["tag", "source", "alias", "type", "class", "time", "week"]
};
// 没匹配到的属性会自动放入 "📂 其他属性"

const ALLOW_DUPLICATES = false; 

// ============================================================
// 🎨 核心代码 (CORE)
// ============================================================

var basePath = app && app.vault && app.vault.adapter ? app.vault.adapter.basePath : "";
let c;

// --- 1. 配色 (适配半透明背景) ---
try {
    const cfg = require(basePath + "/Scripts/pa-config.js");
    c = cfg.colors;
} catch (e) {
    c = {
        text: "#f0f0f0",     // 更亮的白，防透底
        sub: "#a0a0a0",
        accent: "#64b5f6",   // 舒适蓝
        success: "#4caf50",  
        warn: "#ffb74d",     
        danger: "#ef5350",   
        bg_dash: "#252525",
        bg_card: "#2a2a2a",
        border: "rgba(255,255,255,0.08)"
    };
}

// --- 2. 容器与样式 ---
const container = document.createElement("div");
container.className = "pa-v17-root";
container.onmousedown = (e) => { if (e.target === container) e.stopPropagation(); };

const styleId = "pa-mgr-v17";
if (!document.getElementById(styleId)) {
    const s = document.createElement("style");
    s.id = styleId;
    s.innerHTML = `
        .pa-v17-root { font-family: 'Inter', system-ui, sans-serif; color: ${c.text}; display: flex; flex-direction: column; gap: 24px; padding-bottom: 80px; }
        
        /* Dashboard */
        .pa-dash { 
            background: ${c.bg_dash}; border-radius: 16px; padding: 20px 24px; 
            display: flex; justify-content: space-between; align-items: center; 
            box-shadow: 0 8px 24px rgba(0,0,0,0.3); border: 1px solid ${c.border};
        }
        .pa-logo { font-size: 1.5em; font-weight: 800; color: ${c.text}; letter-spacing: -0.5px; }
        .pa-logo span { color: ${c.accent}; }
        
        .pa-search { 
            background: rgba(0,0,0,0.3); border: 1px solid transparent; color: white; 
            padding: 10px 16px; border-radius: 10px; width: 280px; outline: none; 
            transition: all 0.3s; font-size: 0.95em;
        }
        .pa-search:focus { width: 360px; background: rgba(0,0,0,0.5); border-color: ${c.accent}; }

        /* Groups & Grid */
        .pa-group { display: flex; flex-direction: column; gap: 12px; }
        .pa-group-title { 
            font-size: 0.9em; font-weight: 700; color: ${c.sub}; margin-left: 6px; 
            display: flex; align-items: center; gap: 8px; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .pa-group-count { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.8em; }

        .pa-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
        .pa-card { 
            background: ${c.bg_card}; border-radius: 12px; padding: 16px; 
            display: flex; flex-direction: column; gap: 10px; cursor: pointer; 
            transition: all 0.2s ease; border: 1px solid transparent;
        }
        .pa-card:hover { 
            background: #333; transform: translateY(-3px); 
            box-shadow: 0 10px 20px rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.1);
        }
        .pa-card.hidden { display: none !important; }

        .pa-card-head { display: flex; justify-content: space-between; align-items: center; }
        .pa-key { font-family: monospace; font-weight: 700; font-size: 1.05em; color: ${c.text}; }
        .pa-card-foot { margin-top: auto; display: flex; justify-content: space-between; align-items: center; font-size: 0.85em; color: ${c.sub}; }
        .pa-act-hint { opacity: 0; transform: translateX(5px); transition: 0.2s; color: ${c.accent}; font-weight: 600; }
        .pa-card:hover .pa-act-hint { opacity: 1; transform: translateX(0); }

        /* === 💎 核心优化: 磨砂玻璃弹窗 (Glass Inspector) === */
        .pa-mask { 
            position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9000; 
            display: flex; justify-content: center; align-items: center; 
            backdrop-filter: blur(4px); /* 背景模糊 */
        }
        
        .pa-modal { 
            /* Glassmorphism Effect */
            background: rgba(25, 25, 25, 0.85); 
            backdrop-filter: blur(20px); 
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 40px 100px rgba(0,0,0,0.7); 

            border-radius: 18px; 
            display: flex; flex-direction: column; 
            
            /* Resizable Props */
            width: 750px; height: 85vh;
            min-width: 450px; min-height: 400px;
            max-width: 98vw; max-height: 98vh;
            resize: both; /* 允许拖拽 */
            overflow: hidden; /* 防止内容溢出拖拽手柄 */
            
            animation: pa-in 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes pa-in { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }

        /* Scrollbar Polish */
        .pa-body::-webkit-scrollbar { width: 6px; }
        .pa-body::-webkit-scrollbar-track { background: transparent; }
        .pa-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        .pa-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }

        /* Modal Internals */
        .pa-m-head { padding: 20px 28px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .pa-m-title { font-size: 1.3em; font-weight: 800; color: ${c.text}; letter-spacing: -0.5px; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
        
        .pa-tabs { display: flex; padding: 0 28px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.1); }
        .pa-tab { padding: 16px 20px; cursor: pointer; color: ${c.sub}; font-size: 0.95em; font-weight: 500; border-bottom: 3px solid transparent; transition: 0.2s; }
        .pa-tab:hover { color: ${c.text}; }
        .pa-tab.active { color: ${c.accent}; border-bottom-color: ${c.accent}; font-weight: 700; text-shadow: 0 0 10px rgba(100, 181, 246, 0.4); }

        .pa-body { flex: 1; overflow-y: auto; padding: 0; }
        .pa-view { display: none; padding-bottom: 20px; }
        .pa-view.active { display: block; }

        .pa-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 28px; border-bottom: 1px solid rgba(255,255,255,0.03); transition: 0.2s; }
        .pa-row:hover { background: rgba(255,255,255,0.05); }
        
        .pa-pill { background: rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 6px; font-family: monospace; font-size: 0.95em; color: ${c.text}; }
        .pa-acts { display: flex; gap: 8px; opacity: 0; transform: translateX(10px); transition: 0.2s; }
        .pa-row:hover .pa-acts { opacity: 1; transform: translateX(0); }
        
        .pa-ico { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: rgba(255,255,255,0.05); color: ${c.sub}; cursor: pointer; transition: 0.2s; }
        .pa-ico:hover { background: ${c.accent}; color: white; transform: scale(1.05); }
        .pa-ico.del:hover { background: ${c.danger}; }

        .pa-file { padding: 12px 28px; cursor: pointer; color: ${c.sub}; font-size: 0.95em; display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.03); transition: 0.15s; }
        .pa-file:hover { background: rgba(100, 181, 246, 0.15); color: ${c.text}; padding-left: 32px; }

        .pa-foot { padding: 20px 28px; border-top: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.1); display: flex; justify-content: flex-end; gap: 12px; align-items: center; }
        .pa-btn { padding: 9px 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: ${c.sub}; cursor: pointer; font-size: 0.9em; font-weight: 500; display: flex; align-items: center; gap: 8px; transition: 0.2s; }
        .pa-btn:hover { border-color: ${c.text}; color: ${c.text}; background: rgba(255,255,255,0.05); }
        .pa-btn.p { background: ${c.accent}; border-color: ${c.accent}; color: white; }
        .pa-btn.p:hover { filter: brightness(1.1); box-shadow: 0 4px 15px rgba(100, 181, 246, 0.4); }
        .pa-btn.d { color: ${c.danger}; border-color: rgba(239, 83, 80, 0.3); } 
        .pa-btn.d:hover { background: ${c.danger}; color: white; }

        /* Input Modal (Glass) */
        .pa-ibox { 
            background: rgba(30, 30, 30, 0.9); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
            border: 1px solid rgba(255,255,255,0.1); padding: 25px; border-radius: 14px; 
            width: 360px; display: flex; flex-direction: column; gap: 20px; box-shadow: 0 40px 100px rgba(0,0,0,0.8); 
        }
        .pa-ipt { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 12px; border-radius: 8px; outline: none; font-size: 1em; width: 100%; transition: 0.2s; }
        .pa-ipt:focus { border-color: ${c.accent}; background: rgba(0,0,0,0.5); }
    `;
    document.head.appendChild(s);
}

// --- 3. 数据扫描 ---
var dvPages = (typeof dvPages !== 'undefined') ? dvPages : dv.pages('""'); 
let keyMap = {}; let valMap = {};

function normalizeVal(v) {
    let valStr = (v === undefined || v === null) ? "null" : v.toString().trim();
    if (valStr === "") valStr = "Empty";
    return valStr;
}

for (let p of dvPages) {
    let tFile = app.vault.getAbstractFileByPath(p.file.path);
    if (!tFile) continue;
    let cache = app.metadataCache.getFileCache(tFile);
    if (!cache || !cache.frontmatter) continue;
    
    for (let key in cache.frontmatter) {
        if (key === "position") continue;
        if (!keyMap[key]) keyMap[key] = [];
        keyMap[key].push(p.file.path);
        if (!valMap[key]) valMap[key] = {};
        let vals = Array.isArray(cache.frontmatter[key]) ? cache.frontmatter[key] : [cache.frontmatter[key]];
        for (let v of vals) {
            let s = normalizeVal(v);
            if (!valMap[key][s]) valMap[key][s] = [];
            valMap[key][s].push(p.file.path);
        }
    }
}

// --- 4. 分组引擎 ---
const finalGroups = {};
const assignedKeys = new Set();
for (let [groupName, keywords] of Object.entries(GROUP_CONFIG)) {
    finalGroups[groupName] = [];
    Object.keys(keyMap).sort().forEach(key => {
        if (!ALLOW_DUPLICATES && assignedKeys.has(key)) return;
        const isMatch = keywords.some(kw => key.toLowerCase().includes(kw.toLowerCase()));
        if (isMatch) { finalGroups[groupName].push(key); assignedKeys.add(key); }
    });
}
finalGroups["📂 其他属性 (Others)"] = [];
Object.keys(keyMap).sort().forEach(key => { if (!assignedKeys.has(key)) finalGroups["📂 其他属性 (Others)"].push(key); });

// --- 5. 交互核心 ---
async function customPrompt(title, ph = "") {
    return new Promise(r => {
        const mask = document.createElement('div'); mask.className = 'pa-mask';
        mask.onmousedown = e => { if(e.target===mask){mask.remove();r(null)}};
        mask.innerHTML = `<div class="pa-ibox"><div style="font-weight:700;font-size:1.1em">${title}</div><input class="pa-ipt" value="${ph}"><div style="display:flex;justify-content:flex-end;gap:12px"><button class="pa-btn" id="c-c">取消</button><button class="pa-btn p" id="c-o">确定</button></div></div>`;
        document.body.appendChild(mask);
        const ipt = mask.querySelector('input'); ipt.focus(); ipt.select();
        const end = (v) => { mask.remove(); r(v); };
        mask.querySelector('#c-c').onclick = () => end(null);
        mask.querySelector('#c-o').onclick = () => end(ipt.value);
        ipt.onkeydown = e => { if(e.key==='Enter') end(ipt.value); if(e.key==='Escape') end(null); };
    });
}
async function customConfirm(msg, isDanger=false) {
    return new Promise(r => {
        const mask = document.createElement('div'); mask.className = 'pa-mask';
        mask.innerHTML = `<div class="pa-ibox"><div style="font-weight:700;color:${isDanger?c.danger:c.text}">⚠️ 确认操作</div><div style="color:#bbb;font-size:0.95em;line-height:1.5">${msg.replace(/\n/g,'<br>')}</div><div style="display:flex;justify-content:flex-end;gap:12px"><button class="pa-btn" id="c-n">取消</button><button class="pa-btn ${isDanger?'d':'p'}" id="c-y">执行</button></div></div>`;
        document.body.appendChild(mask);
        const end = (v) => { mask.remove(); r(v); };
        mask.querySelector('#c-n').onclick = () => end(false);
        mask.querySelector('#c-y').onclick = () => end(true);
    });
}
async function batchUpdate(paths, op, args) {
    new Notice(`🚀 正在处理 ${paths.length} 个文件...`);
    let count = 0;
    for (let path of paths) {
        let tFile = app.vault.getAbstractFileByPath(path); if (!tFile) continue;
        try { await app.fileManager.processFrontMatter(tFile, (fm) => {
            if (op === "RENAME_KEY") { if (fm[args.oldKey]!==undefined) { fm[args.newKey]=fm[args.oldKey]; delete fm[args.oldKey]; count++; } } 
            else if (op === "DELETE_KEY") { if (fm[args.key]!==undefined) { delete fm[args.key]; count++; } }
            else if (op === "UPDATE_VAL") { 
                let c = fm[args.key];
                if (Array.isArray(c)) { let i = c.findIndex(v => normalizeVal(v)===args.oldVal); if(i!==-1) { c[i]=args.newVal; count++; } } 
                else { fm[args.key]=args.newVal; count++; } 
            } 
            else if (op === "APPEND_VAL") { 
                let c = fm[args.key];
                if (c===undefined) fm[args.key]=args.val; else if (Array.isArray(c)) { if(!c.includes(args.val)) c.push(args.val); } else { if(c!==args.val) fm[args.key]=[c, args.val]; } count++; 
            } 
            else if (op === "DELETE_VAL") {
                let c = fm[args.key];
                if (Array.isArray(c)) { fm[args.key]=c.filter(v=>normalizeVal(v)!==args.val); count++; } else if (normalizeVal(c)===args.val) { delete fm[args.key]; count++; }
            }
            else if (op === "INJECT_PROP") {
                if (fm[args.newKey]===undefined) fm[args.newKey]=args.newVal; else { let c=fm[args.newKey]; if(Array.isArray(c)){if(!c.includes(args.newVal))c.push(args.newVal)}else if(c!==args.newVal)fm[args.newKey]=[c, args.newVal]; } count++;
            }
        }); } catch(e) { console.error(e); }
    }
    if(count>0) { new Notice(`✅ 完成 ${count} 处修改`); setTimeout(()=>app.workspace.trigger("dataview:refresh-views"), 800); } else new Notice("无变化");
}

// --- 6. 弹窗 UI (Crystal Inspector) ---
function openInspector(key, initialTab = 'vals') {
    const vals = valMap[key] || {};
    const sortedVals = Object.entries(vals).sort((a,b) => b[1].length - a[1].length);
    const allPaths = keyMap[key] || [];
    const mask = document.createElement('div'); mask.className = 'pa-mask';
    // 点击背景关闭
    mask.onclick = (e) => { if(e.target === mask) mask.remove(); };

    const modal = document.createElement('div'); modal.className = 'pa-modal';
    modal.innerHTML = `
        <div class="pa-m-head">
            <div class="pa-m-title">${key}</div>
            <button class="pa-btn d" id="btn-del-k">🗑️ 删除属性</button>
        </div>
        <div class="pa-tabs">
            <div class="pa-tab" data-tab="vals">属性值 (${sortedVals.length})</div>
            <div class="pa-tab" data-tab="files">关联文件 (${allPaths.length})</div>
        </div>
        <div class="pa-body">
            <div id="v-vals" class="pa-view"></div>
            <div id="v-files" class="pa-view"></div>
        </div>
        <div class="pa-foot" id="foot-acts"></div>
    `;

    const renderVals = () => {
        const c = modal.querySelector('#v-vals'); c.innerHTML = "";
        if (sortedVals.length === 0) c.innerHTML = `<div style="padding:40px;text-align:center;color:${c.sub};opacity:0.5">无值记录</div>`;
        sortedVals.forEach(([val, paths]) => {
            let row = document.createElement('div'); row.className = 'pa-row';
            row.innerHTML = `
                <div class="pa-val-grp"><span class="pa-pill">${val}</span><span class="pa-count">${paths.length}</span></div>
                <div class="pa-acts">
                    <div class="pa-ico" id="ed" title="修改">✏️</div><div class="pa-ico del" id="rm" title="删除">🗑️</div><div class="pa-ico" id="vw" title="查看文件">👁️</div>
                </div>`;
            row.querySelector('#ed').onclick = async () => { let n=await customPrompt(`修改值`, val); if(n&&n!==val&&await customConfirm(`确认修改?`)) { await batchUpdate(paths, "UPDATE_VAL", {key, oldVal:val, newVal:n}); mask.remove(); } };
            row.querySelector('#rm').onclick = async () => { if(await customConfirm(`确认移除值 "${val}"?`, true)) { await batchUpdate(paths, "DELETE_VAL", {key, val}); mask.remove(); } };
            row.querySelector('#vw').onclick = () => switchToFiles(paths, `Val: ${val}`);
            c.appendChild(row);
        });
    };

    const renderFiles = (paths, filterLabel) => {
        const c = modal.querySelector('#v-files'); c.innerHTML = "";
        if (filterLabel) {
            c.innerHTML = `<div style="padding:15px 28px;color:${c.accent};font-weight:600;display:flex;justify-content:space-between"><span>🔍 筛选: ${filterLabel}</span><span style="cursor:pointer;opacity:0.6" id="rst">✕ 重置</span></div>`;
            setTimeout(() => c.querySelector('#rst').onclick = () => { renderFiles(allPaths, null); updateFooter('files'); }, 0);
        }
        paths.slice(0, 200).forEach(p => {
            let r = document.createElement('div'); r.className = 'pa-file';
            r.innerHTML = `<span>${p.split('/').pop()}</span><span style="opacity:0.3;font-size:0.85em">${p}</span>`;
            r.onclick = () => app.workspace.openLinkText(p, "", true);
            c.appendChild(r);
        });
        updateFooter('files', paths);
    };

    const updateFooter = (tab, currentPaths = allPaths) => {
        const foot = modal.querySelector('#foot-acts'); foot.innerHTML = "";
        if (tab === 'vals') {
            const b1 = document.createElement('button'); b1.className='pa-btn'; b1.innerText='✏️ 重命名';
            b1.onclick=async()=>{let n=await customPrompt(`重命名 ${key}`, key); if(n&&n!==key&&await customConfirm(`确认?`)){await batchUpdate(allPaths, "RENAME_KEY", {oldKey:key, newKey:n}); mask.remove();}};
            const b2 = document.createElement('button'); b2.className='pa-btn p'; b2.innerText='➕ 追加新值';
            b2.onclick=async()=>{let v=await customPrompt(`追加新值`); if(v&&await customConfirm(`确认?`)){await batchUpdate(allPaths, "APPEND_VAL", {key, val:v}); mask.remove();}};
            foot.append(b1, b2);
        } else {
            const b3 = document.createElement('button'); b3.className='pa-btn p'; b3.innerText='💉 注入属性';
            b3.onclick=async()=>{let k=await customPrompt("属性名"); if(!k)return; let v=await customPrompt(`${k} 的值`); if(!v)return; if(await customConfirm(`确认注入?`)){await batchUpdate(currentPaths, "INJECT_PROP", {newKey:k, newVal:v}); mask.remove();}};
            foot.append(b3);
        }
    };

    const switchToFiles = (paths, label) => {
        modal.querySelectorAll('.pa-tab').forEach(t=>t.classList.remove('active')); modal.querySelector('[data-tab="files"]').classList.add('active');
        modal.querySelectorAll('.pa-view').forEach(v=>v.classList.remove('active')); modal.querySelector('#v-files').classList.add('active');
        renderFiles(paths, label);
    };

    renderVals(); renderFiles(allPaths, null); updateFooter(initialTab);
    const tabs = modal.querySelectorAll('.pa-tab');
    tabs.forEach(t => t.onclick = () => {
        tabs.forEach(x => x.classList.remove('active')); t.classList.add('active');
        modal.querySelectorAll('.pa-view').forEach(v => v.classList.remove('active'));
        modal.querySelector(t.dataset.tab === 'vals'?'#v-vals':'#v-files').classList.add('active');
        updateFooter(t.dataset.tab);
    });
    modal.querySelector('#btn-del-k').onclick=async()=>{if(await customConfirm(`⚠️ 确认删除属性 [${key}]?`,true)){await batchUpdate(allPaths,"DELETE_KEY",{key});mask.remove();}};
    if(initialTab==='files') tabs[1].click(); else tabs[0].click();
    mask.appendChild(modal); document.body.appendChild(mask);
}

// --- 7. 构建主界面 (Main UI) ---
const dash = document.createElement('div'); dash.className = 'pa-dash';
dash.innerHTML = `<div class="pa-logo">God Mode <span>Crystal</span></div>`;
const search = document.createElement('input'); search.className = 'pa-search'; search.placeholder = '🔍 Search...';
search.onmousedown = e => e.stopPropagation();
search.oninput = (e) => {
    const term = e.target.value.toLowerCase();
    container.querySelectorAll('.pa-card').forEach(c => {
        const match = c.dataset.key.toLowerCase().includes(term) || (valMap[c.dataset.key] && Object.keys(valMap[c.dataset.key]).some(v=>v.toLowerCase().includes(term)));
        c.classList.toggle('hidden', !match);
    });
};
dash.appendChild(search); container.appendChild(dash);

for (let [gName, keys] of Object.entries(finalGroups)) {
    if (keys.length === 0) continue;
    let grp = document.createElement('div'); grp.className = 'pa-group';
    grp.innerHTML = `<div class="pa-group-title"><span>${gName}</span><span class="pa-group-count">${keys.length}</span></div>`;
    let grid = document.createElement('div'); grid.className = 'pa-grid';
    keys.forEach(key => {
        let card = document.createElement('div'); card.className = 'pa-card'; card.dataset.key = key;
        card.innerHTML = `<div class="pa-card-head"><span class="pa-key">${key}</span></div><div class="pa-card-foot"><span class="pa-badge">${Object.keys(valMap[key]).length} 种值</span><span class="pa-act-hint">Manage →</span></div>`;
        card.onclick = () => openInspector(key); grid.appendChild(card);
    });
    grp.appendChild(grid); container.appendChild(grp);
}

dv.container.innerHTML = ""; dv.container.appendChild(container);