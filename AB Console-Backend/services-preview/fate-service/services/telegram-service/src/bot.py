"""八字排盘 Telegram Bot"""
import os
import sys
import re
import asyncio
import time
import logging
import random
from logging.handlers import RotatingFileHandler
from pathlib import Path
from datetime import datetime
import json
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand, InputMediaDocument
from telegram.constants import ParseMode
from telegram.error import RetryAfter, NetworkError, TimedOut
from telegram.ext import (Application, CommandHandler, CallbackQueryHandler,
                          MessageHandler, filters, ContextTypes, ConversationHandler)
from dotenv import load_dotenv
from utils.timezone import now_cn, fmt_cn
from _paths import (
    get_env_file, BAZI_DB_DIR, LOGS_DIR, TXT_DIR, QUEUE_DIR, PROMPTS_DIR, 
    ensure_dirs, startup_check
)

# 启动检查（目录、依赖、配置）
startup_check()

# 统一从 tradecat/config/.env 加载配置
load_dotenv(get_env_file())
ADMIN_CHAT_ID = (os.getenv("FATE_ADMIN_USER_IDS") or "").split(",")[0] or None
sys.path.insert(0, str(BAZI_DB_DIR))

from bazi_calculator import BaziCalculator
from report_generator import generate_full_report
from report_generator import DEFAULT_HIDE as REPORT_HIDE
from location import get as get_location, get_coords
import db_v2 as db
from rate_limiter import check_rate_limit, record_request, acquire_slot, release_slot, get_queue_status

# 自动初始化数据库
db.ensure_db()

INPUT, CONFIRM = range(2)

# 进度展示配置
PROGRESS_ITEMS = [
    "基础四柱",
    "五行能量 + 五行分数",
    "建除十二神",
    "神煞系统（全量）",
    "干支合克与入库",
    "地支关系扩展",
    "格局用神",
    "大运流年",
    "流月小运",
    "节气司令",
    "黄历与真太阳时",
    "紫微斗数",
    "风水罗盘",
    "天文占星",
    "温湿度与拱神",
    "易经系统",
    "六爻/梅花/奇门/大六壬",
    "高级历法与附录",
]
PROGRESS_TIPS = [
    "五行平衡往往胜过单一旺相。",
    "神煞只是参考，核心看格局与大运。",
    "真太阳时会影响子时划分，不能省略。",
    "大运看趋势，流月小运看细节。",
    "用神取法先看日主，再看季节寒暖燥湿。",
    "格局不怕破，怕无根；有根则有解。",
    "紫微解读重宫位组合，别孤立看单星。",
    "风水九星随年变，山向门向都要看。",
    "占星宫位系统不同，解读要保持一致。",
    "易经问卦，贵在时机与诚意匹配。",
    "大六壬重四课三传，奇门重时空格局。",
]


# ==================== 日志配置 ====================
def _setup_logger():
    ensure_dirs()  # 确保目录存在
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("fate.bot")
    logger.setLevel(logging.INFO)
    if logger.handlers:
        return logger
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s - %(message)s")
    fh = RotatingFileHandler(LOGS_DIR / "bot.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(sh)
    logger.propagate = False
    return logger


logger = _setup_logger()
QUEUE_PATH = (QUEUE_DIR / "send_queue.jsonl").resolve()


def main_kb(gender="male"):
    """主菜单键盘 - 性别切换"""
    m = "✅" if gender == "male" else ""
    f = "✅" if gender == "female" else ""
    return InlineKeyboardMarkup([[
        InlineKeyboardButton(f"{m} 乾造（男）", callback_data="g_male"),
        InlineKeyboardButton(f"{f} 坤造（女）", callback_data="g_female")
    ]])

def confirm_kb():
    """确认键盘"""
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("🚀 开始排盘", callback_data="calc"),
        InlineKeyboardButton("✏️ 返回修改", callback_data="edit")
    ]])

def result_kb():
    return InlineKeyboardMarkup([[InlineKeyboardButton("🎲 重新排盘", callback_data="restart")]])


