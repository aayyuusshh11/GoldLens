"""Stamp GOLD/GOLDM contract-registry entries with VERIFIED specifications.

Every value below was already verified by the quant owner with provenance;
this script only propagates it into the backend registry (it makes no claim
of its own). Sources baked into the SOURCE string:

- Lot / product / purity: MCX product pages (fetched 2026-10-18), recorded in
  quant/contracts.py::docs header (GOLD = 1 kg "Gold", GOLDM = "Gold Mini
  (100gram)", both 995 purity).
- Quote basis Rs per 10 g: numerically cross-checked against the verified
  YearWise 2026-10-18 Detail report via quant/contracts.py::cross_check_spec()
  (value-in-lakhs / lots vs bhavcopy close).
- Tick size Rs 1 per quote unit: docs/COST_MODEL.md (VERIFIED row).
- expiry_rule: NOT verified here — deliberately left null.

Usage (from backend/, after `python -m app.cli ingest --store`):
    python scripts/verify_gold_specs.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.storage.database import GoldlensDB  # noqa: E402

SOURCE = (
    "MCX product pages (fetched 2026-10-18) per quant/contracts.py header; "
    "lot and quote-basis values cross-checked via quant/contracts.py::cross_check_spec() "
    "against the YearWise 2026-10-18 Detail report; tick size per docs/COST_MODEL.md (VERIFIED)."
)

SPECS: dict[str, dict[str, object]] = {
    "GOLD": {
        "contract_size": 1000.0,
        "units": "grams",
        "quotation_unit": "INR per 10 grams",
        "purity": "995",
        "tick_size": 1.0,
    },
    "GOLDM": {
        "contract_size": 100.0,
        "units": "grams",
        "quotation_unit": "INR per 10 grams",
        "purity": "995",
        "tick_size": 1.0,
    },
}


def main() -> int:
    with GoldlensDB() as db:
        registry = db.con.execute(
            "SELECT symbol, count(*) AS n FROM contracts "
            "WHERE symbol IN ('GOLD', 'GOLDM') GROUP BY symbol ORDER BY symbol"
        ).fetchall()
        if not registry:
            print(
                "no GOLD/GOLDM contracts in the registry — run "
                "`python -m app.cli ingest --store` first"
            )
            return 1
        for symbol, count in registry:
            spec = SPECS[symbol]
            stamped = 0
            for contract in db.list_contracts(symbol=symbol, limit=1000):
                db.verify_contract_fields(contract["contract_id"], spec, SOURCE)
                stamped += 1
            fields = ", ".join(sorted(spec))
            print(f"verified {stamped}/{count} {symbol} contracts ({fields})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
