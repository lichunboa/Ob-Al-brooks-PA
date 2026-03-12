"""Brooks 目标磁体与路径路由。"""

from __future__ import annotations

from typing import Any

from .parsing import safe_float


def _normalize_side(side: str) -> str:
    return "BUY" if str(side or "").upper() == "BUY" else "SELL"


def _distance(entry_price: float, price: float) -> float:
    return abs(float(price or 0.0) - float(entry_price or 0.0))


def _kind_weight(kind: str) -> float:
    normalized = str(kind or "").lower()
    if normalized.startswith("measured_move"):
        return 4.0
    if normalized == "session_open":
        return 1.7
    if normalized == "tr_midline":
        return 1.4
    if normalized in {"major_swing", "prior_level"}:
        return 3.2
    if "gap" in normalized:
        return 2.7
    if normalized == "round_number":
        return 2.0
    if normalized == "ema20":
        return 1.0
    return 1.5


def _is_same_price(left: float, right: float, entry_price: float) -> bool:
    tolerance = max(abs(float(entry_price or 0.0)) * 0.0005, 1e-8)
    return abs(float(left or 0.0) - float(right or 0.0)) <= tolerance


def _append_unique(targets: list[dict[str, Any]], item: dict[str, Any], entry_price: float) -> None:
    price = safe_float(item.get("price"), 0.0)
    if price <= 0:
        return
    enriched = dict(item)
    enriched["weight"] = float(item.get("weight") or _kind_weight(str(item.get("kind") or "")))
    for existing in targets:
        if _is_same_price(safe_float(existing.get("price"), 0.0), price, entry_price):
            if float(enriched.get("weight") or 0.0) > float(existing.get("weight") or 0.0):
                existing.update(enriched)
            return
    targets.append(enriched)


def _extract_prices(source: Any) -> list[float]:
    values: list[float] = []
    if isinstance(source, (list, tuple)):
        for item in source:
            values.extend(_extract_prices(item))
        return values
    if isinstance(source, dict):
        if "price" in source:
            price = safe_float(source.get("price"), 0.0)
            if price > 0:
                values.append(price)
        return values
    price = safe_float(source, 0.0)
    if price > 0:
        values.append(price)
    return values


def _cluster_tolerance(entry_price: float, risk: float) -> float:
    return max(abs(float(entry_price or 0.0)) * 0.0015, abs(float(risk or 0.0)) * 0.35, 1e-8)


def _cluster_magnets(
    magnets: list[dict[str, Any]],
    entry_price: float,
    risk: float,
) -> list[dict[str, Any]]:
    tolerance = _cluster_tolerance(entry_price, risk)
    ordered = sorted(magnets, key=lambda item: _distance(entry_price, safe_float(item.get("price"), 0.0)))
    clusters: list[dict[str, Any]] = []
    for item in ordered:
        price = safe_float(item.get("price"), 0.0)
        if price <= 0:
            continue
        if not clusters:
            clusters.append({"prices": [price], "members": [item]})
            continue
        anchor = safe_float(clusters[-1]["prices"][0], 0.0)
        if abs(price - anchor) <= tolerance:
            clusters[-1]["prices"].append(price)
            clusters[-1]["members"].append(item)
        else:
            clusters.append({"prices": [price], "members": [item]})

    summary: list[dict[str, Any]] = []
    for cluster in clusters:
        members = cluster["members"]
        center = sum(safe_float(member.get("price"), 0.0) for member in members) / max(len(members), 1)
        strongest = max(members, key=lambda member: float(member.get("weight") or 0.0))
        strength = sum(float(member.get("weight") or 0.0) for member in members)
        summary.append(
            {
                "price": center,
                "kind": str(strongest.get("kind") or ""),
                "source": str(strongest.get("source") or ""),
                "strength": strength,
                "count": len(members),
                "members": members,
            }
        )
    summary.sort(
        key=lambda item: (
            _distance(entry_price, safe_float(item.get("price"), 0.0)),
            -float(item.get("strength") or 0.0),
        )
    )
    return summary


