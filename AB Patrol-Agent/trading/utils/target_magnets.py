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
        return 1.2
    if normalized == "tr_midline":
        return 1.0
    if normalized in {"major_swing", "prior_level"}:
        return 3.2
    if "gap" in normalized:
        return 2.7
    if normalized == "round_number":
        return 1.4
    if normalized == "ema20":
        return 0.8
    return 1.2


def _is_structural_kind(kind: str) -> bool:
    """判断磁体是否属于 Brooks 里的结构性目标。"""
    normalized = str(kind or "").lower()
    return (
        normalized.startswith("measured_move")
        or normalized in {"major_swing", "prior_level"}
        or "gap" in normalized
    )


def _is_soft_reference_kind(kind: str) -> bool:
    """判断磁体是否只是参考位，而不是硬阻挡位。"""
    normalized = str(kind or "").lower()
    return normalized in {"session_open", "tr_midline", "round_number", "ema20"}


def _is_single_prior_level_cluster(cluster: dict[str, Any] | None) -> bool:
    """判断当前簇是否只是一个单独的前高前低阻力。"""
    if not isinstance(cluster, dict):
        return False
    members = cluster.get("members") if isinstance(cluster.get("members"), list) else []
    if len(members) != 1:
        return False
    return str(members[0].get("kind") or "").lower() == "prior_level"


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
    signal_type: str = "",
    signal_bar_quality: float = 0.0,
    follow_through: bool = False,
    higher_follow_through: bool = False,
    broke_micro_extreme: bool = False,
    reclaimed_prior_close: bool = False,
    prior_leg_context: str = "",
) -> dict[str, Any]:
    """根据市场状态选择更合理的目标磁体，并判断路径是否受阻。"""
    normalized_side = _normalize_side(side)
    magnets = list(magnets or [])
    planned_target = safe_float(planned_target, 0.0)
    stop_loss = safe_float(stop_loss, 0.0)
    risk = abs(entry_price - stop_loss)
    state_text = str(market_state or "").lower()
    route_text = str(route_style or "").lower()
    prior_leg_text = str(prior_leg_context or "").lower()
    range_like = "tr" in str(market_state or "").upper() or "range" in state_text or "tr_blshs" in route_text
    signal_label = str(signal_type or "")
    breakout_signal_set = {
        "HOY突破",
        "LOY突破",
        "ii突破",
        "ioi突破",
        "iii突破",
        "收线追进",
        "突破回调",
        "第一均线缺口",
        "20均线缺口",
        "高1",
        "低1",
        "高2",
        "低2",
    }
    breakout_chase_signals = {
        "HOY突破",
        "LOY突破",
        "ii突破",
        "ioi突破",
        "iii突破",
        "收线追进",
    }
    pullback_continuation_signals = {
        "高1",
        "低1",
        "高2",
        "低2",
        "突破回调",
        "20均线缺口",
        "第一均线缺口",
    }
    prior_first_breakout_signals = {
        "HOY突破",
        "LOY突破",
        "ii突破",
        "ioi突破",
        "iii突破",
    }
    breakout_family_signal = signal_label in breakout_signal_set
    breakout_chase_signal = signal_label in breakout_chase_signals
    pullback_continuation_signal = signal_label in pullback_continuation_signals
    follow_through_ready = bool(follow_through or higher_follow_through)
    continuation_leg_context = prior_leg_text in {"trend_leg", "tr_leg", "tr_second_leg", "mixed"}
    breakout_like = (
        breakout_family_signal
        or "trend" in state_text
        or "breakout" in route_text
        or "brooks_breakout" in route_text
    )
    reversal_like = any(token in route_text for token in ("reversal", "mtr", "wedge", "dt_db", "hs"))
    # Brooks 里真正的 breakout chase 和趋势中的 pullback continuation，
    # 第一目标通常不同。前者在强突破时可以直接看更远的 MM，
    # 后者大多数时候仍应先把前高前低当成测试目标，而不是仅凭突破微小极值就跳过。
    strong_breakout_context = False
    tradable_breakout_context = False
    if breakout_chase_signal:
        strong_breakout_context = (
            follow_through_ready
            or signal_bar_quality >= 0.58
            or broke_micro_extreme
            or reclaimed_prior_close
        )
        tradable_breakout_context = strong_breakout_context or signal_bar_quality >= 0.54
    elif pullback_continuation_signal:
        strong_breakout_context = (
            follow_through_ready
            or (broke_micro_extreme and signal_bar_quality >= 0.62)
        )
        tradable_breakout_context = strong_breakout_context or (
            signal_bar_quality >= 0.54 and (follow_through_ready or reclaimed_prior_close)
        )
    elif breakout_family_signal:
        strong_breakout_context = (
            follow_through_ready
            or signal_bar_quality >= 0.58
            or broke_micro_extreme
        )
        tradable_breakout_context = (
            strong_breakout_context
            or reclaimed_prior_close
            or signal_bar_quality >= 0.54
        )
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
    pullback_channel_context = pullback_continuation_signal and (
        range_like
        or "weak_trend" in state_text
        or "channel" in route_text
        or "recovery" in route_text
        or continuation_leg_context
    )
    pullback_mm_ready = pullback_continuation_signal and follow_through_ready and (
        signal_bar_quality >= 0.58 or broke_micro_extreme
    )

    recommended = planned_target
    chosen_cluster = None
    if range_like:
        chosen_cluster = midline_cluster or non_ema_cluster or nearest_cluster
    elif breakout_like:
        # Brooks 里前高前低既是磁体，也是常见的第一目标。
        # 对普通 breakout，更合理的是先把单个 prior level 当测试目标；
        # 只有强突破、且已有明显 follow-through 时，才优先看更远的 measured move。
        if prior_cluster is not None and pullback_channel_context and not pullback_mm_ready:
            chosen_cluster = prior_cluster
        elif prior_cluster is not None and signal_label in prior_first_breakout_signals:
            chosen_cluster = prior_cluster
        elif prior_cluster is not None and pullback_continuation_signal and not strong_breakout_context:
            chosen_cluster = prior_cluster
        elif prior_cluster is not None and breakout_family_signal and not strong_breakout_context:
            chosen_cluster = prior_cluster
        elif mm_cluster is not None:
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
        members = cluster.get("members") if isinstance(cluster.get("members"), list) else []
        structural_members = [
            member
            for member in members
            if _is_structural_kind(str(member.get("kind") or ""))
        ]
        has_structural_member = bool(structural_members)
        major_structural_cluster = any(
            str(member.get("kind") or "").lower().startswith("measured_move")
            or str(member.get("kind") or "").lower() in {"major_swing", "prior_level"}
            or "gap" in str(member.get("kind") or "").lower()
            for member in members
        )
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
        single_prior_level_breakout_test = (
            str(cluster_kind or "").lower() == "prior_level"
            and _is_single_prior_level_cluster(cluster)
            and (
                (breakout_chase_signal and tradable_breakout_context)
                or (
                    signal_label in prior_first_breakout_signals
                    and strong_breakout_context
                    and not pullback_continuation_signal
                )
            )
        )
        if breakout_like and single_prior_level_breakout_test:
            # 强或可交易的 breakout 往往会先测试前高前低，单个次级阻力不该默认挡掉整笔交易。
            continue
        # Brooks 会把中线、整数位、open、EMA 当作参考磁体，但它们通常不该
        # 和 MM / prior high-low / gap 一样，被当成硬阻挡。
        if _is_soft_reference_kind(cluster_kind) and not has_structural_member:
            continue
        if range_like and not major_structural_cluster and int(cluster.get("count") or 0) < 3:
            continue
        if reversal_like and not major_structural_cluster and float(cluster.get("strength") or 0.0) < 4.5:
            continue
        if has_structural_member and (
            major_structural_cluster
            or float(cluster.get("strength") or 0.0) >= 4.5
            or int(cluster.get("count") or 0) >= 3
        ):
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
    blocking_strength = float(blocker_cluster.get("strength") or 0.0) if isinstance(blocker_cluster, dict) else 0.0
    blocking_count = int(blocker_cluster.get("count") or 0) if isinstance(blocker_cluster, dict) else 0
    blocking_structural = bool(
        isinstance(blocker_cluster, dict)
        and any(
            _is_structural_kind(str(member.get("kind") or ""))
            for member in (
                blocker_cluster.get("members")
                if isinstance(blocker_cluster.get("members"), list)
                else []
            )
        )
    )

    return {
        "path_clear": path_clear,
        "recommended_target": recommended,
        "primary_magnet": primary,
        "blocking_magnet": blocker,
        "primary_cluster": chosen_cluster,
        "blocking_cluster": blocker_cluster,
        "magnet_cluster_count": chosen_count,
        "magnet_cluster_strength": chosen_strength,
        "blocking_cluster_count": blocking_count,
        "blocking_cluster_strength": blocking_strength,
        "blocking_cluster_structural": blocking_structural,
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
