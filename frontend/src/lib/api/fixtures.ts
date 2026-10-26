import type {
  BacktestRunDTO,
  BacktestRunRequestDTO,
  ContractDTO,
  ContractsResponseDTO,
  DataQualityReportDTO,
  HealthDTO,
  PairHistoryDTO,
  PairSummaryDTO,
  PairsResponseDTO,
  SignalAnalyzeDTO,
  SignalAnalyzeRequestDTO,
  SpreadObservationDTO,
} from "../../types/api";

/**
 * FIXTURE MODE — offline mirror of the settled backend contract.
 *
 * Everything here shapes ONE story: the verified 1-trading-day sample dataset
 * ("2026-10-16", GOLD/GOLDM rows from the supplied sample report). It mirrors
 * what the real backend returns for a 1-day dataset: NO_TRADE decisions, null
 * quant fields, runnable:false refusals — never fabricated analytics.
 *
 * INTERIM dataset, deltas explicitly noted:
 *  - Contracts register here lists the 12 GOLD/GOLDM expiries present in the
 *    supplied sample. docs/API_CONTRACT.md §7 (real full-file ingest) counts
 *    15 unverified gold-family contracts; fixture uses 12 so data-quality and
 *    the contracts screen agree. Real captured responses replace this when
 *    the actual CSV is ingested (see docs/INTEGRATION_BLOCKERS.md §6).
 *  - Pair-history observations without recorded zero-volume handling carry
 *    the analytics statuses the backend emits (observation/reference_only).
 *
 * The old "report" fixture (fixtures/api_contract_sample.json) is a quant
 * boundary artefact. It is NOT served by any endpoint and is never shown in
 * live mode (Implementation.txt P9 task 9).
 */

/** The fixture dataset's single trading day. */
export const FIXTURE_TRADE_DATE = "2026-10-16";

/** Copy for the header pill / fixture banner: exactly what this dataset is. */
export const FIXTURE_META = {
  tradeDate: FIXTURE_TRADE_DATE,
  sourceFile: "BhavCopyDateWise_16102026 (2).csv",
  description:
    "Mirror of the real backend responses for a 1-trading-day ingest: candidate-only pairs, NO_TRADE decisions, backtests refused (runnable:false) — nothing fabricated.",
} as const;

/** (symbol → expiry → {close, volume_lots}) from the supplied sample report. */
const CLOSSES: Record<string, Record<string, { close: number; volume_lots: number }>> = {
  GOLDM: {
    "2026-11-05": { close: 146425, volume_lots: 37203 },
    "2026-12-04": { close: 147866, volume_lots: 11780 },
    "2027-01-05": { close: 149227, volume_lots: 1158 },
    "2027-02-05": { close: 150559, volume_lots: 444 },
    "2027-03-05": { close: 151932, volume_lots: 151 },
    "2027-04-05": { close: 153161, volume_lots: 17 },
  },
  GOLD: {
    "2026-12-04": { close: 147918, volume_lots: 5091 },
    "2027-02-05": { close: 150364, volume_lots: 119 },
    "2027-04-05": { close: 152306, volume_lots: 0 },
    "2027-06-04": { close: 154081, volume_lots: 0 },
    "2027-08-05": { close: 156327, volume_lots: 0 },
    "2027-10-05": { close: 155143, volume_lots: 0 },
  },
};

export const FIXTURE_SYMBOLS = Object.keys(CLOSSES);
const CONTRACT_COUNT = Object.values(CLOSSES).reduce(
  (sum, legs) => sum + Object.keys(legs).length,
  0,
);

function expiriesOf(symbol: string): string[] {
  const legs = CLOSSES[symbol];
  if (legs === undefined) return [];
  return Object.keys(legs).sort();
}

function isoId(symbol: string, expiry: string): string {
  return `FUTCOM_${symbol}_${expiry.replace(/-/g, "")}`;
}