async def _send_result(chat_id, context, out_path, filename, ai_path, ai_filename, d):
    """统一的结果发送（文本+附件），便于复用"""
    now_str = fmt_cn(now_cn())
    name_display = d.get('name') or '命主'
    gender_display = '乾造' if d.get('gender','male')=='male' else '坤造'
    header = f"""🎲 {name_display} {gender_display}
报告见附件（AI分析版）
```
{ai_filename}
```
免费AI分析网站（复制 AI 分析版全文到网站对话框中）
神算gem版本（效果最好）：https://gemini.google.com/gem/1Vcz5d99hw73vgxUlDzB80AnvJdfbCiGT?usp=sharing
https://aistudio.google.com/
https://gemini.google.com/
https://business.gemini.google/
https://claude.ai/
https://chatgpt.com/
https://x.com/i/grok

⏱️ 北京时间：{now_str}"""

    await _send_with_retry(
        lambda: context.bot.send_message(
            chat_id=chat_id,
            text=header,
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=result_kb(),
        ),
        on_retry=_make_retry_notifier(context, chat_id),
    )
    await _send_media_group_with_retry(
        context=context,
        chat_id=chat_id,
        paths=[(ai_path, ai_filename)],
        on_retry=_make_retry_notifier(context, chat_id),
    )


def build_main_msg(gender="male"):
    g = "乾造（男）" if gender == "male" else "坤造（女）"
    now_str = fmt_cn(now_cn())
    return f"""🎲 *超级排盘*

当前: {g}
（点击下方按钮切换性别）

请输入信息：
日期/时间（公历）/地点/姓名
已自动做真太阳时转换，可直接填北京时间
仅接受公历日期，按四行逐行输入

点击复制模板：
```
2013-01-01
09:19
北京市东城区
孙笑川
```
⏱️ 北京时间：{now_str}"""


def build_confirm_msg(d):
    return (
        "📋 *确认信息*\n"
        "```\n"
        f"📅 日期：{d['birth_date']}\n"
        f"⏰ 时间：{d['birth_time']}\n"
        f"📍 地点：{d.get('birth_place', '北京')}\n"
        f"👤 姓名：{d.get('name') or '匿名'}\n"
        "```\n"
        "确认无误请点击开始排盘 ⏬"
    )


def parse_input(text: str):
    """强格式 4 行输入（日期 / 时间 / 地点 / 姓名），带宽松容错；返回 (date, time, place, name, err_msg)"""
    text = text.strip()

    def to_halfwidth(s: str) -> str:
        res = []
        for ch in s:
            code = ord(ch)
            if 0xFF01 <= code <= 0xFF5E:  # 全角 ASCII
                res.append(chr(code - 0xFEE0))
            elif ch == "　":  # 全角空格
                res.append(" ")
            else:
                res.append(ch)
        return "".join(res)

    def _strip_label(s: str) -> str:
        s = to_halfwidth(s).strip()
        return re.sub(r'^[^0-9\-\.\/]+[:：]\s*', '', s)  # 只剥掉非数字开头的标签

    def parse_date(raw: str):
        raw = to_halfwidth(raw)
        raw = re.sub(r'[年月\.\/]', '-', raw)
        raw = re.sub(r'\s+', '', raw)
        m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})$', raw)
        if not m:
            m = re.match(r'^(\d{4})(\d{1,2})(\d{1,2})$', raw)
        if not m:
            return None, "日期格式无效，请用 YYYY-MM-DD"
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            datetime(y, mo, d)
        except Exception:
            return None, "日期不存在，请检查年月日"
        return f"{y:04d}-{mo:02d}-{d:02d}", None

    def parse_time(raw: str):
        raw = to_halfwidth(raw).strip()
        # 处理时段词
        offset = 0
        if any(k in raw for k in ["下午", "晚上", "傍晚", "晚间"]):
            offset = 12
        elif "中午" in raw:
            offset = 12
        elif "凌晨" in raw:
            offset = 0
        raw = re.sub(r'[时分秒]', ':', raw)
        raw = raw.replace("：", ":")
        # 提取数字
        m = re.search(r'(\d{1,2}):(\d{1,2})', raw)
        if not m:
            m = re.search(r'(\d{1,2})点(?:(\d{1,2}))?', raw)
        if not m:
            m = re.match(r'^(\d{1,2})(\d{2})$', raw)
        if not m:
            return None, "时间格式无效，请用 HH:MM"
        h = int(m.group(1))
        mi = int(m.group(2)) if m.lastindex and m.group(2) else 0
        if h > 23 or mi > 59:
            return None, "时间超出范围"
        if offset and h < 12:
            h += offset
        if h >= 24:
            h -= 24
        return f"{h:02d}:{mi:02d}", None

    def parse_place(raw: str):
        raw = to_halfwidth(raw).strip().strip(" ,.;，。；")
        if not raw:
            return None, "地点为空"
        if len(raw) < 2 or len(raw) > 64:
            return None, "地点长度异常"
        return raw, None

    def parse_name(raw: str):
        raw = to_halfwidth(raw).strip().strip(" ,.;，。；")
        if not raw:
            return None, "姓名为空"
        if len(raw) > 64:
            return None, "姓名过长"
        return raw, None

    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if len(lines) < 4:
        return None, None, None, None, "格式错误：必须四行（日期/时间/地点/姓名）"

    d_raw = _strip_label(lines[0])
    t_raw = _strip_label(lines[1])
    p_raw = _strip_label(lines[2])
    n_raw = _strip_label(lines[3])

    date_str, err = parse_date(d_raw)
    if err:
        return None, None, None, None, err
    time_str, err = parse_time(t_raw)
    if err:
        return None, None, None, None, err
    place, err = parse_place(p_raw)
    if err:
        return None, None, None, None, err
    name, err = parse_name(n_raw)
    if err:
        return None, None, None, None, err

    return date_str, time_str, place, name, None


