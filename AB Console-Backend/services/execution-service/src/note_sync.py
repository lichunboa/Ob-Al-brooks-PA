"""
笔记反向同步 - 从币安交易数据回填 Obsidian 笔记 frontmatter

流程:
1. 扫描 Obsidian vault 中的交易笔记
2. 提取 order_id / sl_order_id / tp_order_id
3. 从币安交易历史匹配已实现盈亏
4. 写回 frontmatter: 净利润/net_profit, 结果/outcome, 追踪状态/tracking_status
"""
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Obsidian vault 交易笔记根目录
VAULT_TRADES_DIR = Path.home() / "Desktop" / "Obsidian" / "Al-brooks-PA" / "AB Console-Obsidian" / "Daily" / "Trades"


class NoteSync:
    """笔记反向同步器"""

    def __init__(self, executor):
        self.executor = executor

    async def sync_all(self) -> dict:
        """扫描所有笔记并同步币安数据"""
        # 1. 获取币安交易历史
        trades = await self.executor.get_trade_history(limit=500)
        if not trades:
            return {
                "success": False,
                "message": "无法获取币安交易历史",
                "synced": 0,
            }

        # 获取当前持仓（用于杠杆信息）
        positions = await self.executor.get_positions()
        pos_leverage = {}
        for p in positions:
            sym = p.symbol.replace("/", "").replace(":USDT", "")
            pos_leverage[sym] = p.leverage

        # 按 order_id 聚合：价格、时间、PnL、手续费
        order_data = {}
        for t in trades:
            oid = t.order_id
            if oid not in order_data:
                order_data[oid] = {
                    "pnl": 0, "commission": 0,
                    "symbol": t.symbol, "side": t.side,
                    "total_qty": 0, "total_value": 0,
                    "first_time": t.timestamp,
                    "last_time": t.timestamp,
                }
            d = order_data[oid]
            d["pnl"] += t.realized_pnl
            d["commission"] += t.commission
            d["total_qty"] += t.quantity
            d["total_value"] += t.quantity * t.price
            if t.timestamp < d["first_time"]:
                d["first_time"] = t.timestamp
            if t.timestamp > d["last_time"]:
                d["last_time"] = t.timestamp

        # 计算加权均价
        for d in order_data.values():
            if d["total_qty"] > 0:
                d["avg_price"] = d["total_value"] / d["total_qty"]
            else:
                d["avg_price"] = 0

        # 2. 扫描笔记
        notes = self._scan_notes()
        logger.info(f"扫描到 {len(notes)} 个交易笔记")

        # 3. 匹配并更新
        synced = 0
        skipped = 0
        errors = []
        details = []

        for note in notes:
            try:
                result = self._sync_note(
                    note, order_data, pos_leverage
                )
                if result == "synced":
                    synced += 1
                    details.append({"file": note["file"].name, "status": "synced"})
                elif result == "skipped":
                    skipped += 1
                else:
                    details.append({"file": note["file"].name, "status": result})
            except Exception as e:
                errors.append({"file": note["file"].name, "error": str(e)})
                logger.error(f"同步笔记失败 {note['file'].name}: {e}")

        return {
            "success": True,
            "total_notes": len(notes),
            "synced": synced,
            "skipped": skipped,
            "errors": len(errors),
            "details": details[:20],
            "error_details": errors[:10],
        }

    def _scan_notes(self) -> list[dict]:
        """扫描所有交易笔记，提取 frontmatter 中的 order_id"""
        notes = []
        if not VAULT_TRADES_DIR.exists():
            logger.warning(f"交易笔记目录不存在: {VAULT_TRADES_DIR}")
            return notes

        for md_file in VAULT_TRADES_DIR.rglob("*.md"):
            # 跳过模板和非交易笔记
            if "Templates" in str(md_file) or "assets" in str(md_file):
                continue

            fm = self._parse_frontmatter(md_file)
            if not fm:
                continue

            # 提取 order_id（支持多种字段名）
            order_id = fm.get("订单ID/order_id") or fm.get("order_id") or ""
            sl_order_id = fm.get("止损订单ID/sl_order_id") or fm.get("sl_order_id") or fm.get("stop_loss_order_id") or ""
            tp_order_id = fm.get("止盈订单ID/tp_order_id") or fm.get("tp_order_id") or fm.get("take_profit_order_id") or ""

            # 只处理有真实 order_id 的笔记（纯数字）
            order_id = str(order_id).strip().strip('"').strip("'")
            if not order_id or not order_id.isdigit():
                continue

            notes.append({
                "file": md_file,
                "frontmatter": fm,
                "order_id": order_id,
                "sl_order_id": str(sl_order_id).strip().strip('"').strip("'"),
                "tp_order_id": str(tp_order_id).strip().strip('"').strip("'"),
            })

        return notes

    def _parse_frontmatter(self, file_path: Path) -> Optional[dict]:
        """解析 markdown 文件的 YAML frontmatter"""
        try:
            content = file_path.read_text(encoding="utf-8")
            if not content.startswith("---"):
                return None

            end = content.find("---", 3)
            if end == -1:
                return None

            fm_text = content[3:end].strip()
            result = {}
            for line in fm_text.split("\n"):
                line = line.strip()
                if ":" not in line or line.startswith("-") or line.startswith("#"):
                    continue
                key, _, value = line.partition(":")
                result[key.strip()] = value.strip()

            return result
        except Exception:
            return None

    def _sync_note(
        self, note: dict, order_data: dict, pos_leverage: dict
    ) -> str:
        """同步单个笔记，返回状态"""
        fm = note["frontmatter"]
        order_id = note["order_id"]
        sl_id = note["sl_order_id"]
        tp_id = note["tp_order_id"]

        # 已有完整数据的跳过（PnL + 手续费都有）
        existing_pnl = fm.get("净利润/net_profit", "")
        existing_comm = fm.get("手续费/commission", "")
        if (existing_pnl and existing_pnl not in ("", "null", "None")
                and existing_comm and existing_comm not in ("", "null", "None")):
            return "skipped"

        # 查找平仓盈亏：优先 SL/TP 订单
        close_data = None
        outcome = ""

        if sl_id.isdigit() and sl_id in order_data:
            info = order_data[sl_id]
            if info["pnl"] != 0:
                close_data = info
                outcome = "止损 (Stop Loss)"

        if tp_id.isdigit() and tp_id in order_data:
            info = order_data[tp_id]
            if info["pnl"] != 0:
                close_data = info
                outcome = "止盈 (Take Profit)"

        # 也检查主订单（手动平仓场景）
        if not outcome and order_id in order_data:
            info = order_data[order_id]
            if info["pnl"] != 0:
                close_data = info
                outcome = (
                    "盈利 (Win)" if info["pnl"] > 0
                    else "亏损 (Loss)"
                )

        if not close_data:
            return "no_close_data"

        pnl = close_data["pnl"]
        commission = close_data["commission"]
        exit_price = close_data["avg_price"]
        close_time = close_data["last_time"]

        # 获取开仓数据
        open_data = order_data.get(order_id, {})
        actual_entry = open_data.get("avg_price", 0)
        open_time = open_data.get("first_time")
        open_commission = open_data.get("commission", 0)
        total_commission = commission + open_commission

        # 持仓时长
        duration_str = ""
        if open_time and close_time:
            delta = close_time - open_time
            total_sec = int(delta.total_seconds())
            if total_sec < 60:
                duration_str = f"{total_sec}秒"
            elif total_sec < 3600:
                duration_str = f"{total_sec // 60}分{total_sec % 60}秒"
            else:
                h = total_sec // 3600
                m = (total_sec % 3600) // 60
                duration_str = f"{h}时{m}分"

        # 滑点计算
        planned_entry = fm.get("入场/entry_price", "")
        slippage_str = ""
        if planned_entry and actual_entry:
            try:
                planned = float(planned_entry)
                if planned > 0:
                    slip = abs(actual_entry - planned)
                    slip_pct = (slip / planned) * 100
                    slippage_str = f"{slip_pct:.3f}%"
            except (ValueError, TypeError):
                pass

        # 杠杆
        sym_clean = close_data["symbol"]
        sym_clean = sym_clean.replace(":USDT", "")
        sym_clean = sym_clean.replace("/", "")
        leverage = pos_leverage.get(sym_clean, "")

        # 写回 frontmatter
        updates = {
            "净利润/net_profit": f"{pnl:.2f}",
            "结果/outcome": outcome,
            "追踪状态/tracking_status": "已平仓",
            "手续费/commission": f"{total_commission:.4f}",
        }
        if actual_entry:
            updates["实际入场价/actual_entry"] = (
                f"{actual_entry:.2f}"
            )
        if exit_price:
            updates["出场价格/exit_price"] = (
                f"{exit_price:.2f}"
            )
        if duration_str:
            updates["持仓时长/duration"] = duration_str
        if slippage_str:
            updates["滑点/slippage"] = slippage_str
        if leverage:
            updates["杠杆/leverage"] = f"{leverage}x"

        self._update_frontmatter(note["file"], updates)
        fname = note["file"].name
        logger.info(
            f"同步笔记 {fname}: PnL={pnl:.2f}, "
            f"outcome={outcome}, duration={duration_str}"
        )
        return "synced"

    def _update_frontmatter(
        self, file_path: Path, updates: dict
    ):
        """更新 markdown 文件的 frontmatter 字段"""
        content = file_path.read_text(encoding="utf-8")
        if not content.startswith("---"):
            return

        end = content.find("---", 3)
        if end == -1:
            return

        fm_text = content[3:end]
        body = content[end:]

        for key, value in updates.items():
            replacement = f"{key}: {value}"
            if key + ":" in fm_text:
                import re
                fm_text = re.sub(
                    re.escape(key) + r":.*",
                    replacement,
                    fm_text,
                    count=1,
                )
            else:
                # 字段不存在，在 frontmatter 末尾添加
                fm_text = fm_text.rstrip("\n")
                fm_text += f"\n{replacement}\n"

        new_content = "---" + fm_text + body
        file_path.write_text(new_content, encoding="utf-8")
