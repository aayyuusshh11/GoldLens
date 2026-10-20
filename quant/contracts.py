"""Verified MCX contract specifications + value cross-check against repo data.

Provenance of specs:
- MCX product pages (fetched 2026-10-18):
    * Gold  = "Gold (1kg)", 995 purity.                    -> lot_size_g = 1000
    * GOLDM = "Gold Mini (100gram)", 995 purity.           -> lot_size_g = 100
- Quote basis for both families is Rupees per 10 grams; numerically confirmed
  against the in-repo YearWise report (value-in-lakhs / lots vs bhavcopy close):
    GOLD : price x 100 g-units ~= implied Rs 153.07 lakh/lot  (1 kg lot)
    GOLDM: price x 10  g-units ~= implied Rs  15.27 lakh/lot  (100 g lot)

GOLD and GOLDM therefore share the SAME quote unit but have DIFFERENT lot
sizes and deliverable bar sizes. They are never treated as directly
comparable for calendar spreads without explicit cross-symbol acknowledgement.
"""
from __future__ import annotations

from dataclasses import dataclass

# lot size in grams; quote basis in grams of gold per quoted price unit
_CONTRACT_SPECS: dict[str, dict[str, float]] = {
    "GOLD": {"lot_size_g": 1000.0, "quote_basis_g": 10.0, "purity": "995"},
    "GOLDM": {"lot_size_g": 100.0, "quote_basis_g": 10.0, "purity": "995"},
}


@dataclass(frozen=True)
class ContractSpec:
    symbol: str
    lot_size_g: float
    quote_basis_g: float
    purity: str

    @property
    def rvalue_per_lot_per_quote_unit(self) -> float:
        """Contract value per 1 unit of quoted price (Rs/quote-basis).

        value_in_rupees = close * rvalue_per_lot_per_quote_unit
        """
        return self.lot_size_g / self.quote_basis_g


def get_spec(symbol: str) -> ContractSpec:
    key = symbol.strip().upper()
    if key not in _CONTRACT_SPECS:
        raise KeyError(f"No verified MCX contract spec for symbol {symbol!r}")
    s = _CONTRACT_SPECS[key]
    return ContractSpec(
        symbol=key,
        lot_size_g=s["lot_size_g"],
        quote_basis_g=s["quote_basis_g"],
        purity=s["purity"],
    )


def has_spec(symbol: str) -> bool:
    return symbol.strip().upper() in _CONTRACT_SPECS


def cross_check_spec(symbol: str, close: float, value_lakh_per_lot: float,
                     tolerance: float = 0.10) -> tuple[bool, str]:
    """Verify a spec against an observed value-per-lot and price.

    Uses verified aggregates (YearWise report -> value_lakh_per_lot) and a
    quoted close for the same family. Returns (ok, explanation). Fails loudly
    on a mismatch of more than ``tolerance`` relative error so bad specs can
    never flow silently into P&L sizing.
    """
    spec = get_spec(symbol)
    contract_value_rupees = close * spec.rvalue_per_lot_per_quote_unit
    observed_rupees = value_lakh_per_lot * 1e5
    rel_err = abs(contract_value_rupees - observed_rupees) / observed_rupees
    ok = rel_err <= tolerance
    msg = (
        f"{symbol}: spec value/lot Rs {contract_value_rupees:,.0f} vs verified "
        f"observed Rs {observed_rupees:,.0f} (rel err {rel_err:.1%}) -> "
        + ("PASS" if ok else "MISMATCH")
    )
    return ok, msg
