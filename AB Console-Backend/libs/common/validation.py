"""
输入验证和序列化
统一的请求验证和数据校验
"""
from typing import Optional, List, Dict, Any, TypeVar, Generic
from dataclasses import dataclass, field
from datetime import datetime
import re

T = TypeVar('T')


class ValidationError(Exception):
    """验证错误"""
    def __init__(self, message: str, field: Optional[str] = None, code: str = "validation_error"):
        self.message = message
        self.field = field
        self.code = code
        super().__init__(message)
    
    def to_dict(self) -> dict:
        return {
            "error": self.code,
            "message": self.message,
            "field": self.field
        }


class ValidationErrors(Exception):
    """多个验证错误"""
    def __init__(self, errors: List[ValidationError]):
        self.errors = errors
        super().__init__(f"验证失败: {len(errors)} 个错误")
    
    def to_dict(self) -> list:
        return [e.to_dict() for e in self.errors]


# 字段验证器
class FieldValidator:
    """字段验证器基类"""
    
    def __init__(self, required: bool = True, allow_none: bool = False):
        self.required = required
        self.allow_none = allow_none
    
    def validate(self, value: Any, field_name: str) -> Any:
        """验证字段值"""
        # 检查必填
        if value is None:
            if self.required and not self.allow_none:
                raise ValidationError(f"{field_name} 是必填字段", field_name)
            return None
        
        return self._validate(value, field_name)
    
    def _validate(self, value: Any, field_name: str) -> Any:
        """子类重写验证逻辑"""
        return value


class StringField(FieldValidator):
    """字符串字段"""
    
    def __init__(
        self,
        required: bool = True,
        allow_none: bool = False,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
        pattern: Optional[str] = None,
        choices: Optional[List[str]] = None
    ):
        super().__init__(required, allow_none)
        self.min_length = min_length
        self.max_length = max_length
        self.pattern = re.compile(pattern) if pattern else None
        self.choices = choices
    
    def _validate(self, value: Any, field_name: str) -> str:
        if not isinstance(value, str):
            raise ValidationError(f"{field_name} 必须是字符串", field_name)
        
        if self.min_length is not None and len(value) < self.min_length:
            raise ValidationError(
                f"{field_name} 长度不能小于 {self.min_length}",
                field_name
            )
        
        if self.max_length is not None and len(value) > self.max_length:
            raise ValidationError(
                f"{field_name} 长度不能大于 {self.max_length}",
                field_name
            )
        
        if self.pattern and not self.pattern.match(value):
            raise ValidationError(
                f"{field_name} 格式不正确",
                field_name
            )
        
        if self.choices and value not in self.choices:
            raise ValidationError(
                f"{field_name} 必须是以下之一: {', '.join(self.choices)}",
                field_name
            )
        
        return value


class IntegerField(FieldValidator):
    """整数字段"""
    
    def __init__(
        self,
        required: bool = True,
        allow_none: bool = False,
        min_value: Optional[int] = None,
        max_value: Optional[int] = None
    ):
        super().__init__(required, allow_none)
        self.min_value = min_value
        self.max_value = max_value
    
    def _validate(self, value: Any, field_name: str) -> int:
        try:
            value = int(value)
        except (TypeError, ValueError):
            raise ValidationError(f"{field_name} 必须是整数", field_name)
        
        if self.min_value is not None and value < self.min_value:
            raise ValidationError(
                f"{field_name} 不能小于 {self.min_value}",
                field_name
            )
        
        if self.max_value is not None and value > self.max_value:
            raise ValidationError(
                f"{field_name} 不能大于 {self.max_value}",
                field_name
            )
        
        return value


class FloatField(FieldValidator):
    """浮点数字段"""
    
    def __init__(
        self,
        required: bool = True,
        allow_none: bool = False,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None
    ):
        super().__init__(required, allow_none)
        self.min_value = min_value
        self.max_value = max_value
    
    def _validate(self, value: Any, field_name: str) -> float:
        try:
            value = float(value)
        except (TypeError, ValueError):
            raise ValidationError(f"{field_name} 必须是数字", field_name)
        
        if self.min_value is not None and value < self.min_value:
            raise ValidationError(
                f"{field_name} 不能小于 {self.min_value}",
                field_name
            )
        
        if self.max_value is not None and value > self.max_value:
            raise ValidationError(
                f"{field_name} 不能大于 {self.max_value}",
                field_name
            )
        
        return value


class BooleanField(FieldValidator):
    """布尔字段"""
    
    def _validate(self, value: Any, field_name: str) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'on')
        return bool(value)