/** Mirror of analytics.PAIR_ID_RE parsing. */
function parsePairId(pairId: string): { symbol: string; near: string; far: string } | null {
  const match = /^(?<symbol>[A-Z0-9]+)_near(?<near>\d{8})_far(?<far>\d{8})$/.exec(pairId);
  const groups = match?.groups;
  if (
    groups === undefined ||
    groups.symbol === undefined ||
    groups.near === undefined ||
    groups.far === undefined
  ) {
    return null;
  }
  const near = `${groups.near.slice(0, 4)}-${groups.near.slice(4, 6)}-${groups.near.slice(6)}`;
  const far = `${groups.far.slice(0, 4)}-${groups.far.slice(4, 6)}-${groups.far.slice(6)}`;
  return { symbol: groups.symbol, near, far };
}

function unverifiedWarning(count: number) {
  return {
    code: "UNVERIFIED_SPEC",
    severity: "warning",
    count,
    message:
      "no contract specification is verified in this registry; eligibility requires quant+spec verification",
  };
}

// --------------------------------------------------------------------- //
// Fixture resolvers — each mirrors the matching backend endpoint behavior.
// --------------------------------------------------------------------- //

export function fixtureHealth(): HealthDTO {
  return {
    status: "healthy",
    service: "goldlens-backend",
    version: "0.1.0",
    data_available: true,
    distinct_trade_dates: 1,
    latest_data_date: FIXTURE_TRADE_DATE,
  };
}

export function fixtureContracts(query?: { symbol?: string; limit?: number; offset?: number }): ContractsResponseDTO {
  const symbolFilter = query?.symbol && CLOSSES[query.symbol] !== undefined ? query.symbol : undefined;
  const all: ContractDTO[] = [];
  for (const symbol of FIXTURE_SYMBOLS) {
    if (symbolFilter !== undefined && symbol !== symbolFilter) continue;
    for (const expiry of expiriesOf(symbol)) {
      all.push({
        contract_id: isoId(symbol, expiry),
        symbol,
        instrument_type: "FUTCOM",
        expiry_date: expiry,
        contract_size: null,
        units: null,
        quotation_unit: null,
        purity: null,
        tick_size: null,
        expiry_rule: null,
        verification_status: "unverified",
        verified_fields: [],
        source: null,
        verification_timestamp: null,
        effective_from: null,
        effective_to: null,
        first_observed_date: FIXTURE_TRADE_DATE,
        last_observed_date: FIXTURE_TRADE_DATE,
        updated_at: null,
      });
    }
  }
  all.sort((a, b) => (a.symbol === b.symbol ? (a.expiry_date ?? "").localeCompare(b.expiry_date ?? "") : a.symbol.localeCompare(b.symbol)));
  const offset = Math.max(0, query?.offset ?? 0);
  const limit = Math.min(Math.max(1, query?.limit ?? 500), 1000);
  const page = all.slice(offset, offset + limit);
  return { total: all.length, count: page.length, offset, contracts: page };
}

/** Adjacent-expiry candidate pairs, exactly like analytics.list_pairs. */
export function fixturePairs(symbol?: string): PairsResponseDTO {
  // Filtered like the backend: an unknown symbol yields NO pairs, never a
  // fallback to all fixture symbols.
  const symbols = symbol !== undefined ? [symbol] : FIXTURE_SYMBOLS;
  const pairs: PairSummaryDTO[] = [];
  for (const sym of symbols) {
    const expiries = expiriesOf(sym);
    for (let i = 0; i < expiries.length - 1; i += 1) {
      const near = expiries[i];
      const far = expiries[i + 1];
      if (near === undefined || far === undefined) continue;
      const gapDays = Math.round(
        (Date.parse(far) - Date.parse(near)) / 86_400_000,
      );
      if (gapDays > 400) continue; // MAX_PAIR_LAG_DAYS
      pairs.push({
        pair_id: `${sym}_near${near.replace(/-/g, "")}_far${far.replace(/-/g, "")}`,
        symbol: sym,
        near: { contract_id: isoId(sym, near), expiry_date: near },
        far: { contract_id: isoId(sym, far), expiry_date: far },
        status: "candidate_only",
        reason_codes: ["UNVERIFIED_SPEC"],
        history_days: 1,
      });
    }
  }
  return {
    pairs,
    warnings: [unverifiedWarning(CONTRACT_COUNT)],
  };
}