def build_target_magnets(
    side: str,
    entry_price: float,
    *,
    ab_sr: dict[str, Any] | None = None,
    ab_mm: dict[str, Any] | None = None,
    key_levels: dict[str, Any] | None = None,
    ema20: float | None = None,
) -> list[dict[str, Any]]:
    """把 MM / 前高前低 / 整数 / gap / EMA 统一成可排序磁体。"""
    normalized_side = _normalize_side(side)
    ab_sr = ab_sr if isinstance(ab_sr, dict) else {}
    ab_mm = ab_mm if isinstance(ab_mm, dict) else {}
    key_levels = key_levels if isinstance(key_levels, dict) else {}

    def in_trade_direction(price: float) -> bool:
        if normalized_side == "BUY":
            return price > entry_price
        return 0 < price < entry_price

    targets: list[dict[str, Any]] = []

    mm_key = "nearest_bull_target" if normalized_side == "BUY" else "nearest_bear_target"
    mm_item = ab_mm.get(mm_key)
    mm_price = 0.0
    mm_kind = "measured_move"
    if isinstance(mm_item, dict):
        mm_price = safe_float(mm_item.get("price"), 0.0)
        mm_kind = str(mm_item.get("type") or "measured_move")
    else:
        mm_price = safe_float(mm_item, 0.0)
    if in_trade_direction(mm_price):
        _append_unique(
            targets,
            {"price": mm_price, "kind": mm_kind, "source": "ab_mm"},
            entry_price,
        )

    opposing_key = "resistance" if normalized_side == "BUY" else "support"
    for price in _extract_prices(key_levels.get(opposing_key)):
        if in_trade_direction(price):
            _append_unique(
                targets,
                {"price": price, "kind": "prior_level", "source": f"key_levels.{opposing_key}"},
                entry_price,
            )

    nearest_key = "nearest_resistance" if normalized_side == "BUY" else "nearest_support"
    nearest_price = safe_float(ab_sr.get(nearest_key), 0.0)
    if in_trade_direction(nearest_price):
        _append_unique(
            targets,
            {"price": nearest_price, "kind": "prior_level", "source": f"ab_sr.{nearest_key}"},
            entry_price,
        )

    major_key = "major_lh" if normalized_side == "BUY" else "major_hl"
    major_price = safe_float(ab_sr.get(major_key), 0.0)
    if in_trade_direction(major_price):
        _append_unique(
            targets,
            {"price": major_price, "kind": "major_swing", "source": f"ab_sr.{major_key}"},
            entry_price,
        )

    for gap in ab_sr.get("gaps", []) if isinstance(ab_sr.get("gaps"), list) else []:
        if not isinstance(gap, dict):
            continue
        gap_price = safe_float(gap.get("price"), 0.0)
        if gap_price <= 0:
            top = safe_float(gap.get("gap_top"), 0.0)
            bottom = safe_float(gap.get("gap_bottom"), 0.0)
            if top > 0 and bottom > 0:
                gap_price = (top + bottom) / 2.0
        if in_trade_direction(gap_price):
            _append_unique(
                targets,
                {"price": gap_price, "kind": str(gap.get("gap_class") or "gap"), "source": "ab_sr.gaps"},
                entry_price,
            )

    for price in _extract_prices(ab_sr.get("round_numbers")) + _extract_prices(key_levels.get("round")):
        if in_trade_direction(price):
            _append_unique(
                targets,
                {"price": price, "kind": "round_number", "source": "round"},
                entry_price,
            )

    for price in _extract_prices(key_levels.get("midline")):
        if in_trade_direction(price):
            _append_unique(
                targets,
                {"price": price, "kind": "tr_midline", "source": "key_levels.midline"},
                entry_price,
            )

    for price in _extract_prices(key_levels.get("open")):
        if in_trade_direction(price):
            _append_unique(
                targets,
                {"price": price, "kind": "session_open", "source": "key_levels.open"},
                entry_price,
            )

    ema_value = safe_float(ema20, 0.0)
    if in_trade_direction(ema_value):
        _append_unique(
            targets,
            {"price": ema_value, "kind": "ema20", "source": "ema20"},
            entry_price,
        )

    targets.sort(
        key=lambda item: (
            _distance(entry_price, safe_float(item.get("price"), 0.0)),
            -float(item.get("weight") or 0.0),
        )
    )
    return targets