class ListField(FieldValidator):
    """列表字段"""
    
    def __init__(
        self,
        item_validator: FieldValidator = None,
        required: bool = True,
        allow_none: bool = False,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None
    ):
        super().__init__(required, allow_none)
        self.item_validator = item_validator
        self.min_length = min_length
        self.max_length = max_length
    
    def _validate(self, value: Any, field_name: str) -> list:
        if not isinstance(value, (list, tuple)):
            raise ValidationError(f"{field_name} 必须是列表", field_name)
        
        if self.min_length is not None and len(value) < self.min_length:
            raise ValidationError(
                f"{field_name} 至少需要 {self.min_length} 个元素",
                field_name
            )
        
        if self.max_length is not None and len(value) > self.max_length:
            raise ValidationError(
                f"{field_name} 最多只能有 {self.max_length} 个元素",
                field_name
            )
        
        if self.item_validator:
            return [
                self.item_validator.validate(item, f"{field_name}[{i}]")
                for i, item in enumerate(value)
            ]
        
        return list(value)


# 交易相关的验证器
class SymbolValidator(StringField):
    """交易对验证器"""
    
    def __init__(self, required: bool = True, allow_none: bool = False):
        super().__init__(
            required=required,
            allow_none=allow_none,
            pattern=r'^[A-Z0-9]+USDT$'
        )
    
    def _validate(self, value: Any, field_name: str) -> str:
        value = super()._validate(value, field_name)
        
        # 检查是否在屏蔽列表
        blocked_symbols = {'BNXUSDT', 'ALPACAUSDT'}  # 可配置
        if value in blocked_symbols:
            raise ValidationError(
                f"{field_name} '{value}' 在屏蔽列表中",
                field_name
            )
        
        return value


class TimeframeValidator(StringField):
    """时间周期验证器"""
    
    VALID_TIMEFRAMES = {'1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'}
    
    def __init__(self, required: bool = True, allow_none: bool = False):
        super().__init__(
            required=required,
            allow_none=allow_none,
            choices=list(self.VALID_TIMEFRAMES)
        )


# 验证器类
class Validator:
    """数据验证器"""
    
    def __init__(self, **fields: FieldValidator):
        self.fields = fields
    
    def validate(self, data: dict) -> dict:
        """验证数据"""
        errors = []
        result = {}
        
        for field_name, validator in self.fields.items():
            value = data.get(field_name)
            try:
                result[field_name] = validator.validate(value, field_name)
            except ValidationError as e:
                errors.append(e)
        
        if errors:
            raise ValidationErrors(errors)
        
        return result


# 常用验证器实例
signal_validator = Validator(
    symbol=SymbolValidator(),
    direction=StringField(choices=['BUY', 'SELL']),
    timeframe=TimeframeValidator(),
    strength=FloatField(min_value=0.0, max_value=1.0),
    price=FloatField(min_value=0.0, required=False),
    volume=FloatField(min_value=0.0, required=False)
)

query_validator = Validator(
    symbol=SymbolValidator(required=False),
    timeframe=TimeframeValidator(required=False),
    limit=IntegerField(min_value=1, max_value=1000, required=False),
    start_time=StringField(required=False),  # ISO格式时间
    end_time=StringField(required=False)
)


# Pydantic模型（如果可用）
try:
    from pydantic import BaseModel, Field, validator
    from typing import Literal
    
    class SignalRequest(BaseModel):
        """信号请求模型"""
        symbol: str = Field(..., regex=r'^[A-Z0-9]+USDT$', description="交易对")
        direction: Literal['BUY', 'SELL'] = Field(..., description="方向")
        timeframe: str = Field(..., regex=r'^(1m|5m|15m|1h|4h|1d)$', description="时间周期")
        strength: float = Field(..., ge=0.0, le=1.0, description="信号强度")
        price: Optional[float] = Field(None, gt=0, description="价格")
        
        @validator('symbol')
        def validate_symbol(cls, v):
            blocked = {'BNXUSDT', 'ALPACAUSDT'}
            if v in blocked:
                raise ValueError(f'{v} 在屏蔽列表中')
            return v
    
    class SignalQuery(BaseModel):
        """信号查询模型"""
        symbol: Optional[str] = Field(None, regex=r'^[A-Z0-9]+USDT$')
        timeframe: Optional[str] = Field(None, regex=r'^(1m|5m|15m|1h|4h|1d)$')
        limit: int = Field(100, ge=1, le=1000)
        
except ImportError:
    # Pydantic不可用，使用上面的基础验证器
    SignalRequest = None
    SignalQuery = None
