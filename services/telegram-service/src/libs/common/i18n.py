"""轻量级 i18n 工具 - Vendored Copy"""
from __future__ import annotations
import gettext
import os
import logging
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Optional

# Docker 环境路径
REPO_ROOT = Path("/app") 
DEFAULT_LOCALE_DIR = REPO_ROOT / "locales"
logger = logging.getLogger(__name__)

def normalize_locale(lang: Optional[str]) -> Optional[str]:
    if not lang: return None
    code = lang.strip().replace("-", "_")
    if not code: return None
    lower = code.lower()
    zh_cn_aliases = {"zh", "zh_cn", "zh_hans", "zh_cn_hans", "zh_hans_cn"}
    zh_tw_aliases = {"zh_tw", "zh_hant", "zh_hk", "zh_hant_tw", "zh_hant_hk"}
    if lower in zh_cn_aliases: return "zh_CN"
    if lower in zh_tw_aliases: return "zh_TW"
    parts = code.split("_", 1)
    if len(parts) == 1: return parts[0].lower()
    return f"{parts[0].lower()}_{parts[1].upper()}"

def parse_supported_locales(raw: Optional[str]) -> list[str]:
    if not raw: return []
    locales: list[str] = []
    for item in raw.split(","):
        norm = normalize_locale(item)
        if norm: locales.append(norm)
    return locales

class I18nService:
    def __init__(self, *, locale_dir: Path | str = DEFAULT_LOCALE_DIR, domain: str = "bot", default_locale: Optional[str] = "en", fallback_locale: Optional[str] = None, supported_locales: Optional[Iterable[str]] = None) -> None:
        self.locale_dir = Path(locale_dir)
        self.domain = domain
        self.default_locale = normalize_locale(default_locale) or "en"
        self.fallback_locale = normalize_locale(fallback_locale) or self.default_locale
        parsed = [normalize_locale(x) for x in (supported_locales or []) if normalize_locale(x)]
        self.supported_locales = parsed or [self.default_locale, "en"]
        self._missing_keys: set[tuple[str, str]] = set()
        if not self.locale_dir.exists():
            self.locale_dir.mkdir(parents=True, exist_ok=True)

    def resolve(self, lang: Optional[str]) -> str:
        norm = normalize_locale(lang)
        if norm and norm in self.supported_locales: return norm
        if norm and norm.startswith("zh"):
            if "zh_CN" in self.supported_locales: return "zh_CN"
            if "zh_TW" in self.supported_locales: return "zh_TW"
        return self.default_locale if self.default_locale in self.supported_locales else self.supported_locales[0]

    @lru_cache(maxsize=16)
    def _translation(self, lang: str):
        return gettext.translation(self.domain, localedir=str(self.locale_dir), languages=[lang, self.fallback_locale], fallback=True)

    def gettext(self, message_id: str, lang: Optional[str] = None, **kwargs) -> str:
        if not isinstance(message_id, str): return str(message_id)
        resolved = self.resolve(lang)
        text = self._translation(resolved).gettext(message_id)
        if kwargs:
            try: return text.format(**kwargs)
            except Exception: return text
        return text

    def get_lazy(self, lang: Optional[str] = None):
        def _inner(message_id: str, **kwargs): return self.gettext(message_id, lang=lang, **kwargs)
        return _inner

def build_i18n_from_env(locale_dir: Path | str = DEFAULT_LOCALE_DIR) -> I18nService:
    default_locale = os.getenv("DEFAULT_LOCALE", "en")
    fallback_locale = os.getenv("FALLBACK_LOCALE", default_locale)
    supported_locales = parse_supported_locales(os.getenv("SUPPORTED_LOCALES", "zh-CN,en"))
    return I18nService(locale_dir=locale_dir, domain="bot", default_locale=default_locale, fallback_locale=fallback_locale, supported_locales=supported_locales)
