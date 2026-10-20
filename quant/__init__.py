"""GOLDLENS — Quant Strategy & Backtesting module (calendar spreads on MCX gold).

Only this sub-package implements strategy logic; data ingestion lives in
``quant.data`` and is separate from signal/backtest code.
"""

__all__ = [
    "config",
    "contracts",
    "data",
    "selection",
    "spreads",
    "zscore",
    "signals",
    "metrics",
    "engine",
    "api",
    "run_quant",
]