def format_result(d, r, birth_dt):
    fp, tg, tw = r["fourPillars"], r["tenGods"], r.get("twelveGrowth", {})
    fe, dm, sp = r["fiveElements"], r["dayMaster"], r.get("specialPalaces", {})
    mf, vi, spirits = r["majorFortune"], r.get("voidInfo", {}), r.get("spirits", {})
    siling, geju = r.get("siling", {}), r.get("geju", {})
    bi = r.get("birthInfo", {})
    jy = r.get("jiaoYun", {})

    def wx_count(key_en, key_cn):
        """兼容英文/中文键的五行计数"""
        v = fe.get(key_en, fe.get(key_cn, {}))
        if isinstance(v, dict):
            return v.get("count", v.get("percentage", 0))
        return v if v not in (None, "") else 0
    
    text = f"""🔮 *{d.get('name') or '匿名'}* {'乾造' if d['gender']=='male' else '坤造'}

📅 {d['birth_date']} {d['birth_time']}（{d.get('birth_place','北京')}）
农历: {bi.get('lunar', '')}
真太阳时: {bi.get('trueSolarTime', '')}
生肖: {bi.get('zodiac', '')} | 星座: {bi.get('constellation', '')} | 星宿: {bi.get('xingXiu', '')}

🀄 *四柱*
```
     年柱   月柱   日柱   时柱
干支  {fp['year']['fullName']}   {fp['month']['fullName']}   {fp['day']['fullName']}   {fp['hour']['fullName']}
十神  {tg['year']['stem']:4} {tg['month']['stem']:4} 日主   {tg['hour']['stem']}
长生  {tw.get('year',''):4} {tw.get('month',''):4} {tw.get('day',''):4} {tw.get('hour','')}
空亡  {vi.get('year',{}).get('kong',''):4} {vi.get('month',{}).get('kong',''):4} {vi.get('day',{}).get('kong',''):4} {vi.get('hour',{}).get('kong','')}
```
纳音: {fp['year']['nayin']}|{fp['month']['nayin']}|{fp['day']['nayin']}|{fp['hour']['nayin']}

🔥 *五行* 木{wx_count('wood','木')} 火{wx_count('fire','火')} 土{wx_count('earth','土')} 金{wx_count('metal','金')} 水{wx_count('water','水')}
日主: {dm['stem']}({dm.get('elementCn','')}) {dm.get('strength','中和')} | 自坐: {dm.get('selfSitting','')}

🏛️ 胎元{sp.get('taiYuan',{}).get('pillar','')} 胎息{sp.get('taiXi',{}).get('pillar','')} 命宫{sp.get('mingGong',{}).get('pillar','')} 身宫{sp.get('shenGong',{}).get('pillar','')}
📐 格局: {geju.get('main','')} | 🎯 司令: {siling.get('current','')}"""

    # 神煞
    all_spirits = []
    for p in ['year', 'month', 'day', 'hour']:
        all_spirits.extend(spirits.get('byPillar', {}).get(p, []))
    if all_spirits:
        text += f"\n✨ *神煞* {', '.join(list(dict.fromkeys(all_spirits)))}"

    # 小运
    xiao_yun = r.get('xiaoYun', [])
    if xiao_yun:
        text += f"\n\n👶 *小运* " + " ".join([f"{xy['age']}岁{xy['ganZhi']}" for xy in xiao_yun])

    text += f"\n\n🚀 *大运* {mf['direction']} {mf['startAge']}岁起 ({jy.get('description','')})"
    text += "\n" + " → ".join([f"{p['age']}{p['fullName']}" for p in mf['pillars']])
    
    text += "\n\n📆 *流年* " + " ".join([f"{p['year']}{p['fullName']}" for p in r['annualFortune']])
    
    # 称骨命卦
    bone = r.get('boneWeight', {})
    gua = r.get('mingGua', {})
    text += f"\n\n⚖️ 称骨: {bone.get('weightCn','')} | 🧭 命卦: {gua.get('guaName','')}({gua.get('group','')})"
    
    return text


