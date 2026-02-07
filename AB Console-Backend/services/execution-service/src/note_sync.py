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
            return {"success": False, "message": "无法获取币安交易历史", "synced": 0}

        # 按 order_id 聚合 realized_pnl
        order_pnl = {}
        for t in trades:
            oid = t.order_id
            if oid not in order_pnl:
                order_pnl[oid] = {"pnl": 0, "commission": 0, "symbol": t.symbol, "side": t.side}
            order_pnl[oid]["pnl"] += t.realized_pnl
            order_pnl[oid]["commission"] += t.commission

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
                result = self._sync_note(note, order_pnl)
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

    def _sync_note(self, note: dict, order_pnl: dict) -> str:
        """同步单个笔记，返回状态"""
        fm = note["frontmatter"]
        order_id = note["order_id"]
        sl_id = note["sl_order_id"]
        tp_id = note["tp_order_id"]

        # 已有净利润的跳过
        existing_pnl = fm.get("净利润/net_profit", "")
        if existing_pnl and existing_pnl not in ("", "null", "None"):
            return "skipped"

        # 查找平仓盈亏：优先 SL/TP 订单
        pnl = 0.0
        outcome = ""
        commission = 0.0

        if sl_id.isdigit() and sl_id in order_pnl:
            info = order_pnl[sl_id]
            if info["pnl"] != 0:
                pnl = info["pnl"]
                commission = info["commission"]
                outcome = "止损 (Stop Loss)"

        if tp_id.isdigit() and tp_id in order_pnl:
            info = order_pnl[tp_id]
            if info["pnl"] != 0:
                pnl = info["pnl"]
                commission = info["commission"]
                outcome = "止盈 (Take Profit)"

        # 也检查主订单（手动平仓场景）
        if not outcome and order_id in order_pnl:
            info = order_pnl[order_id]
            if info["pnl"] != 0:
                pnl = info["pnl"]
                commission = info["commission"]
                if pnl > 0:
                    outcome = "盈利 (Win)"
                else:
                    outcome = "亏损 (Loss)"

        if not outcome:
            return "no_close_data"

        # 写回 frontmatter
        updates = {
            "净利润/net_profit": f"{pnl:.2f}",
            "结果/outcome": outcome,
            "追踪状态/tracking_status": "已平仓",
        }

        self._update_frontmatter(note["file"], updates)
        fname = note["file"].name
        logger.info(
            f"同步笔记 {fname}: "
            f"PnL={pnl:.2f}, outcome={outcome}"
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
            # 匹配 "key:" 或 "key: old_value"
            pattern = f"{key}:.*"
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
