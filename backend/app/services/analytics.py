"""Pair construction, history, signal and backtest services (Phase 5).

Pairs are structural candidates: two FUTCOM contracts of the same canonical
symbol with near/far expiries, both observed in stored data. Liquidity,
comparability, spread statistics, costs and trades are quant-owned and are NOT
computed here. With a single date of data, every analytic endpoint returns the
documented insufficient-data / NO_TRADE outcome instead of fabricated values.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from app.schemas.api_models import (
    BacktestRunResponse,
    DataQualityBlock,
    EvaluationPeriod,
    LegSummary,
    PairHistoryResponse,
    PairSummary,
    PairsResponse,
    SpreadObservation,
)
from app.services.quant_interface import load_quant_service
from app.storage.database import GoldlensDB

PAIR_ID_RE = re.compile(r"^(?P<symbol>[A-Z0-9]+)_near(?P<near>\d{8})_far(?P<far>\d{8})$")
MAX_PAIR_LAG_DAYS = 400  # adjacent-expiry candidates only; quant owns final rule


def make_pair_id(symbol: str, near: str, far: str) -> str:
    return f"{symbol}_near{near.replace('-', '')}_far{far.replace('-', '')}"


def parse_pair_id(pair_id: str) -> tuple[str, str, str] | None:
    m = PAIR_ID_RE.match(pair_id)
    if not m:
        return None
    near = f"{m['near'][:4]}-{m['near'][4:6]}-{m['near'][6:]}"
    far = f"{m['far'][:4]}-{m['far'][4:6]}-{m['far'][6:]}"
    return m["symbol"], near, far


def _warning(code: str, severity: str, count: int, message: str) -> dict[str, Any]:
    return {"code": code, "severity": severity, "count": count, "message": message}


def list_pairs(db: GoldlensDB, symbol: str | None = None) -> PairsResponse:
    """Candidate near/far pairs from observed contracts (structural only)."""
    warnings = [
        _warning(
            "UNVERIFIED_SPEC",
            "warning",
            db.verification_counts().get("unverified", 0),
            "no contract specification is verified in this registry; eligibility requires quant+spec verification",
        )
    ]
    if db.observation_count() == 0:
        warnings.insert(0, _warning("NO_DATA", "critical", 0, "no observations stored; ingest the CSV first"))
        return PairsResponse(pairs=[], warnings=warnings)

    pairs: list[PairSummary] = []
    symbols = {symbol} if symbol is not None else {
        c["symbol"] for c in db.list_contracts(limit=10000) if c["instrument_type"] == "FUTCOM"
    }
    for sym in sorted(symbols):
        rows = [r for r in db.observations_by_symbol(sym) if r["instrument_type"] == "FUTCOM"]
        expiries = sorted({r["expiry_date"] for r in rows if r["expiry_date"]})
        if len(expiries) < 2:
            continue
        for near, far in zip(expiries, expiries[1:]):  # adjacent expiry candidates
            gap = (datetime.strptime(far, "%Y-%m-%d") - datetime.strptime(near, "%Y-%m-%d")).days
            if gap > MAX_PAIR_LAG_DAYS:
                continue
            all_dates = {r["trade_date"] for r in rows}
            near_id = f"FUTCOM_{sym}_{near.replace('-', '')}"
            far_id = f"FUTCOM_{sym}_{far.replace('-', '')}"
            pairs.append(
                PairSummary(
                    pair_id=make_pair_id(sym, near, far),
                    symbol=sym,
                    near=LegSummary(contract_id=near_id, expiry_date=near),
                    far=LegSummary(contract_id=far_id, expiry_date=far),
                    status="candidate_only",
                    reason_codes=["UNVERIFIED_SPEC"],
                    history_days=len(all_dates),
                )
            )
        if len(pairs) >= 200:
            break  # defensive cap; frontend paging/pair filter can request more later

    return PairsResponse(pairs=pairs, warnings=warnings)


def pair_history(
    db: GoldlensDB,
    pair_id: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> PairHistoryResponse | None:
    """Reference spreads where both legs have reported closes on the same date.

    A spread built from one date (or from zero-volume rows) is labelled
    reference data — it is never presented as a multi-day series.
    """
    parsed = parse_pair_id(pair_id)
    if parsed is None:
        return None
    symbol, near, far = parsed
    rows = [
        r
        for r in db.observations_by_symbol(symbol, start_date=start_date, end_date=end_date)
        if r["instrument_type"] == "FUTCOM"
    ]
    if not rows:
        warnings = [_warning("NO_PAIR_OBSERVATIONS", "warning", 0,
                             f"no observations for symbol {symbol} in the requested period")]
        return PairHistoryResponse(pair_id=pair_id, symbol=symbol, near_expiry=near,
                                   far_expiry=far, observations=[], count=0, warnings=warnings)

    by_date: dict[str, dict[str, Any]] = {}
    for r in rows:
        leg = "near" if r["expiry_date"] == near else ("far" if r["expiry_date"] == far else None)
        if leg is None:
            continue
        by_date.setdefault(r["trade_date"], {})[leg] = r

    observations: list[SpreadObservation] = []
    for trade_date in sorted(by_date):
        legs = by_date[trade_date]
        near_row, far_row = legs.get("near"), legs.get("far")
        if near_row is None or far_row is None:
            continue
        reasons: list[str] = []
        for r in (near_row, far_row):
            if r["zero_volume"]:
                reasons.append("ZERO_VOLUME")
                if r["close"] is not None:
                    reasons.append("STALE_PRICE")
            if not r["has_ohlc"]:
                reasons.append("MISSING_OHLC")
        tradable = all(
            r["has_ohlc"] and not r["zero_volume"] for r in (near_row, far_row)
        )
        spread = (
            float(near_row["close"]) - float(far_row["close"])
            if near_row["close"] is not None and far_row["close"] is not None
            else None
        )
        observations.append(
            SpreadObservation(
                trade_date=trade_date,
                near_close=None if near_row["close"] is None else float(near_row["close"]),
                far_close=None if far_row["close"] is None else float(far_row["close"]),
                spread=spread,
                status="observation" if tradable else "reference_only",
                reason_codes=sorted(set(reasons)),
            )
        )

    warnings: list[dict[str, Any]] = []
    distinct_dates = db.quality_counts()["distinct_dates"]
    if distinct_dates < 2:
        warnings.append(
            _warning(
                "INSUFFICIENT_HISTORY",
                "warning",
                distinct_dates,
                f"{distinct_dates} distinct trading date(s) stored: this is reference data, not a history series",
            )
        )
    warn0 = [
        _warning("UNVERIFIED_SPEC", "warning", db.verification_counts().get("unverified", 0),
                 "contract specifications unverified; treat spreads as reference only")
    ]
    warnings.extend(warn0)

    return PairHistoryResponse(
        pair_id=pair_id,
        symbol=symbol,
        near_expiry=near,
        far_expiry=far,
        observations=observations,
        count=len(observations),
        warnings=warnings,
    )


def analyze_signal(db: GoldlensDB, pair_id: str, as_of_date: str | None) -> SignalAnalyzeResult:
    """Structured signal outcome WITHOUT quant formulas.

    The quant service, when wired, replaces the derived fields below. Until
    then: decision is NO_TRADE with explicit reason codes; z_score/edge fields
    are null unless the quant service supplies them.
    """
    parsed = parse_pair_id(pair_id)
    counts = db.quality_counts()
    distinct_dates = counts["distinct_dates"]
    latest = counts["max_date"]
    as_of = as_of_date or latest
    reason_codes: list[str] = []

    dq_warnings: list[dict[str, Any]] = []
    if counts["total_rows"] == 0:
        dq_warnings.append(_warning("NO_DATA", "critical", 0, "no observations stored"))
    if distinct_dates < 2:
        dq_warnings.append(
            _warning(
                "INSUFFICIENT_HISTORY",
                "error",
                distinct_dates,
                f"{distinct_dates} distinct trading date(s) stored; rolling z-score requires more history",
            )
        )
        reason_codes.append("INSUFFICIENT_HISTORY")

    spread: float | None = None
    trading_days_available = 0
    if parsed is not None:
        history = pair_history(db, pair_id)  # respect pair
        if history is not None and history.count >= 1:
            row = next((o for o in history.observations if o.trade_date == as_of), None)
            if row is None:
                reason_codes.append("DATE_NOT_IN_DATA")
            else:
                spread = row.spread
            trading_days_available = history.count
    else:
        reason_codes.append("PAIR_UNKNOWN_FORMAT")

    if db.verification_counts().get("unverified", 0) == db.contract_total() and db.contract_total():
        reason_codes.append("UNVERIFIED_SPEC")

    data_quality = DataQualityBlock(
        distinct_trade_dates=distinct_dates,
        latest_data_date=latest,
        trading_days_available=trading_days_available,
        warnings=dq_warnings,
    )

    result = SignalAnalyzeResult(
        pair_id=pair_id,
        as_of_date=as_of or "",
        decision="NO_TRADE",
        reason_codes=sorted(set(reason_codes)) or ["INSUFFICIENT_HISTORY"],
        spread=spread,
        z_score=None,
        gross_edge=None,
        estimated_cost=None,
        net_edge=None,
        data_quality=data_quality,
        notes=(
            "z-score/edge/cost fields are null: quant service (Aayush S. Kushwaha) owns these "
            "formulas; overriding would fabricate values from one day of data"
        ),
    )

    quant = load_quant_service()
    if quant is not None and result.spread is not None:  # pragma: no cover - integration
        quant_fields = quant.analyze_signal(pair_id, result.as_of_date)
        for field in ("spread", "z_score", "gross_edge", "estimated_cost", "net_edge", "decision", "reason_codes"):
            if quant_fields.get(field) is not None:
                setattr(result, field, quant_fields[field])
    return result


class SignalAnalyzeResult:
    def __init__(
        self,
        *,
        pair_id: str,
        as_of_date: str,
        decision: str,
        reason_codes: list[str],
        spread: float | None,
        z_score: float | None,
        gross_edge: float | None,
        estimated_cost: float | None,
        net_edge: float | None,
        data_quality: DataQualityBlock,
        notes: str | None,
    ):
        self.pair_id = pair_id
        self.as_of_date = as_of_date
        self.decision = decision
        self.reason_codes = reason_codes
        self.spread = spread
        self.z_score = z_score
        self.gross_edge = gross_edge
        self.estimated_cost = estimated_cost
        self.net_edge = net_edge
        self.data_quality = data_quality
        self.notes = notes


def run_backtest(
    db: GoldlensDB,
    pair_id: str,
    start_date: str | None,
    end_date: str | None,
    strategy_version: str,
) -> BacktestRunResponse:
    """Backtest refusal state from real data — no fabricated metrics, ever."""
    parsed = parse_pair_id(pair_id)
    counts = db.quality_counts()
    warnings: list[dict[str, Any]] = [
        _warning(
            "INSUFFICIENT_HISTORY",
            "error",
            counts["distinct_dates"],
            f"{counts['distinct_dates']} distinct trading date(s) stored (< required for walk-forward); backtest refused",
        )
    ]
    observation_count = 0
    if parsed is not None:
        history = pair_history(db, pair_id, start_date=start_date, end_date=end_date)
        observation_count = history.count if history is not None else 0

    result = BacktestRunResponse(
        run_id=f"bt_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid.uuid4().hex[:4]}",
        pair_id=pair_id,
        strategy_version=strategy_version,
        evaluation_period=EvaluationPeriod(start_date=start_date, end_date=end_date),
        observation_count=observation_count,
        completed_trades=0,
        gross_pnl=None,
        estimated_costs=None,
        net_pnl=None,
        max_drawdown=None,
        assumptions=[],
        warnings=warnings,
        runnable=False,
    )

    quant = load_quant_service()  # pragma: no cover - integration hook
    if quant is not None and result.runnable:
        quant_fields = quant.run_backtest(pair_id, result.evaluation_period.start_date or "",
                                          result.evaluation_period.end_date or "", strategy_version)
        for field in ("gross_pnl", "estimated_costs", "net_pnl", "max_drawdown",
                      "completed_trades", "assumptions", "runnable"):
            if quant_fields.get(field) is not None:
                setattr(result, field, quant_fields[field])
    return result