# ==================== 网络健壮性工具 ====================
async def _send_with_retry(send_fn, *, max_retries=4, base_delay=2, max_delay=60, on_retry=None):
    """对单次发送操作做指数退避重试"""
    last_exc = None
    for attempt in range(max_retries):
        try:
            return await send_fn()
        except RetryAfter as e:
            wait = min(int(e.retry_after), max_delay)
            if on_retry:
                await on_retry(f"Telegram 限流，等待 {wait}s 后重试…")
            logger.warning(f"[SEND] RetryAfter wait={wait}s attempt={attempt + 1}/{max_retries}")
            await asyncio.sleep(wait)
            last_exc = e
        except (NetworkError, TimedOut) as e:
            wait = min(max_delay, base_delay * (2 ** attempt))
            if on_retry:
                await on_retry(f"网络异常，{wait}s 后重试… ({attempt + 1}/{max_retries})")
            logger.warning(f"[SEND] NetworkError {e} wait={wait}s attempt={attempt + 1}/{max_retries}")
            await asyncio.sleep(wait)
            last_exc = e
    if last_exc:
        logger.error(f"[SEND] 重试失败，最终异常: {last_exc}")
        raise last_exc


async def _send_media_group_with_retry(*, context, chat_id, paths, on_retry=None, max_retries=4):
    """发送 media group，失败自动重试，每次重试重新打开文件句柄"""
    def _open_media():
        files = [p.open("rb") for p, _ in paths]
        media = [InputMediaDocument(media=f, filename=name) for f, (_, name) in zip(files, paths)]
        return files, media

    last_exc = None
    for attempt in range(max_retries):
        files, media = _open_media()
        try:
            return await context.bot.send_media_group(chat_id=chat_id, media=media)
        except RetryAfter as e:
            wait = min(int(e.retry_after), 60)
            if on_retry:
                await on_retry(f"Telegram 限流，等待 {wait}s 后重试…")
            logger.warning(f"[MEDIA] RetryAfter wait={wait}s attempt={attempt + 1}/{max_retries}")
            await asyncio.sleep(wait)
            last_exc = e
        except (NetworkError, TimedOut) as e:
            wait = min(60, 2 ** attempt)
            if on_retry:
                await on_retry(f"网络异常，{wait}s 后重试… ({attempt + 1}/{max_retries})")
            logger.warning(f"[MEDIA] NetworkError {e} wait={wait}s attempt={attempt + 1}/{max_retries}")
            await asyncio.sleep(wait)
            last_exc = e
        finally:
            for f in files:
                try:
                    f.close()
                except:
                    pass
    if last_exc:
        logger.error(f"[MEDIA] 重试失败，最终异常: {last_exc}")
        raise last_exc


def _make_retry_notifier(context: ContextTypes.DEFAULT_TYPE, chat_id: int):
    """构造只发送一次的重试提示"""
    sent = {"flag": False}

    async def notify(msg: str):
        if sent["flag"]:
            return
        sent["flag"] = True
        try:
            await context.bot.send_message(chat_id=chat_id, text=msg)
        except Exception as e:
            # 提示失败不影响主流程
            logger.warning(f"[WARN] retry notifier failed: {e}")
    return notify

