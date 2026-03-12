"""Obsidian Note Parser - Updated for bilingual fields"""
from decimal import Decimal
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import re
import yaml

try:
    from ..models.strategy import StrategyCard
    from ..models.trade import AccountType, TradeDirection, TradeRecord, TradeResult
except ImportError:
    from models.strategy import StrategyCard
    from models.trade import AccountType, TradeDirection, TradeRecord, TradeResult


class ObsidianParser:
    """Obsidian 笔记解析器 - 支持双语字段"""
    
    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
    
    def parse_trades(self) -> List[TradeRecord]:
        """解析交易记录"""
        trades = []
        
        # 遍历所有 markdown 文件
        for md_file in self.base_path.rglob("*.md"):
            try:
                trade = self._parse_trade_file(md_file)
                if trade:
                    trades.append(trade)
            except Exception as e:
                print(f"Error parsing {md_file}: {e}")
        
        return trades
    
    def parse_strategies(self) -> List[StrategyCard]:
        """解析策略卡片"""
        strategies = []
        
        for md_file in self.base_path.rglob("*.md"):
            try:
                strategy = self._parse_strategy_file(md_file)
                if strategy:
                    strategies.append(strategy)
            except Exception as e:
                print(f"Error parsing {md_file}: {e}")
        
        return strategies
    
    def _get_field(self, frontmatter: Dict, *keys) -> Any:
        """获取字段值（支持多语言键名）"""
        for key in keys:
            if key in frontmatter:
                return frontmatter[key]
        return None
    
    def _parse_trade_file(self, file_path: Path) -> Optional[TradeRecord]:
        """解析单个交易笔记"""
        content = file_path.read_text(encoding='utf-8')
        
        # 提取 frontmatter
        frontmatter = self._extract_frontmatter(content)
        if not frontmatter:
            return None
        
        # 检查是否是交易记录
        if not self._is_trade_note(frontmatter):
            return None
        
        ticker = self._get_field(frontmatter, '品种/ticker', 'symbol', 'ticker')
        direction = self._get_field(frontmatter, '方向/direction', 'direction')
        
        # 解析账户类型
        account_type_str = self._get_field(frontmatter, '账户类型/account_type', 'account_type', 'account')
        account_type = self._parse_account_type(account_type_str)
        
        # 解析结果
        result = self._parse_result(
            self._get_field(frontmatter, '结果/outcome', 'outcome', 'result')
        )
        
        # 解析净利润/PnL
        net_profit = self._parse_decimal(
            self._get_field(frontmatter, '净利润/net_profit', 'net_profit', 'pnl', 'pnl_money')
        )
        
        # 解析R值
        pnl_r = self._parse_decimal(
            self._get_field(frontmatter, 'r', 'R', 'pnl_r')
        )
        
        # 解析日期
        trade_date = self._parse_date(
            self._get_field(frontmatter, 'date', '交易日期/trade_date')
        ) or date.fromtimestamp(file_path.stat().st_mtime)
        
        return TradeRecord(
            trade_date=trade_date,
            symbol=str(ticker).split()[0],  # 提取 "ES" 从 "ES (标普)"
            direction=self._parse_direction(direction),
            entry_price=self._parse_decimal(
                self._get_field(frontmatter, '入场/entry_price', 'entry_price')
            ),
            exit_price=self._parse_decimal(
                self._get_field(frontmatter, '出场/exit_price', 'exit_price')
            ),
            stop_loss=self._parse_decimal(
                self._get_field(frontmatter, '止损/stop_loss', 'stop_loss')
            ),
            take_profit=self._parse_decimal(
                self._get_field(frontmatter, '目标位/take_profit', 'take_profit')
            ),
            position_size=self._parse_decimal(
                self._get_field(frontmatter, '仓位/position_size', 'position_size')
            ),
            risk_percent=self._parse_decimal(
                self._get_field(frontmatter, '风险/risk_percent', 'risk_percent')
            ),
            result=result,
            pnl_money=net_profit,
            pnl_r=pnl_r,
            account_type=account_type,
            strategy_name=self._extract_strategy_name(
                self._get_field(frontmatter, '策略名称/strategy_name', 'strategy_name', 'setup')
            ),
            setup_key=self._get_field(frontmatter, 'setup_key', 'setupKey'),
            patterns=self._parse_list(
                self._get_field(frontmatter, '观察到的形态/patterns_observed', 'patterns_observed', 'patterns')
            ),
            note_path=str(file_path.relative_to(self.base_path)),
            note_title=self._get_field(frontmatter, 'title', '封面/cover') or file_path.stem,
            tags=self._parse_list(frontmatter.get('tags')),
            market_cycle=self._extract_market_cycle(
                self._get_field(frontmatter, '市场周期/market_cycle', 'market_cycle')
            ),
            always_in=self._parse_always_in(
                self._get_field(frontmatter, '总是方向/always_in', 'always_in')
            ),
            entry_bar=None,
            raw_frontmatter=self._serialize_frontmatter(frontmatter),
        )
    
    def _parse_strategy_file(self, file_path: Path) -> Optional[StrategyCard]:
        """解析单个策略笔记"""
        content = file_path.read_text(encoding='utf-8')
        
        frontmatter = self._extract_frontmatter(content)
        if not frontmatter:
            return None
        
        # 检查是否是策略笔记
        if not self._is_strategy_note(frontmatter, file_path):
            return None
        
        # 提取规则（从正文）
        rules = self._extract_rules(content)
        
        name = (self._get_field(frontmatter, 'name', 'title', '策略名称/strategy_name') 
                or file_path.stem)
        
        return StrategyCard(
            name=name,
            canonical_name=self._get_field(frontmatter, 'canonical_name'),
            category=self._get_field(frontmatter, '分类/category', 'category', 'setup_category'),
            setup_type=self._get_field(frontmatter, 'setup_type', '设置类别/setup_category'),
            path=str(file_path.relative_to(self.base_path)),
            description=self._get_field(frontmatter, 'description', '描述/description'),
            rules=rules,
            examples=self._parse_list(frontmatter.get('examples')),
            srs_enabled=frontmatter.get('srs_enabled', False),
            srs_due_date=self._parse_datetime(frontmatter.get('srs_due')),
            srs_interval=frontmatter.get('srs_interval'),
            tags=self._parse_list(frontmatter.get('tags')),
            raw_frontmatter=frontmatter,
        )
    
    def _extract_frontmatter(self, content: str) -> Optional[Dict[str, Any]]:
        """提取 YAML frontmatter"""
        if not content.startswith('---'):
            return None
        
        end_match = re.search(r'\n---\s*\n', content[3:])
        if not end_match:
            return None
        
        yaml_content = content[3:3+end_match.start()]
        try:
            return yaml.safe_load(yaml_content) or {}
        except yaml.YAMLError:
            return None
    
    def _is_trade_note(self, frontmatter: Dict) -> bool:
        """判断是否是交易记录"""
        # 有品种和方向字段的是交易
        has_ticker = bool(self._get_field(frontmatter, '品种/ticker', 'symbol', 'ticker'))
        has_direction = bool(self._get_field(frontmatter, '方向/direction', 'direction'))
        
        # 或者有 PA/Trade 标签的也认为是交易
        tags = frontmatter.get('tags', [])
        if isinstance(tags, str):
            tags = [tags]
        has_trade_tag = any('PA/Trade' in str(t) for t in tags)
        
        # 或者有交易日记分类
        categories = frontmatter.get('categories', [])
        if isinstance(categories, str):
            categories = [categories]
        has_trade_category = any('交易' in str(c) for c in categories)
        
        return (has_ticker and has_direction) or (has_trade_tag and has_ticker) or (has_trade_category and has_ticker)
    
    def _is_strategy_note(self, frontmatter: Dict, file_path: Path) -> bool:
        """判断是否是策略笔记"""
        path_str = str(file_path).lower()
        is_strategy_path = any(kw in path_str for kw in ['setup', '策略', 'strat', 'setups 策略'])
        has_strategy_fields = bool(
            self._get_field(frontmatter, 'setup_type', '设置类别/setup_category') or 
            self._get_field(frontmatter, 'category', '分类/category')
        )
        return is_strategy_path or has_strategy_fields
    
    def _extract_rules(self, content: str) -> List[str]:
        """从正文提取规则列表"""
        parts = content.split('---', 2)
        if len(parts) >= 3:
            body = parts[2]
        else:
            body = content
        
        rules = []
        rule_section = re.search(r'##?\s*(?:规则|Rules).*?\n(.*?)(?=##|\Z)', body, re.DOTALL | re.IGNORECASE)
        if rule_section:
            section = rule_section.group(1)
            for line in section.split('\n'):
                match = re.match(r'[-*]\s+(.+)', line.strip())
                if match:
                    rules.append(match.group(1))
        
        return rules
    
    def _parse_account_type(self, value) -> AccountType:
        """解析账户类型"""
        if not value:
            return AccountType.LIVE
        value_str = str(value).lower()
        if any(kw in value_str for kw in ['demo', '模拟']):
            return AccountType.DEMO
        elif any(kw in value_str for kw in ['backtest', '回测', '复盘']):
            return AccountType.BACKTEST
        return AccountType.LIVE
    
    def _parse_date(self, value) -> Optional[date]:
        """解析日期"""
        if not value:
            return None
        if isinstance(value, date):
            return value
        if isinstance(value, datetime):
            return value.date()
        try:
            return date.fromisoformat(str(value))
        except (ValueError, TypeError):
            return None
    
    def _parse_datetime(self, value) -> Optional[datetime]:
        """解析日期时间"""
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value))
        except (ValueError, TypeError):
            return None
    
    def _parse_decimal(self, value) -> Optional[Decimal]:
        """解析 Decimal"""
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (ValueError, TypeError):
            return None
    
    def _parse_direction(self, value) -> TradeDirection:
        """解析方向"""
        if not value:
            return TradeDirection.LONG
        value_str = str(value).lower()
        if any(kw in value_str for kw in ['short', 'sell', '空', '做空', 'short']):
            return TradeDirection.SHORT
        return TradeDirection.LONG
    
    def _parse_result(self, value) -> Optional[TradeResult]:
        """解析结果"""
        if not value:
            return None
        value_str = str(value).lower()
        if any(kw in value_str for kw in ['win', 'w', '盈利', '赢', '胜']):
            return TradeResult.WIN
        elif any(kw in value_str for kw in ['loss', 'l', '亏损', '输', '败']):
            return TradeResult.LOSS
        elif any(kw in value_str for kw in ['be', 'breakeven', '平', '持平']):
            return TradeResult.BREAKEVEN
        return None
    
    def _parse_list(self, value) -> List[str]:
        """解析列表"""
        if not value:
            return []
        if isinstance(value, list):
            return [str(v).strip() for v in value if v]
        if isinstance(value, str):
            return [v.strip() for v in value.split(',') if v.strip()]
        return []
    
    def _extract_strategy_name(self, value) -> Optional[str]:
        """提取策略名称（移除括号内容）"""
        if not value:
            return None
        # 从 "20均线缺口 (20 EMA Gap Bar)" 提取 "20均线缺口"
        name = str(value).split('(')[0].strip()
        return name if name else None
    
    def _extract_market_cycle(self, value) -> Optional[str]:
        """提取市场周期（移除英文）"""
        if not value:
            return None
        # 从 "强趋势 (Strong Trend)" 提取 "强趋势"
        cycle = str(value).split('(')[0].strip()
        return cycle if cycle else None
    
    def _parse_always_in(self, value) -> Optional[str]:
        """解析 always_in 字段（支持列表或字符串）"""
        if not value:
            return None
        if isinstance(value, list):
            # 取列表第一个元素
            value = value[0] if value else None
        if value:
            # 从 "总是多头 (Always In Long)" 提取中文部分
            return str(value).split('(')[0].strip()
        return None
    
    def _serialize_frontmatter(self, frontmatter: Dict) -> Dict[str, Any]:
        """序列化 frontmatter（处理日期等不可序列化类型）"""
        if not frontmatter:
            return {}
        
        def serialize_value(v):
            if isinstance(v, (date, datetime)):
                return v.isoformat()
            if isinstance(v, list):
                return [serialize_value(item) for item in v]
            if isinstance(v, dict):
                return {k: serialize_value(val) for k, val in v.items()}
            return v
        
        return {k: serialize_value(v) for k, v in frontmatter.items()}