def resolve_target_path(
    side: str,
    entry_price: float,
    planned_target: float,
    *,
    stop_loss: float | None = None,
    market_state: str = "",
    route_style: str = "",
    magnets: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """根据市场状态选择更合理的目标磁体，并判断路径是否受阻。"""
    normalized_side = _normalize_side(side)
    magnets = list(magnets or [])
    planned_target = safe_float(planned_target, 0.0)
    stop_loss = safe_float(stop_loss, 0.0)
    risk = abs(entry_price - stop_loss)
    state_text = str(market_state or "").lower()
    route_text = str(route_style or "").lower()
    tight_range_like = "tight_range" in state_text or "ttr" in state_text
    range_like = "tr" in str(market_state or "").upper() or "range" in state_text or "tr_blshs" in route_text
    breakout_like = "trend" in state_text or "breakout" in route_text or "brooks_breakout" in route_text
    reversal_like = any(token in route_text for token in ("reversal", "mtr", "wedge", "dt_db", "hs"))
    clusters = _cluster_magnets(magnets, entry_price, risk)

    nearest = magnets[0] if magnets else None
    mm_target = next((item for item in magnets if str(item.get("kind") or "").startswith("measured_move")), None)
    midline_target = next((item for item in magnets if str(item.get("kind") or "") == "tr_midline"), None)
    nearest_cluster = clusters[0] if clusters else None
    mm_cluster = next((item for item in clusters if str(item.get("kind") or "").startswith("measured_move")), None)
    midline_cluster = next((item for item in clusters if str(item.get("kind") or "") == "tr_midline"), None)
    prior_cluster = next(
        (item for item in clusters if str(item.get("kind") or "") in {"prior_level", "major_swing"}),
        None,
    )
    non_ema_cluster = next((item for item in clusters if str(item.get("kind") or "") != "ema20"), None)

    recommended = planned_target
    chosen_cluster = None
    if range_like:
        chosen_cluster = midline_cluster or non_ema_cluster or nearest_cluster
    elif breakout_like:
        if mm_cluster is not None:
            chosen_cluster = mm_cluster
        elif prior_cluster is not None:
            chosen_cluster = prior_cluster
        else:
            chosen_cluster = non_ema_cluster or nearest_cluster
    elif reversal_like:
        chosen_cluster = prior_cluster or non_ema_cluster or nearest_cluster
    else:
        if mm_cluster is not None and risk > 0:
            mm_price = safe_float(mm_cluster.get("price"), 0.0)
            if _distance(entry_price, mm_price) >= risk * 1.25:
                chosen_cluster = mm_cluster
        if chosen_cluster is None:
            chosen_cluster = non_ema_cluster or nearest_cluster

    if chosen_cluster is not None:
        recommended = safe_float(chosen_cluster.get("price"), planned_target)

    blocker_cluster = None
    target_distance = _distance(entry_price, planned_target)
    for cluster in clusters:
        cluster_price = safe_float(cluster.get("price"), 0.0)
        cluster_distance = _distance(entry_price, cluster_price)
        cluster_kind = str(cluster.get("kind") or "")
        if target_distance <= 0:
            break
        if cluster_distance + 1e-9 >= target_distance * 0.92:
            continue
        if chosen_cluster is not None and _is_same_price(
            cluster_price,
            safe_float(chosen_cluster.get("price"), 0.0),
            entry_price,
        ):
            continue
        # Brooks 会把中线 / open 当作参考磁体，但在 broad channel reversal
        # 或顺势恢复里，不应把它们当成和 MM / prior high-low 同等级的硬阻塞。
        if cluster_kind in {"tr_midline", "session_open"} and not ("tr_blshs" in route_text or tight_range_like):
            continue
        if float(cluster.get("strength") or 0.0) >= 2.0 or int(cluster.get("count") or 0) >= 2:
            blocker_cluster = cluster
            break

    if normalized_side == "BUY" and recommended <= entry_price:
        recommended = planned_target
    if normalized_side == "SELL" and recommended >= entry_price:
        recommended = planned_target

    primary = (midline_target or nearest) if range_like else (mm_target or nearest)
    if recommended > 0:
        chosen = next(
            (
                item
                for item in magnets
                if _is_same_price(safe_float(item.get("price"), 0.0), recommended, entry_price)
            ),
            None,
        )
        if chosen is not None:
            primary = chosen

    blocker = None
    if blocker_cluster is not None:
        members = blocker_cluster.get("members") if isinstance(blocker_cluster.get("members"), list) else []
        blocker = members[0] if members else blocker_cluster

    path_clear = blocker_cluster is None
    if recommended > 0 and blocker_cluster is not None:
        path_clear = _distance(entry_price, recommended) <= _distance(
            entry_price,
            safe_float(blocker_cluster.get("price"), 0.0),
        ) + 1e-9

    chosen_strength = float(chosen_cluster.get("strength") or 0.0) if isinstance(chosen_cluster, dict) else 0.0
    chosen_count = int(chosen_cluster.get("count") or 0) if isinstance(chosen_cluster, dict) else 0

    return {
        "path_clear": path_clear,
        "recommended_target": recommended,
        "primary_magnet": primary,
        "blocking_magnet": blocker,
        "primary_cluster": chosen_cluster,
        "blocking_cluster": blocker_cluster,
        "magnet_cluster_count": chosen_count,
        "magnet_cluster_strength": chosen_strength,
        "magnet_summary": [
            {
                "price": round(safe_float(item.get("price"), 0.0), 6),
                "kind": str(item.get("kind") or ""),
                "source": str(item.get("source") or ""),
            }
            for item in magnets[:6]
        ],
        "cluster_summary": [
            {
                "price": round(safe_float(item.get("price"), 0.0), 6),
                "kind": str(item.get("kind") or ""),
                "strength": round(float(item.get("strength") or 0.0), 2),
                "count": int(item.get("count") or 0),
            }
            for item in clusters[:4]
        ],
    }
