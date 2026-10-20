"""GOLDLENS quant module typed integration API.

Boundary layer for the Quant/Strategy/Backtesting module. Existing app/backend
teammates should call these functions only — internals may change freely.

All inputs are validated here with typed errors (QuantAPIError subclasses)
carrying machine-readable ``code`` + human-readable ``details``. All outputs
are typed dataclasses that round-trip through ``to_json_dict()`` so the app
deserializes/filters them like any JSON payload without importing internals.

Historicity note: every response contains ``data_provenance`` with the source
paths and the number of distinct trading days; the module never labels runs
with < backtest_min_days days as valid backtests.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field, is_dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

import pandas as pd

from .config import CRITICAL_MISSING_COSTS, StrategyConfig
from .contracts import get_spec, cross_check_spec
from .data import load_bhavcopy
from .engine import BacktestResult, compare_walk_forward, run_backtest, split_train_test, walk_forward
from .metrics import MetricsResult
from .selection import eligible_contracts
from .spreads import pair_spreads, select_pair
from .zscore import rolling_zscore

log = logging.getLogger(__name__)

REQUIRED_FRAME_COLUMNS = [
    "trade_date", "symbol", "instrument", "expiry_ts",
    "close", "volume_lots", "open_interest_lots", "value_lakhs",
]

CAMPAIGN_MIN_DAYS = 30


class QuantAPIError(Exception):
    """Base class of module boundary errors; ``code`` is machine-readable."""
    code = "quant_error"

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.details = details or {}

    def to_json(self) -> dict[str, Any]:
        return {"error_code": self.code, "message": str(self), "details": self.details}


class SchemaError(QuantAPIError):
    code = "invalid_input_schema"


class DataQualityError(QuantAPIError):
    code = "data_quality_rejected"


def validate_bhavcopy_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Validate an already-loaded frame at the module boundary.

    Raises SchemaError on missing/typed columns; DataQualityError when the
    frame is unusable (empty, no valid rows). Idempotent: a validated frame
    with all required columns returns unchanged.
    """
    if frame is None or not isinstance(frame, pd.DataFrame):
        raise SchemaError("frame must be a pandas DataFrame")
    if frame.empty:
        raise DataQualityError("frame is empty", {"rows": 0})
    missing = [c for c in REQUIRED_FRAME_COLUMNS if c not in frame.columns]
    if missing:
        raise SchemaError(
            "frame missing required columns", {"missing_columns": missing, "provided": list(frame.columns)}
        )
    if frame["trade_date"].isna().all() or frame["expiry_ts"].isna().all():
        raise DataQualityError("no parsable trade/expiry dates", {"rows": len(frame)})
    n_traded = int((frame["volume_lots"].fillna(0) > 0).sum())
    if n_traded == 0:
        raise DataQualityError("no traded rows (all volume_lots == 0)", {"rows": len(frame)})
    return frame


# ------------------------------ output DTOs -------------------------------

@dataclass
class EligibleContractDTO:
    trade_date: str | None
    symbol: str
    expiry: str | None
    days_to_expiry: int | None
    close: float | None
    volume_lots: float | None
    open_interest_lots: float | None
    value_lakhs: float | None
    eligible: bool
    reason: str | None
    lot_size_g: float | None
    quote_basis_g: float | None

    @classmethod
    def from_row(cls, r: pd.Series) -> EligibleContractDTO:
        try:
            spec = get_spec(r["symbol"])
            lot, qb = spec.lot_size_g, spec.quote_basis_g
        except KeyError:
            lot, qb = None, None
        return cls(
            trade_date=_iso(r.get("trade_date")),
            symbol=str(r["symbol"]),
            expiry=_iso(r.get("expiry_ts")),
            days_to_expiry=None if pd.isna(r.get("dte_days")) else int(r["dte_days"]),
            close=None if pd.isna(r.get("close")) else float(r["close"]),
            volume_lots=None if pd.isna(r.get("volume_lots")) else float(r["volume_lots"]),
            open_interest_lots=None if pd.isna(r.get("open_interest_lots")) else float(r["open_interest_lots"]),
            value_lakhs=None if pd.isna(r.get("value_lakhs")) else float(r["value_lakhs"]),
            eligible=bool(r.get("eligible", False)),
            reason="" if pd.isna(r.get("reason")) else str(r.get("reason", "")),
            lot_size_g=lot,
            quote_basis_g=qb,
        )


@dataclass
class SpreadPointDTO:
    trade_date: str
    symbol: str | None
    near_expiry: str
    far_expiry: str
    near_close: float
    far_close: float
    spread: float
    stale: bool


