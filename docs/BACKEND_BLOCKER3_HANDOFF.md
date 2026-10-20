# Blocker 3 — Backend Integration Handoff (Pass 11 Verified; Pass 12 Integration Tested)

**Status:** Backend branch (`backend`) is absent from this quant workspace.
All preparatory work (analysis, test code, exact diffs, regression test suite)
is delivered here so Araham can apply the three fixes directly without re-investigation.
All three integration aspects are covered by local Quant-side regression tests in
`tests/test_backend_contract_compat.py`.

**Pass 12 addendum — verification status of the three fixes (quant-side engineer):**
The three backend fixes below were **implemented and tested end-to-end in a
local working clone** of `aayyuusshh11/GoldLens` branch `backend` @ `b862e2f`
(kept outside this workspace in temporary storage; **not pushed, not merged —
Araham must apply/merge the real edits upstream**):

- `spread` sign fixed in `backend/app/services/analytics.py::pair_history`
  (now `far_close - near_close`; backend test `test_pair_history_single_reference_row`
  asserts the convention exactly).
- `analytics.run_backtest` control flow fixed: the quant service is always
  invoked for a valid-format pair when `GOLDLENS_QUANT_PACKAGE` is configured,
  and the service owns the `runnable` decision (regression test
  `test_backtest_quant_called_even_when_backend_starts_not_runnable`).
