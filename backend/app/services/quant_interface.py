"""Quant-service integration interface (Phase 5).

DELIBERATE BOUNDARY: signal formulas, z-score definitions, cost models and
backtest logic are owned by Aayush S. Kushwaha (quant). This backend does NOT
implement those formulas independently. Until his service is wired in
(GOLDLENS_QUANT_PACKAGE env var pointing at an importable module that provides
`analyze_signal` / `run_backtest` in the shapes below), endpoints return the
documented structured insufficient-data / NO_TRADE outcome.

Expected service interface (to be finalized with the quant owner):
    analyze_signal(pair_id: str, as_of_date: str) -> dict  # SignalAnalyzeResponse-ish
    run_backtest(pair_id: str, start_date: str, end_date: str,
                 strategy_version: str) -> dict            # BacktestRunResponse-ish
"""
from __future__ import annotations

import importlib
import logging
import os

log = logging.getLogger(__name__)

ENV_QUANT_PACKAGE = "GOLDLENS_QUANT_PACKAGE"


class QuantService:
    def analyze_signal(self, pair_id: str, as_of_date: str) -> dict:  # pragma: no cover - interface
        raise NotImplementedError

    def run_backtest(
        self, pair_id: str, start_date: str, end_date: str, strategy_version: str
    ) -> dict:  # pragma: no cover - interface
        raise NotImplementedError


def load_quant_service() -> QuantService | None:
    """Return the wired quant service, or None when not configured.

    The quant module boundary (`api.py` in the repository root) is a reference
    artefact for integration, not an importable package inside this backend.
    """
    package = os.environ.get(ENV_QUANT_PACKAGE, "").strip()
    if not package:
        return None
    try:
        module = importlib.import_module(package)
        loader = getattr(module, "get_quant_service", None)
        if loader is None:
            raise AttributeError(f"{package} must expose get_quant_service()")
        service = loader()
        if not callable(getattr(service, "analyze_signal", None)) or not callable(
            getattr(service, "run_backtest", None)
        ):
            raise TypeError(f"{package} service lacks analyze_signal/run_backtest")
        return service
    except Exception as err:  # noqa: BLE001 — integration must not crash the API
        log.error("failed to load quant service %r: %s", package, err)
        return None


def warm_quant_service() -> bool:
    """Best-effort startup prewarming of the wired quant service.

    Calls the wired package's optional ``warmup()`` (the service adapter
    preloads + validates its dataset). Returns True only when a wired service
    actually warmed up; False when unwired/unavailable — and NEVER raises:
    startup must not fail because of the quant boundary.
    """
    package = os.environ.get(ENV_QUANT_PACKAGE, "").strip()
    if not package:
        return False
    try:
        module = importlib.import_module(package)
        warm = getattr(module, "warmup", None)
        if callable(warm):
            warm()
            return True
        return False
    except Exception as err:  # noqa: BLE001 — startup must not depend on quant
        log.error("quant service warmup failed for %r: %s", package, err)
        return False