@dataclass
class ZScorePointDTO:
    trade_date: str
    spread: float
    rolling_mean: float | None
    rolling_std: float | None
    z: float | None


@dataclass
class SignalDTO:
    trade_date: str
    signal: str
    z: float | None
    spread: float | None
    mean: float | None
    std: float | None
    filters_ok: bool
    filter_reason: str
    position_before: str
    rationale: str
    no_trade_reason: str | None

    @classmethod
    def from_explanation(cls, e: dict[str, Any]) -> SignalDTO:
        label = str(e.get("signal", "NO TRADE"))
        no_trade = None
        if label in ("NO TRADE",):
            no_trade = str(e.get("rationale", "")) + (
                f" [filters: {e['filter_reason']}]" if not e.get("filters_ok") else ""
            )
        return cls(
            trade_date=str(e.get("trade_date", "")),
            signal=label,
            z=_f(e.get("z")),
            spread=_f(e.get("spread")),
            mean=_f(e.get("mean")),
            std=_f(e.get("std")),
            filters_ok=bool(e.get("filters_ok", True)),
            filter_reason=str(e.get("filter_reason", "")),
            position_before=str(e.get("position_before", "flat")),
            rationale=str(e.get("rationale", "")),
            no_trade_reason=no_trade,
        )


@dataclass
class TradeDTO:
    leg_symbol: str
    direction: str
    entry_signal_date: str
    entry_exec_date: str
    entry_spread: float
    entry_z: float | None
    entry_rationale: str
    exit_exec_date: str | None
    exit_spread: float | None
    exit_reason: str
    gross_pnl_rupees: float | None
    holding_days: int

    @classmethod
    def from_tr(cls, tr: Any) -> TradeDTO:
        return cls(
            leg_symbol=str(tr.leg_symbol),
            direction=str(tr.direction),
            entry_signal_date=_iso(tr.entry_signal_date),
            entry_exec_date=_iso(tr.entry_exec_date),
            entry_spread=float(tr.entry_spread),
            entry_z=None if tr.entry_z is None else float(tr.entry_z),
            entry_rationale=str(tr.entry_rationale),
            exit_exec_date=_iso(tr.exit_exec_date) if tr.exit_exec_date is not None else None,
            exit_spread=None if tr.exit_spread is None else float(tr.exit_spread),
            exit_reason=str(tr.exit_reason),
            gross_pnl_rupees=None if tr.gross_pnl_rupees is None else float(tr.gross_pnl_rupees),
            holding_days=int(tr.holding_days),
        )


@dataclass
class MetricsDTO:
    status: str
    n_days: int
    n_trades: int
    gross_pnl_rupees: float | None
    net_pnl_rupees: float | None
    win_rate: float | None
    max_drawdown_rupees: float | None
    net_max_drawdown_rupees: float | None
    sharpe_ratio: float | None
    net_sharpe_ratio: float | None
    total_cost_rupees: float | None
    avg_pnl_per_trade: float | None
    notes: list[str] = field(default_factory=list)
    costs_assumption: str | None = None

    @classmethod
    def from_metrics(cls, m: MetricsResult, cfg: StrategyConfig) -> MetricsDTO:
        notes = list(m.notes)
        if cfg.costs is None:
            notes.append(CRITICAL_MISSING_COSTS)
        return cls(
            status="diagnostics_only" if m.n_days < cfg.min_days_for_sharpe else "backtest",
            n_days=m.n_days,
            n_trades=m.n_trades,
            gross_pnl_rupees=m.gross_pnl_rupees,
            net_pnl_rupees=m.net_pnl_rupees,
            win_rate=m.win_rate,
            max_drawdown_rupees=m.max_drawdown_rupees,
            net_max_drawdown_rupees=m.net_max_drawdown_rupees,
            sharpe_ratio=m.sharpe_ratio,
            net_sharpe_ratio=m.net_sharpe_ratio,
            total_cost_rupees=m.total_cost_rupees,
            avg_pnl_per_trade=m.avg_pnl_per_trade,
            notes=notes,
            costs_assumption="not supplied — net metrics withheld" if cfg.costs is None else "user-supplied verified",
        )


@dataclass
class BacktestReportDTO:
    config: dict[str, Any]
    data_provenance: dict[str, Any]
    pair: dict[str, Any]
    spread_observations: list[SpreadPointDTO]
    z_score: list[ZScorePointDTO]
    signals: list[SignalDTO]
    trades: list[TradeDTO]
    eligible_contracts: list[EligibleContractDTO] = field(default_factory=list)
    metrics: MetricsDTO | None = None
    train_metrics: MetricsDTO | None = None
    test_metrics: MetricsDTO | None = None
    walk_forward_cmp: list[dict[str, Any]] = field(default_factory=list)
    verdict: str = ""
    is_valid_backtest: bool = False

    def to_json_dict(self) -> dict[str, Any]:
        return _jsonify(self)


