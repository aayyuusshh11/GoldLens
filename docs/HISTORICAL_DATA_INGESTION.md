# MCX Historical Data Ingestion

Status: **automated download verified BLOCKED from this environment; manual
checklist provided.** Everything below is what was actually verified on
2026-10-20, not assumed.

## 1. Source mechanism (verified against the exchange site)

- Bhavcopy page: `https://www.mcxindia.com/market-data/bhavcopy`
  (`Bhav Copy` tab, Instrument: ALL/FUTCOM/FUTIDX/OPTCOM/OPTFUT/OPTIDX,
  From/To dates, Show) — monthly/date-wise grids, data available from
  **November 2003** (per the page itself).
- The page is an ASP.NET application; the date-wise grid issues an XHR to
  `GET /MarketData/GetDateWiseBhavCopy?InstrumentName=ALL&fromDate=DD/MM/YYYY`
  using the page's `__RequestVerificationToken` (XSRF) and a session cookie.
- Metadata endpoints: `https://www.mcxindia.com/market-data/historical-data`
  (year/month/date-wise turnover reports); licensed machine feeds exist via
  `datafeed@mcxindia.com` (real-time + EOD, subscription required).

## 2. Live accessibility probe (2026-10-20, this machine/network)

```
py -3.13 -m quant.ingestion.historical_downloader --start-date 2026-10-16 --end-date 2026-10-16 --output-dir data/raw/mcx
→ manifest data/raw/mcx/manifest_download.json
→ status: manual_required — "HTTP 403, browser-like response (access control/HTML page)"
```

A bare `requests` GET of the page itself also returned **HTTP 403**.
Third-party tooling (TradeEntry MCXEOD docs) reports the same root cause:
MCX's WAF blocks plain non-browser HTTP clients (TLS fingerprinting) and
rate-limits unpaused bursts. `curl_cffi` (browser-impersonating client) is
NOT installed in this environment and was not force-installed: per the
access-control policy, the automated path **stops immediately** on an
unauthorized-looking response rather than attempting to work around
protections.

## 3. Import path & Ingested Files (Pass 11 Status)

The exchange's date-wise BhavCopy CSVs import directly through the unified
file discovery mechanism (`quant.data.find_bhavcopy_files`). Files placed in
either `data/raw/mcx/` or the repository root are automatically discovered,
checksummed, validated, and deduplicated.

Current verified historical files in repository:

| File Path | SHA-256 | Trading Date | FUTCOM Rows | Ingestion Status |
|---|---|---|---|---|
| `data/raw/mcx/BhavCopyDateWise_19102026.csv` | `f5ae9c5a32c163c3116f3db0d442a06c8aedb43476f1249126840509e138263c` | 2026-10-19 | 168 | **Ingested & Verified** |
| `BhavCopyDateWise_16102026.csv` | `74a1e5a66faad9e8aa6d71210be9cc653a2e9672a733ba1c1107539171d5ef66` | 2026-10-16 | 168 | **Ingested & Verified** |
| `BhavCopyDateWise_16102026 (2).csv` | `97fb1028bca988d13ecf47895253feb9537c6700f6cd09ce4927d9b623f9a53e` | 2026-10-16 | 168 | **Ingested & Deduplicated** |

Provenances and per-file row statistics are persisted to:
- `data/raw/mcx/manifest_imported.json` (intake audit manifest)
- `data/reports/data_quality_report.json` and `DATA_QUALITY_REPORT.md`

Naming contract: `BhavCopyDateWise_<DDMMYYYY>.csv`.

## 4. Downloader (available for when exchange permits / next run)

```
py -3.13 -m quant.ingestion.historical_downloader \
    --start-date 2026-01-05 --end-date 2026-06-30 \
    --output-dir data/raw/mcx [--dry-run] [--timeout 30] \
    [--max-retries 2] [--rate-limit 1.2]
```

Guarantees (all unit-tested, `tests/test_ingestion.py`):

- **dry run** plans weekdays without writing raw files
- **bounded retries** (`--max-retries`, default 2), never infinite
- **rate limit** (default 1.2 s between requests; the exchange's WAF bans
  bursts — observed 403-lockouts on IP/session level)
- **resumable**: verified existing files skipped (`skipped_verified`)
- **immutability**: raw payloads are written read-only (`0o444`); a changed
  checksum on re-fetch → new bytes quarantined as
  `bhavcopy_YYYYMMDD.conflict_< utc >.json` — never silently overwritten
- **SHA-256 + JSON manifest** per attempt (`manifest_download.json`)
- **holidays/unavailable dates** recorded as `holiday_or_unavailable`,
  never back-filled or invented
- **HTML error pages / 403 / other 4xx** → `manual_required` / `blocked`,
  no file written, checklist printed

Raw payloads are stored verbatim under `data/raw/mcx/`. A separate
converter (`quant.ingestion.validation.mcx_json_rows_to_csv_rows`) maps the
GetDateWiseBhavCopy JSON schema to the canonical CSV contract; unknown
schemas raise `IngestionError` and are never coerced silently.

## 5. Manual download checklist (required until access is granted)

1. Open `https://www.mcxindia.com/market-data/bhavcopy` in a browser.
2. Instrument: `ALL` (FUTCOM rows are the only ones consumed; options are
   dropped by the loader, not here).
3. Set From / To; click **Show**; use the page's own export control.
4. Save each day's file as `BhavCopyDateWise_<DDMMYYYY>.csv` under
   `data/raw/mcx/` (or the repo root, wherever the loader is pointed).
5. Run the validator to certify the import and refresh the DQ report:
   `py -3.13 -m quant.ingestion.generate_reports`
6. Re-run the readiness audit; the `dataCoverage` /
   `minSpreadObservations` gates will reflect the new window honestly.

If a *subscribe-able* alternative is desired: the licensed EOD feed is the
accountable route (`datafeed@mcxindia.com`, form → agreement → payment);
it bypasses none of the controls.
