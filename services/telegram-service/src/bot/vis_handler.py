"""
可视化面板处理器 - 集成 vis-service 到 Telegram Bot

UI 流程：
1. 主菜单 → 📈可视化 → 选择图表类型
2. 选择图表类型 → 选择币种 → 选择周期
3. 渲染图表并发送
"""

import logging
import os
import sys
from pathlib import Path
from typing import Optional, Tuple, Dict, List

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto
from telegram.ext import ContextTypes

# 添加 vis-service 路径
VIS_SERVICE_PATH = Path(__file__).resolve().parent.parent.parent.parent.parent / "services-preview" / "vis-service" / "src"
if str(VIS_SERVICE_PATH) not in sys.path:
    sys.path.insert(0, str(VIS_SERVICE_PATH))

logger = logging.getLogger(__name__)

# 可用的图表类型
VIS_TEMPLATES = {
    "vpvr_ridge": {
        "name_key": "vis.template.vpvr_ridge",
        "name_fallback": "📊 VPVR山脊图",
        "description_key": "vis.template.vpvr_ridge_desc",
        "description_fallback": "成交量分布随时间演变",
        "supports_symbol": True,
        "supports_interval": True,
        "default_interval": "1h",
        "intervals": ["5m", "15m", "1h", "4h", "1d"],
    },
    "vpvr_zone_strip": {
        "name_key": "vis.template.vpvr_strip",
        "name_fallback": "🎯 VPVR条带图",
        "description_key": "vis.template.vpvr_strip_desc",
        "description_fallback": "全市场价值区位置分布",
        "supports_symbol": False,
        "supports_interval": True,
        "default_interval": "1h",
        "intervals": ["1h", "4h", "1d"],
    },
    "kline_basic": {
        "name_key": "vis.template.kline",
        "name_fallback": "🕯️ K线图",
        "description_key": "vis.template.kline_desc",
        "description_fallback": "K线+均线+量能",
        "supports_symbol": True,
        "supports_interval": True,
        "default_interval": "1h",
        "intervals": ["1m", "5m", "15m", "1h", "4h", "1d"],
    },
}

# 默认币种列表
DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]


def _get_i18n():
    """获取 i18n 实例"""
    try:
        from libs.common.i18n import build_i18n_from_env
        return build_i18n_from_env()
    except Exception:
        return None


def _t(update, key: str, fallback: str = "", **kwargs) -> str:
    """获取翻译文本"""
    i18n = _get_i18n()
    if i18n:
        try:
            lang = None
            if update:
                if hasattr(update, "callback_query") and update.callback_query:
                    user_id = update.callback_query.from_user.id
                elif hasattr(update, "message") and update.message:
                    user_id = update.message.from_user.id
                else:
                    user_id = None
                if user_id:
                    from bot.app import _load_user_locale
                    lang = _load_user_locale(user_id)
            text = i18n.gettext(key, lang=lang, **kwargs)
            if text and text != key:
                return text
        except Exception:
            pass
    return fallback or key


def _resolve_lang(update) -> str:
    """解析用户语言"""
    try:
        from bot.app import _resolve_lang as app_resolve_lang
        return app_resolve_lang(update)
    except Exception:
        return "zh_CN"