function observationRow(pairId: string) {
  const parsed = parsePairId(pairId);
  if (parsed === null) return null;
  const legs = CLOSSES[parsed.symbol];
  if (legs === undefined) return null;
  const nearLeg = legs[parsed.near];
  const farLeg = legs[parsed.far];
  if (nearLeg === undefined || farLeg === undefined) return { parsed, row: null };
  const reasons = new Set<string>();
  for (const leg of [nearLeg, farLeg]) {
    if (leg.volume_lots === 0) {
      reasons.add("ZERO_VOLUME");
      reasons.add("STALE_PRICE");
    }
  }
  const tradable = nearLeg.volume_lots > 0 && farLeg.volume_lots > 0;
  return {
    parsed,
    row: {
      trade_date: FIXTURE_TRADE_DATE,
      near_close: nearLeg.close,
      far_close: farLeg.close,
      // Settled backend formula (analytics.py pair_history + quant engine):
      // spread = far_close − near_close (Rs per 10 g; positive = far premium).
      spread: farLeg.close - nearLeg.close,
      status: tradable ? "observation" : "reference_only",
      reason_codes: [...reasons].sort(),
    },
  };
}

export function fixturePairHistory(pairId: string): PairHistoryDTO | null {
  const parsedRaw = parsePairId(pairId);
  if (parsedRaw === null) return null;
  const observations: SpreadObservationDTO[] = [];
  const resolved = observationRow(pairId);
  if (resolved?.row !== null && resolved?.row !== undefined) observations.push(resolved.row);
  return {
    pair_id: pairId,
    symbol: parsedRaw.symbol,
    near_expiry: parsedRaw.near,
    far_expiry: parsedRaw.far,
    observations,
    count: observations.length,
    warnings: [
      {
        code: "INSUFFICIENT_HISTORY",
        severity: "warning",
        count: 1,
        message:
          "1 distinct trading date(s) stored: this is reference data, not a history series",
      },
      unverifiedWarning(CONTRACT_COUNT),
    ],
  };
}

export function fixtureSignalAnalyze(request: SignalAnalyzeRequestDTO): SignalAnalyzeDTO | null {
  if (/^([A-Z0-9]+)_near(\d{8})_far(\d{8})$/.test(request.pair_id) === false) return null;
  const resolved = observationRow(request.pair_id);
  const asOfValid = (request.as_of_date ?? FIXTURE_TRADE_DATE) === FIXTURE_TRADE_DATE;
  const reasonCodes: string[] = [];
  if (!asOfValid) reasonCodes.push("DATE_NOT_IN_DATA");
  reasonCodes.push("INSUFFICIENT_HISTORY");
  reasonCodes.push("UNVERIFIED_SPEC");
  return {
    pair_id: request.pair_id,
    as_of_date: request.as_of_date ?? FIXTURE_TRADE_DATE,
    decision: "NO_TRADE",
    reason_codes: [...new Set(reasonCodes)].sort(),
    spread: resolved?.row?.status !== undefined && asOfValid ? resolved.row.spread : null,
    z_score: null,
    gross_edge: null,
    estimated_cost: null,
    net_edge: null,
    data_quality: {
      distinct_trade_dates: 1,
      latest_data_date: FIXTURE_TRADE_DATE,
      trading_days_available: resolved?.row !== null && resolved?.row !== undefined ? 1 : 0,
      warnings: [
        {
          code: "INSUFFICIENT_HISTORY",
          severity: "error",
          count: 1,
          message:
            "1 distinct trading date(s) stored; rolling z-score requires more history",
        },
      ],
    },
    notes: "z-score/edge/cost fields are null: quant service (Aayush S. Kushwaha) owns these formulas; overriding would fabricate values from one day of data",
  };
}