def _f(x: Any) -> float | None:
    if x is None:
        return None
    try:
        return None if pd.isna(x) else float(x)
    except (TypeError, ValueError):
        return None


def _iso(x: Any) -> str | None:
    if x is None:
        return None
    try:
        return None if pd.isna(x) else pd.Timestamp(x).isoformat()[:10]
    except Exception:
        return str(x)


def _jsonify(obj: Any) -> Any:
    if is_dataclass(obj) and not isinstance(obj, type):
        return {k: _jsonify(v) for k, v in asdict(obj).items()}
    if isinstance(obj, dict):
        return {str(k): _jsonify(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonify(v) for v in obj]
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    return str(obj)


# --------------------------- orchestration API ---------------------------

@dataclass
class ValidatedDataset:
    frame: pd.DataFrame
    n_trading_days: int
    date_range: tuple[str, str] | None
    source_files: list[str]
    spec_checks: list[str]


def load_dataset(sources: Sequence[Path | str]) -> ValidatedDataset:
    """Load + validate bhavcopy files at the boundary. Raises QuantAPIError subclasses."""
    paths = [Path(s) for s in sources]
    if not paths:
        raise SchemaError("no source files supplied", {"hint": "pass repo bhavcopy CSV paths"})
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        raise DataQualityError("source files not found", {"missing": missing})
    frame = load_bhavcopy(paths)
    frame = validate_bhavcopy_frame(frame)
    ds = ValidatedDataset(
        frame=frame,
        n_trading_days=int(frame["trade_date"].nunique()),
        date_range=(
            frame["trade_date"].min().isoformat()[:10],
            frame["trade_date"].max().isoformat()[:10],
        ),
        source_files=[str(p) for p in paths],
        spec_checks=_spec_checks(frame),
    )
    if ds.n_trading_days < CAMPAIGN_MIN_DAYS:
        log.warning(
            "dataset has %d trading days (< %d) — outputs are diagnostics; "
            "backtest validity is refused downstream",
            ds.n_trading_days, CAMPAIGN_MIN_DAYS,
        )
    return ds


def _spec_checks(frame: pd.DataFrame) -> list[str]:
    yearwise = Path(__file__).resolve().parent.parent / "YearWise 2026-10-18 Detail report (1).xls"
    out: list[str] = []
    if not yearwise.exists():
        return out
    import re

    html = yearwise.read_text(encoding="utf-8", errors="replace")
    for r in re.findall(r"<tr>(.*?)</tr>", html, flags=re.S):
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", r)]
        if len(cells) < 7 or cells[0] != "FUTCOM" or cells[3] not in ("GOLD", "GOLDM"):
            continue
        lots = float(cells[4]); value_lakhs = float(cells[5])
        if lots <= 0:
            continue
        sym = cells[3]
        symrows = frame[frame["symbol"] == sym]
        if symrows.empty:
            continue
        ok, msg = cross_check_spec(sym, float(symrows["close"].median()), value_lakhs / lots)
        out.append(("PASS " if ok else "FAIL ") + msg)
    return out



def compute_eligible_contracts(frame: pd.DataFrame, cfg: StrategyConfig) -> list[EligibleContractDTO]:
    """Eligible-contract snapshot at the latest trading day (app-facing list)."""
    validate_bhavcopy_frame(frame)
    last = frame["trade_date"].max()
    elig = eligible_contracts(frame, last, cfg.liquidity)
    return [EligibleContractDTO.from_row(r) for _, r in elig.iterrows()]


def compute_spreads(frame: pd.DataFrame, cfg: StrategyConfig, symbol: str) -> dict[str, Any]:
    """Pair selection + normalized spread series for one family.

    Raises ValueError-kind DataQualityError when the family has no tradable
    pair on the latest day; includes per-row ``stale`` gating info.
    """
    validate_bhavcopy_frame(frame)
    last = frame["trade_date"].max()
    pick = select_pair(eligible_contracts(frame, last, cfg.liquidity))
    if pick is None or pick[1] != symbol:
        raise DataQualityError(
            f"no tradable calendar pair for {symbol!r} on {last.date()}",
            {"latest_date": str(last.date()), "requirement": "two eligible expiries, near leg traded"},
        )
    (near, far), _ = pick
    report: dict[str, int] = {}
    sf = pair_spreads(frame, symbol, near, far, report=report)
    pts = [
        SpreadPointDTO(trade_date=_iso(t), symbol=symbol, near_expiry=_iso(near), far_expiry=_iso(far),
                       near_close=float(r.near_close), far_close=float(r.far_close),
                       spread=float(r.spread), stale=bool(r.stale))
        for t, r in sf.set_index("trade_date").iterrows()
    ]
    return {"symbol": symbol, "near": str(near.date()), "far": str(far.date()),
            "observations": pts, "rejections": report, "spread_frame": sf}


def compute_zscores(sf: pd.DataFrame, cfg: StrategyConfig) -> list[ZScorePointDTO]:
    """Causal rolling mean/std/z rows for an already-built spread frame."""
    if sf.empty:
        return []
    z = rolling_zscore(sf.set_index("trade_date")["spread"], cfg)
    return [
        ZScorePointDTO(trade_date=_iso(t), spread=_f(r["spread"]), rolling_mean=_f(r["mean"]),
                       rolling_std=_f(r["std"]), z=_f(r["z"]))
        for t, r in z.iterrows()
    ]


def run_strategy_backtest(frame: pd.DataFrame, cfg: StrategyConfig, symbol: str) -> BacktestReportDTO:
    """Full typed pipeline: pair -> spreads -> z -> signals -> backtest.

    Never claims a valid backtest without >= CAMPAIGN_MIN_DAYS observations;
    verdict text in the DTO explains the limitation. propagates QuantAPIError
    subclasses from boundary validation.
    """
    cfg.validate()
    ds_last = frame["trade_date"].max()
    spread = compute_spreads(frame, cfg, symbol)
    sf: pd.DataFrame = spread["spread_frame"]
    from .run_quant import compute_daily_filters

    ok, reasons = compute_daily_filters(
        frame, sf, pd.Timestamp(spread["near"]), pd.Timestamp(spread["far"]), symbol, cfg
    )
    result = run_backtest(sf, symbol, cfg, segment_name="full", filters_ok=ok, filter_reasons=reasons)
    train, test, split_note = split_train_test(sf, cfg)
    train_res = run_backtest(train, symbol, cfg, segment_name="train") if len(train) >= 3 else None
    test_res = run_backtest(test, symbol, cfg, segment_name="test") if len(test) >= 3 else None
    folds = [] if len(sf) < 3 else walk_forward(sf, symbol, cfg, n_folds=cfg.walk_forward_folds)
    n_days = int(frame["trade_date"].nunique())
    valid_backtest = len(sf) >= max(CAMPAIGN_MIN_DAYS, cfg.min_test_days)
    verdict = (
        "VALID BACKTEST" if valid_backtest
        else f"NOT A VALID BACKTEST: {len(sf)} spread observations (< {max(CAMPAIGN_MIN_DAYS, cfg.min_test_days)}). "
             "Diagnostics only — signals may still be consumed; metrics are withheld-or-labeled."
    )
    invalid_days = int((~ok).sum())
    return BacktestReportDTO(
        config={
            "lookback_days": cfg.lookback_days, "z_entry": cfg.z_entry, "z_exit": cfg.z_exit,
            "stop_z": cfg.stop_z, "max_holding_days": cfg.max_holding_days,
            "min_hist_days": cfg.min_hist_days, "exec_mode": cfg.exec_mode,
            "allow_overlap": cfg.allow_overlap, "lots_per_leg": cfg.lots_per_leg,
            "walk_forward_folds": cfg.walk_forward_folds,
            "costs": "not configured (gross-only)" if cfg.costs is None else "user-verified supplied",
        },
        data_provenance={
            "trading_days": n_days,
            "date_range": [
                frame["trade_date"].min().isoformat()[:10], ds_last.isoformat()[:10],
            ],
            "spec_checks": _spec_checks(frame),
        },
        pair={"symbol": spread["symbol"], "near_expiry": spread["near"], "far_expiry": spread["far"],
              "rejections": spread["rejections"], "filter_failures": invalid_days},
        spread_observations=spread["observations"],
        z_score=compute_zscores(sf, cfg),
        signals=[SignalDTO.from_explanation({**e, "trade_date": str(d.date())})
                 for d, e in zip(result.daily_pnl_gross.index, result.explanations)],
        trades=[TradeDTO.from_tr(tr) for tr in result.trades],
        eligible_contracts=compute_eligible_contracts(frame, cfg),
        metrics=MetricsDTO.from_metrics(result.metrics, cfg),
        train_metrics=MetricsDTO.from_metrics(train_res.metrics, cfg) if train_res else None,
        test_metrics=MetricsDTO.from_metrics(test_res.metrics, cfg) if test_res else None,
        walk_forward_cmp=compare_walk_forward(folds) if folds else [],
        verdict=verdict,
        is_valid_backtest=valid_backtest,
    )