class VisHandler:
    """可视化面板处理器"""

    def __init__(self):
        self.user_states: Dict[int, Dict] = {}  # user_id -> {template, symbol, interval}

    def _get_user_state(self, user_id: int) -> Dict:
        """获取用户状态"""
        if user_id not in self.user_states:
            self.user_states[user_id] = {
                "template": None,
                "symbol": "BTCUSDT",
                "interval": "1h",
            }
        return self.user_states[user_id]

    def _set_user_state(self, user_id: int, **kwargs):
        """设置用户状态"""
        state = self._get_user_state(user_id)
        state.update(kwargs)

    def build_vis_menu_keyboard(self, update=None) -> InlineKeyboardMarkup:
        """构建可视化菜单键盘"""
        lang = _resolve_lang(update)
        rows: List[List[InlineKeyboardButton]] = []

        # 图表类型按钮
        for template_id, template in VIS_TEMPLATES.items():
            name = _t(update, template["name_key"], template["name_fallback"])
            rows.append([
                InlineKeyboardButton(name, callback_data=f"vis_template_{template_id}")
            ])

        # 返回主菜单
        rows.append([
            InlineKeyboardButton(_t(update, "btn.back_home", "🏠 返回"), callback_data="main_menu"),
        ])

        return InlineKeyboardMarkup(rows)

    def build_symbol_keyboard(self, template_id: str, update=None) -> InlineKeyboardMarkup:
        """构建币种选择键盘"""
        rows: List[List[InlineKeyboardButton]] = []

        # 币种按钮（每行 2 个）
        row = []
        for symbol in DEFAULT_SYMBOLS:
            display = symbol.replace("USDT", "")
            row.append(InlineKeyboardButton(display, callback_data=f"vis_symbol_{template_id}_{symbol}"))
            if len(row) == 2:
                rows.append(row)
                row = []
        if row:
            rows.append(row)

        # 返回
        rows.append([
            InlineKeyboardButton(_t(update, "btn.back", "⬅️ 返回"), callback_data="vis_menu"),
            InlineKeyboardButton(_t(update, "btn.back_home", "🏠 主菜单"), callback_data="main_menu"),
        ])

        return InlineKeyboardMarkup(rows)

    def build_interval_keyboard(self, template_id: str, symbol: str, update=None) -> InlineKeyboardMarkup:
        """构建周期选择键盘"""
        template = VIS_TEMPLATES.get(template_id, {})
        intervals = template.get("intervals", ["1h", "4h", "1d"])
        default_interval = template.get("default_interval", "1h")

        rows: List[List[InlineKeyboardButton]] = []

        # 周期按钮
        row = []
        for interval in intervals:
            label = f"✅{interval}" if interval == default_interval else interval
            row.append(InlineKeyboardButton(label, callback_data=f"vis_interval_{template_id}_{symbol}_{interval}"))
            if len(row) == 3:
                rows.append(row)
                row = []
        if row:
            rows.append(row)

        # 返回
        rows.append([
            InlineKeyboardButton(_t(update, "btn.back", "⬅️ 返回"), callback_data=f"vis_template_{template_id}"),
            InlineKeyboardButton(_t(update, "btn.back_home", "🏠 主菜单"), callback_data="main_menu"),
        ])

        return InlineKeyboardMarkup(rows)

    def build_result_keyboard(self, template_id: str, symbol: str, interval: str, update=None) -> InlineKeyboardMarkup:
        """构建结果页面键盘"""
        rows: List[List[InlineKeyboardButton]] = []

        # 刷新和周期切换
        template = VIS_TEMPLATES.get(template_id, {})
        intervals = template.get("intervals", ["1h", "4h", "1d"])

        # 周期快捷切换
        row = []
        for itv in intervals[:4]:  # 最多显示 4 个
            label = f"✅{itv}" if itv == interval else itv
            row.append(InlineKeyboardButton(label, callback_data=f"vis_interval_{template_id}_{symbol}_{itv}"))
        if row:
            rows.append(row)

        # 控制行
        rows.append([
            InlineKeyboardButton(_t(update, "btn.refresh", "🔄 刷新"), callback_data=f"vis_interval_{template_id}_{symbol}_{interval}"),
            InlineKeyboardButton(_t(update, "btn.back", "⬅️ 返回"), callback_data="vis_menu"),
            InlineKeyboardButton(_t(update, "btn.back_home", "🏠 主菜单"), callback_data="main_menu"),
        ])

        return InlineKeyboardMarkup(rows)

    async def render_chart(self, template_id: str, symbol: str, interval: str, update=None) -> Tuple[Optional[bytes], str]:
        """渲染图表"""
        try:
            from templates.registry import register_defaults

            registry = register_defaults()
            result = registry.get(template_id)
            if not result:
                return None, f"未知模板: {template_id}"

            meta, render_fn = result

            # 构建参数
            params = {
                "symbol": symbol,
                "interval": interval,
                "periods": 10,
                "show_ohlc": True,
            }

            # 添加标题
            template = VIS_TEMPLATES.get(template_id, {})
            name = _t(update, template.get("name_key", ""), template.get("name_fallback", template_id))
            params["title"] = f"{symbol} {name} - {interval}"

            # 渲染
            data, content_type = render_fn(params, "png")
            if content_type == "image/png":
                return data, ""
            else:
                return None, "渲染失败"

        except Exception as e:
            logger.error(f"渲染图表失败: {e}", exc_info=True)
            return None, str(e)

    async def handle_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
        """处理回调"""
        query = update.callback_query
        if not query:
            return False

        data = query.data
        user_id = query.from_user.id

        # 可视化菜单
        if data == "vis_menu":
            await query.answer()
            text = _t(update, "vis.menu.title", "📈 选择图表类型")
            keyboard = self.build_vis_menu_keyboard(update)
            await query.edit_message_text(text, reply_markup=keyboard)
            return True

        # 选择模板
        if data.startswith("vis_template_"):
            template_id = data.replace("vis_template_", "")
            await query.answer()

            template = VIS_TEMPLATES.get(template_id)
            if not template:
                await query.edit_message_text(_t(update, "error.unknown_template", "未知模板"))
                return True

            self._set_user_state(user_id, template=template_id)

            if template.get("supports_symbol"):
                # 需要选择币种
                name = _t(update, template["name_key"], template["name_fallback"])
                text = _t(update, "vis.select_symbol", f"{name}\n选择币种：", name=name)
                keyboard = self.build_symbol_keyboard(template_id, update)
                await query.edit_message_text(text, reply_markup=keyboard)
            else:
                # 直接选择周期
                name = _t(update, template["name_key"], template["name_fallback"])
                text = _t(update, "vis.select_interval", f"{name}\n选择周期：", name=name)
                keyboard = self.build_interval_keyboard(template_id, "", update)
                await query.edit_message_text(text, reply_markup=keyboard)
            return True

        # 选择币种
        if data.startswith("vis_symbol_"):
            parts = data.replace("vis_symbol_", "").split("_", 1)
            if len(parts) < 2:
                return False
            template_id, symbol = parts
            await query.answer()

            self._set_user_state(user_id, symbol=symbol)

            template = VIS_TEMPLATES.get(template_id, {})
            name = _t(update, template.get("name_key", ""), template.get("name_fallback", ""))
            text = _t(update, "vis.select_interval", f"{name} - {symbol}\n选择周期：", name=name, symbol=symbol)
            keyboard = self.build_interval_keyboard(template_id, symbol, update)
            await query.edit_message_text(text, reply_markup=keyboard)
            return True

        # 选择周期并渲染
        if data.startswith("vis_interval_"):
            parts = data.replace("vis_interval_", "").split("_")
            if len(parts) < 3:
                return False
            template_id = parts[0]
            symbol = parts[1]
            interval = parts[2]

            await query.answer(_t(update, "vis.rendering", "正在渲染..."))

            self._set_user_state(user_id, interval=interval)

            # 渲染图表
            image_data, error = await self.render_chart(template_id, symbol, interval, update)

            if error:
                await query.edit_message_text(
                    _t(update, "vis.render_error", f"渲染失败: {error}", error=error),
                    reply_markup=self.build_result_keyboard(template_id, symbol, interval, update)
                )
                return True

            # 发送图片
            import io
            keyboard = self.build_result_keyboard(template_id, symbol, interval, update)

            try:
                # 尝试编辑为图片
                await query.message.delete()
                await context.bot.send_photo(
                    chat_id=query.message.chat_id,
                    photo=io.BytesIO(image_data),
                    caption=f"{symbol} - {interval}",
                    reply_markup=keyboard,
                )
            except Exception as e:
                logger.warning(f"发送图片失败: {e}")
                # 降级为发送新消息
                await context.bot.send_photo(
                    chat_id=query.message.chat_id,
                    photo=io.BytesIO(image_data),
                    caption=f"{symbol} - {interval}",
                    reply_markup=keyboard,
                )

            return True

        return False


# 全局实例
_vis_handler: Optional[VisHandler] = None


def get_vis_handler() -> VisHandler:
    """获取可视化处理器实例"""
    global _vis_handler
    if _vis_handler is None:
        _vis_handler = VisHandler()
    return _vis_handler


async def vis_callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """可视化回调处理入口"""
    handler = get_vis_handler()
    return await handler.handle_callback(update, context)