- `pandas>=2.0` added to `backend/requirements.txt` (required by the wired
  adapter; the backend's own code never imports pandas).
- Signals router `or None` coercion of legitimate `0.0` quant values fixed
  (regression test `test_signal_preserves_true_zero_from_quant`).
- `GET /api/readiness` added (gates: `dataCoverage`, `futcomObservations`,
  `minSpreadObservations`, `contractSpecsVerified`, `quantServiceWired`;
  `quant_service` wiring status ∈ `not_configured|loaded|failed_to_load`),
  documented in the backend clone's `docs/API_CONTRACT.md` §8.
- Real-adapter integration was exercised over HTTP with the actual
  `quant.service_adapter` and the real repo bhavcopy data:
  `54 passed, 1 skipped` (the skip is the clone's "supplied CSV not present"
  gate; supply a CSV to run it). Live server probe verified:
  `uvicorn app.main:app --port 8124` with
  `GOLDLENS_QUANT_PACKAGE=quant.service_adapter` +
  `GOLDLENS_DATA_DIR=<quant repo>` → `/api/health` healthy, `/api/readiness`
  honestly `NOT READY` until data is ingested.

**Quant-side integration contract is stable:**
- `GOLDLENS_QUANT_PACKAGE=quant.service_adapter`
- `get_quant_service()` → `GoldlensQuantService`
- `.analyze_signal(pair_id, as_of_date)` → dict (keys frozen in `tests/test_backend_contract_compat.py`)
- `.run_backtest(pair_id, start_date, end_date, strategy_version)` → dict
- Spread convention: `far_close - near_close` everywhere (quant + API + backend)
- No separate quant API server is required when called in-process by the backend.

---

## FIX A — analytics.run_backtest control-flow bug

### Problem
In `analytics.run_backtest` (backend), the code checks `runnable` before
invoking the quant service. Since `runnable` is initialised to `False`, the
quant call is never reached. The service result never enters the response.

### Required code change

```python
# BEFORE (broken) — pseudocode from the prior audit:
runnable = False
# ... validate pair_id, date range ...
if runnable:                        # ← always False here
    result = quant_service.run_backtest(...)
    # merge result into response
return response_with_runnable_false

# AFTER (correct):
runnable = False
# ... validate pair_id, date range ...
quant_result = quant_service.run_backtest(
    pair_id, start_date, end_date, strategy_version
)
runnable = quant_result.get("runnable", False)
# merge quant_result into response (only permitted merge keys)
response.update({
    k: quant_result[k]
    for k in BACKTEST_MERGE_KEYS          # use the frozen list below
    if k in quant_result
})
return response
```

**Permitted merge keys** (frozen by `tests/test_backend_contract_compat.py`):
```python
BACKTEST_MERGE_KEYS = {
    "gross_pnl", "estimated_costs", "net_pnl", "max_drawdown",
    "completed_trades", "assumptions", "runnable",
}
```

### Regression test to add to the backend test suite

```python
def test_runnable_backtest_invokes_quant_service_and_reflects_result():
    """Quant service is actually called and its result appears in the response.

    This is the regression test for the analytics.run_backtest bug where
    runnable was checked before the quant call (so the call never happened).
    """
    from unittest.mock import patch, MagicMock

    fake_quant_result = {
        "runnable": True,
        "completed_trades": 3,
        "gross_pnl": 15000.0,
        "estimated_costs": None,
        "net_pnl": None,
        "max_drawdown": -500.0,
        "assumptions": ["exec_mode=next_close"],
    }
    mock_service = MagicMock()
    mock_service.run_backtest.return_value = fake_quant_result

    # Replace the quant service loader with the mock
    with patch("backend.app.services.quant_interface.get_quant_service",
               return_value=mock_service):
        # Call the analytics endpoint with a valid-format pair and dates
        response = client.post("/api/analytics/backtest", json={
            "pair_id": "GOLDM_near20261204_far20270105",
            "start_date": "2026-01-01",
            "end_date": "2026-10-16",
            "strategy_version": "default",
        })

    assert response.status_code == 200
    data = response.json()
    # The quant service MUST have been called
    mock_service.run_backtest.assert_called_once()
    # Its result MUST appear in the response
    assert data["runnable"] is True, "runnable from quant result must propagate"
    assert data["completed_trades"] == 3
    assert data["gross_pnl"] == 15000.0
```

---

## FIX B — Add pandas to backend/requirements.txt

### Problem
`pandas` is used by `quant/service_adapter.py` (and all quant modules) but
is missing from `backend/requirements.txt`. A clean `pip install` of the
backend requirements fails to satisfy the quant adapter import.

### Required change

Add to `backend/requirements.txt`:
```
pandas>=2.0.0
```

Do not add it twice if already present. Verify with:
```bash
pip install -r backend/requirements.txt
python -c "import quant.service_adapter; print('import OK')"
```

### Verification test

```python
def test_quant_adapter_imports_cleanly():
    """quant.service_adapter must import without error after requirements install."""
    import quant.service_adapter as sa
    svc = sa.get_quant_service()
    assert hasattr(svc, "analyze_signal")
    assert hasattr(svc, "run_backtest")
    # pandas must be importable (was the missing dependency)
    import pandas as pd
    assert pd.__version__
```

---

## FIX C — Standardise pair_history spread sign

### Problem
The backend's `pair_history` endpoint computes:
```python
spread = near_close - far_close   # WRONG
```
The documented and engine-verified convention is:
```python
spread = far_close - near_close   # CORRECT
```

### Required code change

In `backend/app/routers/pair_history.py` (or wherever the spread is computed):
```python
# BEFORE (wrong sign):
spread = row["near_close"] - row["far_close"]

# AFTER (correct, matches engine and quant/spreads.py):
spread = row["far_close"] - row["near_close"]
```

Also update any frontend-facing field description that references the spread
sign, and any test that asserts `spread < 0` based on the wrong sign.

### Sign verification test

```python
def test_pair_history_spread_sign_matches_engine_convention():
    """Backend spread must be far_close - near_close, matching the quant engine.

    A positive spread means the far contract trades above the near contract
    (normal carry structure for gold). A LONG SPREAD decision (BUY_FAR_SELL_NEAR)
    profits when this spread widens further; a SHORT SPREAD profits when it
    narrows.
    """
    response = client.get("/api/pairs/GOLDM_near20261204_far20270105/history")
    assert response.status_code == 200
    data = response.json()
    for obs in data["observations"]:
        # For gold, the far contract should be priced above near (cost-of-carry)
        # so spread = far - near should be positive in normal market conditions.
        # At minimum, the sign must match far - near (not near - far).
        computed = obs["far_close"] - obs["near_close"]
        assert abs(obs["spread"] - computed) < 1e-6, (
            f"spread sign error: got {obs['spread']:.1f}, expected far-near={computed:.1f}"
        )
```

---

## End-to-end integration checklist for Araham

After applying the three fixes above, run these acceptance checks:

```bash
# 1. Clean dependency install
pip install -r backend/requirements.txt
python -c "import quant.service_adapter; print('adapter import OK')"

# 2. Quant-side tests (already passing — do not regress)
cd /path/to/GOLD
py -3.13 -m pytest tests -q         # must be 80+ passed, 0 failed

# 3. Backend regression tests
cd /path/to/backend
pytest tests/ -q

# 4. Manual end-to-end smoke test
# Start backend: uvicorn backend.app.main:app --reload
# POST /api/analytics/backtest with valid GOLDM pair →
#   response.runnable must be True or False per the quant service result
#   response.gross_pnl must be a float (not None) when runnable=True
# GET /api/pairs/GOLDM_near20261204_far20270105/history →
#   each observation.spread == far_close - near_close (positive for gold carry)
```

## Spread sign reference (for documentation and frontend)

| Field | Formula | Notes |
|---|---|---|
| `spread` | `far_close - near_close` | Rs/10g. Positive = far above near (normal carry). |
| LONG SPREAD | buy far, sell near | Profits when spread rises. Engine call: `SELL_NEAR_BUY_FAR`. |
| SHORT SPREAD | sell far, buy near | Profits when spread falls. Engine call: `BUY_NEAR_SELL_FAR`. |

This matches `quant/spreads.py` (line 119), `quant/service_adapter.py` (line 21),
and the `API_CONTRACT.md` wording. Do not invert.