export function fixtureBacktestRun(request: BacktestRunRequestDTO): BacktestRunDTO | null {
  if (/^([A-Z0-9]+)_near(\d{8})_far(\d{8})$/.test(request.pair_id) === false) return null;
  const resolved = observationRow(request.pair_id);
  const start = request.start_date;
  const end = request.end_date;
  const inRange =
    resolved?.row !== null &&
    resolved?.row !== undefined &&
    (start === undefined || start === null || start <= FIXTURE_TRADE_DATE) &&
    (end === undefined || end === null || end >= FIXTURE_TRADE_DATE);
  return {
    run_id: "bt_fixture_0001",
    pair_id: request.pair_id,
    strategy_version: request.strategy_version ?? "default",
    evaluation_period: { start_date: start ?? null, end_date: end ?? null },
    observation_count: inRange ? 1 : 0,
    completed_trades: 0,
    gross_pnl: null,
    estimated_costs: null,
    net_pnl: null,
    max_drawdown: null,
    assumptions: [],
    warnings: [
      {
        code: "INSUFFICIENT_HISTORY",
        severity: "error",
        count: 1,
        message:
          "1 distinct trading date(s) stored (< required for walk-forward); backtest refused",
      },
    ],
    runnable: false,
  };
}

export function fixtureDataQuality(): DataQualityReportDTO {
  return {
    generated_at: new Date().toISOString(),
    sources: [
      {
        file: "BhavCopyDateWise_16102026 (2).csv",
        ingested_at: `${FIXTURE_TRADE_DATE}T00:00:00Z`,
        input_rows: 15535,
        accepted_rows: 15535,
        rejected_rows: 0,
        observations_inserted: 15535,
        observations_skipped: 0,
        status: "ingested",
      },
    ],
    rows: {
      total: 15535,
      futcom_rows: 168,
      options_rows: 14730,
      futidx_rows: 7,
      rejected_rows: 0,
    },
    dates_available: [FIXTURE_TRADE_DATE],
    issues: [
      {
        code: "ZERO_VOLUME_ROWS",
        severity: "warning",
        count: 14592,
        message:
          "rows report Volume(Lots)=0; populated closes on these rows are reference values, not tradable quotes",
      },
      {
        code: "MISSING_VOLUME_ROWS",
        severity: "warning",
        count: 0,
        message: "rows with no volume observation (distinct from zero volume — never conflate)",
      },
      {
        code: "MISSING_OHLC_ROWS",
        severity: "warning",
        count: 14592,
        message: "missing open/high/low; close may still be populated on these rows",
      },
      {
        code: "MISSING_SETTLEMENT_ROWS",
        severity: "critical",
        count: 15535,
        message: "source has no settlement-price column; settlement unavailable for every row",
      },
      {
        code: "ZERO_OI_ROWS",
        severity: "info",
        count: 14346,
        message: "rows reporting open interest 0",
      },
      {
        code: "MISSING_OI_ROWS",
        severity: "info",
        count: 0,
        message: "rows with no open-interest observation",
      },
      {
        code: "INVALID_OHLC_RANGE_ROWS",
        severity: "error",
        count: 0,
        message: "high below low (or structurally invalid range)",
      },
      {
        code: "DUPLICATE_BUSINESS_KEYS",
        severity: "info",
        count: 0,
        message:
          "rows beyond the first sharing (trade_date, instrument, symbol, expiry, option_type, strike_price); storage keeps first occurrence — see ingest report for file-level counts",
      },
      {
        code: "UNSUPPORTED_INSTRUMENT_ROWS",
        severity: "info",
        count: 15360,
        message:
          "rows excluded from the gold-futures analytics path (options/index contracts); retained and counted, never silently dropped",
      },
      {
        code: "NO_UNIT_ROWS",
        severity: "warning",
        count: 0,
        message: "volume-quantity parsed without unit token",
      },
      {
        code: "CONTRACT_SPECS_UNVERIFIED",
        severity: "warning",
        count: CONTRACT_COUNT,
        message:
          "contract registry entries whose size/purity/quotation/tick/expiry-rule are unverified by an authoritative source; known values stay null",
      },
      {
        code: "INSUFFICIENT_HISTORY",
        severity: "error",
        count: 1,
        message:
          "1 distinct trading date(s) (2026-10-16..2026-10-16) is below the 30-date minimum: rolling z-scores, walk-forward backtesting and performance claims are refused",
      },
    ],
    contract_spec_verification: {
      verified: 0,
      unverified: CONTRACT_COUNT,
      conflicting: 0,
    },
    history_sufficiency: {
      distinct_trade_dates: 1,
      minimum_required: 30,
      sufficient_for_signal: false,
      sufficient_for_backtest: false,
    },
  };
}