# ==================== 伪进度调度 ====================
def _build_progress_text(state, elapsed):
    items = state["items"]
    cumu = state["cumu"]
    target = state["target_secs"]
    tips = state["tips"]
    step = len(items) - 1
    for i, t in enumerate(cumu):
        if elapsed <= t:
            step = i
            break
    percent = min(100, int(elapsed / target * 100))
    done = [items[i] for i, t in enumerate(cumu) if elapsed >= t]
    tip = tips[int(elapsed // 7) % len(tips)] if tips else ""
    return (
        "⏳ 正在排盘（计算中）\n"
        "```\n"
        f"步骤 {step + 1}/{len(items)}：{items[step]}\n"
        f"已用时 {int(elapsed)}s / 预计 {target}s\n"
        f"进度：{percent}%\n"
        f"已完成：{', '.join(done) if done else '准备中'}\n"
        "```\n"
        f"命理小知识：{tip}"
    )


async def _finalize_progress_send(state, context: ContextTypes.DEFAULT_TYPE):
    chat_id = state["chat_id"]
    message_id = state["message_id"]
    d = state["data"]
    
    # ========== 释放计算槽位 ==========
    try:
        release_slot()
    except Exception:
        pass
    # ========== 槽位释放结束 ==========
    
    try:
        out_path, filename, ai_path, ai_filename = await state["task"]
    except Exception as e:
        await context.bot.edit_message_text(
            chat_id=chat_id,
            message_id=message_id,
            text=f"❌ 排盘失败: {e}\n\n发送 /paipan 重试",
        )
        return

    now_str = fmt_cn(now_cn())
    name_display = d.get('name') or '命主'
    gender_display = '乾造' if d.get('gender','male')=='male' else '坤造'
    header = f"""🎲 {name_display} {gender_display}
报告见附件
```
{filename}
{ai_filename}
```
免费AI分析网站（复制 AI 分析版全文到网站对话框中）
神算gem版本（效果最好）：https://gemini.google.com/gem/1Vcz5d99hw73vgxUlDzB80AnvJdfbCiGT?usp=sharing
https://aistudio.google.com/
https://gemini.google.com/
https://business.gemini.google/
https://claude.ai/
https://chatgpt.com/
https://x.com/i/grok

⏱️ 北京时间：{now_str}"""

    await context.bot.edit_message_text(
        chat_id=chat_id,
        message_id=message_id,
        text="✅ 排盘完成，报告已发送。",
    )

    notifier = _make_retry_notifier(context, chat_id)
    try:
        await _send_result(
            chat_id=chat_id,
            context=context,
            out_path=out_path,
            filename=filename,
            ai_path=ai_path,
            ai_filename=ai_filename,
            d=d,
        )
    except Exception as send_err:
        _enqueue_send_task({
            "type": "media_group",
            "chat_id": chat_id,
            "header": header,
            "parse_mode": "Markdown",
            "files": [
                (str(out_path), filename),
                (str(ai_path), ai_filename),
            ],
            "queued_at": now_cn().isoformat(),
        })
        await context.bot.send_message(
            chat_id=chat_id,
            text=f"⚠️ 排盘已生成但发送失败，已加入补发队列。错误: {send_err}"
        )


async def progress_loop(state, context: ContextTypes.DEFAULT_TYPE):
    """按照每个步骤的预计耗时依次刷新进度"""
    start = state["start_ts"]
    durations = state["durations"]
    for dur in durations:
        await asyncio.sleep(dur)
        elapsed = time.monotonic() - start
        text = _build_progress_text(state, elapsed)
        try:
            await context.bot.edit_message_text(
                chat_id=state["chat_id"],
                message_id=state["message_id"],
                text=text,
                parse_mode=ParseMode.MARKDOWN,
            )
        except Exception as e:
            logger.warning(f"[PROGRESS] edit failed: {e}")
        # 仅当超过目标时跳出，确保完整时长演示
        if elapsed >= state["target_secs"]:
            break
    await _finalize_progress_send(state, context)


# ==================== 发送失败补偿队列 ====================
def _enqueue_send_task(task: dict):
    QUEUE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with QUEUE_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(task, ensure_ascii=False) + "\n")
    logger.warning(f"[QUEUE] 入队补发任务 type={task.get('type')} chat_id={task.get('chat_id')}")


def _load_queue():
    if not QUEUE_PATH.exists():
        return []
    tasks = []
    with QUEUE_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                tasks.append(json.loads(line))
            except Exception as e:
                logger.warning(f"[QUEUE] 解析失败跳过: {e}")
    return tasks


def _save_queue(tasks):
    if not tasks:
        QUEUE_PATH.unlink(missing_ok=True)
        return
    with QUEUE_PATH.open("w", encoding="utf-8") as f:
        for t in tasks:
            f.write(json.dumps(t, ensure_ascii=False) + "\n")


async def _process_send_queue(context: ContextTypes.DEFAULT_TYPE):
    tasks = _load_queue()
    if not tasks:
        return
    remaining = []
    for task in tasks:
        try:
            if task.get("type") == "text":
                await _send_with_retry(
                    lambda: context.bot.send_message(
                        chat_id=task["chat_id"],
                        text=task["text"],
                        parse_mode=task.get("parse_mode"),
                    ),
                    on_retry=_make_retry_notifier(context, task["chat_id"]),
                )
            elif task.get("type") == "media_group":
                header = task.get("header")
                if header:
                    await _send_with_retry(
                        lambda: context.bot.send_message(
                            chat_id=task["chat_id"],
                            text=header,
                            parse_mode=task.get("parse_mode"),
                        ),
                        on_retry=_make_retry_notifier(context, task["chat_id"]),
                    )
                paths = [(Path(p), name) for p, name in task.get("files", [])]
                await _send_media_group_with_retry(
                    context=context,
                    chat_id=task["chat_id"],
                    paths=paths,
                    on_retry=_make_retry_notifier(context, task["chat_id"]),
                )
            logger.info(f"[QUEUE] 补发成功 type={task.get('type')} chat_id={task.get('chat_id')}")
        except Exception as e:
            logger.warning(f"[QUEUE] 补发失败保留队列: {e}")
            remaining.append(task)
    _save_queue(remaining)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    context.user_data["gender"] = "male"
    await update.message.reply_text(
        build_main_msg("male"), 
        parse_mode="Markdown", 
        reply_markup=main_kb("male")
    )
    return INPUT


async def handle_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """处理文本输入 → 进入确认"""
    if "gender" not in context.user_data:
        context.user_data["gender"] = "male"
    text = update.message.text.strip()
    date_str, time_str, place, name, err = parse_input(text)
    if err:
        await update.message.reply_text(f"❌ {err}\n请按模板逐行输入：日期/时间/地点/姓名")
        return INPUT
    if not (date_str and time_str and place and name):
        await update.message.reply_text("❌ 输入缺失，请按模板逐行输入")
        return INPUT

    # 地点校验（模糊命中），否则退回主菜单
    coords = get_coords(place)
    if coords is None:
        await update.message.reply_text("❌ 未匹配到地点，请输入中国境内地名（如“北京市海淀区”）")
        context.user_data.clear()
        await update.message.reply_text(
            build_main_msg("male"),
            parse_mode="Markdown",
            reply_markup=main_kb("male")
        )
        return INPUT
    
    context.user_data.update({
        "birth_date": date_str, "birth_time": time_str,
        "birth_place": place, "name": name
    })
    
    await update.message.reply_text(
        build_confirm_msg(context.user_data),
        parse_mode="Markdown",
        reply_markup=confirm_kb()
    )
    return CONFIRM


async def handle_main_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """主菜单回调 - 切换性别"""
    query = update.callback_query
    await query.answer("处理中...")
    
    if query.data == "g_male":
        context.user_data["gender"] = "male"
    elif query.data == "g_female":
        context.user_data["gender"] = "female"
    
    gender = context.user_data.get("gender", "male")
    await query.edit_message_text(
        build_main_msg(gender),
        parse_mode="Markdown",
        reply_markup=main_kb(gender)
    )
    return INPUT


async def handle_confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """确认页回调"""
    query = update.callback_query
    await query.answer("处理中...")
    if "gender" not in context.user_data:
        context.user_data["gender"] = "male"
    
    if query.data == "edit":
        gender = context.user_data.get("gender", "male")
        await query.edit_message_text(
            build_main_msg(gender),
            parse_mode="Markdown",
            reply_markup=main_kb(gender)
        )
        return INPUT
    
    if query.data == "calc":
        d = context.user_data
        d.setdefault("gender", "male")
        
        # ========== 限流检查 ==========
        user_id = update.effective_user.id
        is_admin = (str(update.effective_chat.id) == str(ADMIN_CHAT_ID))
        
        if not is_admin:
            allowed, reason = check_rate_limit(user_id)
            if not allowed:
                await query.edit_message_text(
                    f"⏳ {reason}\n\n发送 /paipan 重试",
                    reply_markup=result_kb()
                )
                return ConversationHandler.END
            record_request(user_id)
        # ========== 限流检查结束 ==========
        
        try:
            lng, lat = get_location(d.get("birth_place", ""))
        except Exception:
            gender = d.get("gender", "male")
            await query.edit_message_text(
                "❌ 地点无法识别，请重新输入。\n\n" + build_main_msg(gender),
                parse_mode="Markdown",
                reply_markup=main_kb(gender),
            )
            return INPUT

        is_admin = (str(update.effective_chat.id) == str(ADMIN_CHAT_ID))

        # ========== 获取计算槽位 ==========
        if not is_admin:
            status = get_queue_status()
            if status["queue_size"] >= status["queue_max"]:
                await query.edit_message_text(
                    "⏳ 服务器繁忙，请稍后再试\n\n发送 /paipan 重试",
                    reply_markup=result_kb()
                )
                return ConversationHandler.END
            await acquire_slot()
        # ========== 槽位获取结束 ==========

        # 启动真实计算（后台线程）
        calc_task = asyncio.create_task(
            asyncio.to_thread(_calc_and_save_report, d, lng, lat, update.effective_user.id)
        )

        # 管理员：跳过伪进度，直接发送
        if is_admin:
            try:
                out_path, filename, ai_path, ai_filename = await calc_task
                await _send_result(
                    chat_id=update.effective_chat.id,
                    context=context,
                    out_path=out_path,
                    filename=filename,
                    ai_path=ai_path,
                    ai_filename=ai_filename,
                    d=d,
                )
            except Exception as e:
                await query.edit_message_text(f"❌ 排盘失败: {e}\n\n发送 /paipan 重试")
            return ConversationHandler.END

        # 伪进度计划（目标 55~70 秒）
        target_secs = random.randint(55, 70)
        base = [random.uniform(3, 8) for _ in PROGRESS_ITEMS]
        factor = target_secs / sum(base)
        durations = [round(b * factor, 2) for b in base]
        cumu = []
        s = 0
        for t in durations:
            s += t
            cumu.append(s)

        msg = await query.edit_message_text("⏳ 正在排盘，生成完整报告...")

        progress_state = {
            "chat_id": update.effective_chat.id,
            "message_id": msg.message_id,
            "start_ts": time.monotonic(),
            "target_secs": target_secs,
            "durations": durations,
            "cumu": cumu,
            "items": PROGRESS_ITEMS,
            "tips": PROGRESS_TIPS,
            "task": calc_task,
            "data": dict(d),  # 复制一份避免后续修改
        }

        # 每个步骤结束刷新一次进度
        asyncio.create_task(progress_loop(progress_state, context))

        return INPUT
    
    return CONFIRM


def _calc_and_save_report(d: dict, lng: float, lat: float, user_id: str):
    """同步重任务封装，供 asyncio.to_thread 调用"""
    t0 = time.monotonic()
    birth_dt = datetime.strptime(f"{d['birth_date']} {d['birth_time']}", "%Y-%m-%d %H:%M")

    # 传递姓名与出生地，避免回退默认“命主/未知”
    result = BaziCalculator(
        birth_dt,
        d["gender"],
        lng,
        latitude=lat,
        name=d.get("name"),
        birth_place=d.get("birth_place"),
    ).calculate(hide=REPORT_HIDE)
    calc_ms = int((time.monotonic() - t0) * 1000)
    
    report_txt = generate_full_report(result, hide=REPORT_HIDE)

    TXT_DIR.mkdir(parents=True, exist_ok=True)
    gender_cn = "男" if d["gender"] == "male" else "女"
    filename = f"{d['birth_date']}-{d['birth_time']}-{d.get('birth_place','未知')}-{d.get('name') or '命主'}-{gender_cn}.txt".replace(" ", "")
    out_path = TXT_DIR / filename
    out_path.write_text(report_txt, encoding="utf-8")

    # AI 分析版：在原报告前拼接提示词
    prompt_path = PROMPTS_DIR / "快速版.md"
    prompt_text = prompt_path.read_text(encoding="utf-8") if prompt_path.exists() else ""
    ai_report_txt = f"{prompt_text}\n\n{report_txt}"
    ai_filename = filename.replace(".txt", "-ai分析版.txt")
    ai_path = TXT_DIR / ai_filename
    ai_path.write_text(ai_report_txt, encoding="utf-8")

    db.save_record(user_id=str(user_id), biz_type="bazi", name=d.get("name"),
                   gender=d["gender"], calendar_type="solar", birth_date=d["birth_date"],
                   birth_time=d["birth_time"], birth_place=d.get("birth_place", "北京"),
                   longitude=lng, latitude=lat, dst=0, true_solar=1, early_zi=0, biz_data=result)

    total_ms = int((time.monotonic() - t0) * 1000)
    logger.info(f"[PERF] calc+report user={user_id} calc={calc_ms}ms total={total_ms}ms")

    return out_path, filename, ai_path, ai_filename


async def handle_restart(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer("处理中...")
    context.user_data.clear()
    context.user_data["gender"] = "male"
    await context.bot.send_message(
        chat_id=update.effective_chat.id,
        text=build_main_msg("male"),
        parse_mode="Markdown",
        reply_markup=main_kb("male")
    )
    return INPUT


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("已取消。发送 /paipan 重新开始。")
    return ConversationHandler.END


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    now_str = fmt_cn(now_cn())
    await update.message.reply_text(
        "🤡 可用命令\n"
        "```\n"
        "/start 进入排盘\n"
        "/help  查看帮助\n"
        "```\n"
        f"⏱️ 北京时间：{now_str}",
        parse_mode=ParseMode.MARKDOWN,
    )
    return ConversationHandler.END


def main():
    token = os.getenv("FATE_BOT_TOKEN")
    if not token:
        print("错误: 未设置 FATE_BOT_TOKEN (请在 config/.env 中配置)")
        return
    
    async def post_init(app: Application):
        await app.bot.set_my_commands([
            BotCommand("start", "开始/重新排盘"),
            BotCommand("help", "查看帮助"),
        ])

    app = (
        Application.builder()
        .token(token)
        .post_init(post_init)
        .http_version("1.1")
        .connect_timeout(10)
        .read_timeout(10)
        .write_timeout(10)
        .pool_timeout(10)
        .get_updates_connect_timeout(10)
        .get_updates_read_timeout(10)
        .get_updates_write_timeout(10)
        .get_updates_pool_timeout(10)
        .build()
    )
    
    async def health_check(context: ContextTypes.DEFAULT_TYPE):
        app_ctx = context.application
        try:
            await app_ctx.bot.get_me()
            app_ctx.bot_data["health_fail"] = 0
        except Exception as e:
            fail = app_ctx.bot_data.get("health_fail", 0) + 1
            app_ctx.bot_data["health_fail"] = fail
            logger.warning(f"[HEALTH] bot.get_me 失败 {fail}/3: {e}")
            if fail >= 3:
                logger.error("[HEALTH] 停止应用以便外层重启")
                await app_ctx.stop()
                await app_ctx.shutdown()
    
    if app.job_queue:
        app.job_queue.run_repeating(health_check, interval=60, first=60)
        app.job_queue.run_repeating(_process_send_queue, interval=90, first=30)
    
    conv = ConversationHandler(
        entry_points=[CommandHandler("paipan", start), CommandHandler("start", start)],
        states={
            INPUT: [
                CommandHandler("start", start),
                CommandHandler("paipan", start),
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_input),
                CallbackQueryHandler(handle_main_callback, pattern="^g_"),
                CallbackQueryHandler(handle_restart, pattern="^restart$"),
            ],
            CONFIRM: [
                CommandHandler("start", start),
                CommandHandler("paipan", start),
                CallbackQueryHandler(handle_confirm_callback, pattern="^(calc|edit)$"),
                CallbackQueryHandler(handle_restart, pattern="^restart$"),
            ]
        },
        fallbacks=[
            CommandHandler("start", start),
            CommandHandler("paipan", start),
            CommandHandler("cancel", cancel)
        ])
    
    app.add_handler(conv)
    app.add_handler(CommandHandler("help", help_cmd))
    
    print("Bot 启动中...")
    app.run_polling(
        drop_pending_updates=True,
        allowed_updates=["message", "callback_query"],
        # 禁止信号处理：由外层守护/脚本负责进程生命周期，避免 event loop/signal 交互导致的异常退出
        stop_signals=(),
    )


def run_with_retry():
    """带自动重连的启动函数"""
    retry_delay = 5
    max_delay = 60
    
    while True:
        try:
            import asyncio
            asyncio.set_event_loop(asyncio.new_event_loop())
            logger.info("🤖 启动 Bot...")
            main()
            # run_polling 理论上不会“正常返回”；一旦返回视为异常退出
            raise RuntimeError("Bot 主循环意外退出（run_polling 已返回）")
        except KeyboardInterrupt:
            logger.info("👋 Bot 已停止")
            break
        except BaseException as e:
            logger.exception(f"❌ Bot 异常退出: {e}")
            logger.info(f"⏳ {retry_delay}秒后重连...")
            time.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, max_delay)
        else:
            retry_delay = 5


if __name__ == "__main__":
    run_with_retry()
