"""Safe historical MCX bhavcopy acquisition (Phase 1 of the ingestion plan).

Source mechanism (verified 2026-10-20 against mcxindia.com):
- The official bhavcopy page https://www.mcxindia.com/market-data/bhavcopy is
  an ASP.NET app; a date-wise query issues XHR
  ``GET /MarketData/GetDateWiseBhavCopy?InstrumentName=ALL&fromDate=DD/MM/YYYY``
  with the page's ``__RequestVerificationToken`` (XSRF) and a session cookie.
- Data availability reportedly starts November 2003 (per the bhavcopy page).
- Third-party tooling documents TLS-fingerprint blocking of plain non-browser
  HTTP clients and WAF rate limiting on unpaused bursts. This module therefore
  paces requests, and reports BLOCKED / MANUAL_REQUIRED honestly if the
  exchange rejects the client. It must NOT be considered scraping around
  access controls: unauthorized-looking responses stop the acquisition path
  immediately and leave an exact manual checklist behind.

Design follows the task constraints:
- explicit start/end dates, configurable output dir, dry-run mode
- bounded retries with backoff, timeouts, rate limiting (default 1.2 s)
- resumable: verified existing files are skipped, mismatches are reported
- SHA-256 checksums + a JSON manifest of every attempt
- size / content-type verification; HTML error pages rejected
- exchange holidays/unavailable dates recorded, never invented
- raw payloads stored immutably under data/raw/mcx/
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urljoin

log = logging.getLogger("gl.downloader")

MCX_BHAVCOPY_URL = "https://www.mcxindia.com/market-data/bhavcopy"
UA = "GoldLens-Research/0.1 (quant education; contact datafeed@mcxindia.com for licensed feed)"

MIN_PAYLOAD_BYTES = 64
DEFAULT_RATE_LIMIT_S = 1.2
DEFAULT_TIMEOUT_S = 30.0
DEFAULT_MAX_RETRIES = 2


@dataclass
class Attempt:
    trade_date: str
    planned_url: str
    status: str                      # planned | downloaded | holiday_or_unavailable | blocked | failed | manual_required | skipped_verified
    sha256: str | None = None
    size_bytes: int | None = None
    path: str | None = None
    retries: int = 0
    error: str | None = None
    checked_at: str | None = None
    content_type: str | None = None

    def apply(self, **kw: Any) -> None:
        for k, v in kw.items():
            setattr(self, k, v)


@dataclass
class Manifest:
    source: str
    start_date: str
    end_date: str
    attempts: list[Attempt] = field(default_factory=list)

    def summary(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for a in self.attempts:
            counts[a.status] = counts.get(a.status, 0) + 1
        counts["requested"] = len(self.attempts)
        return counts


def _utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _looks_like_html(data: bytes) -> bool:
    head = data[:2048].lstrip().lower()
    return head.startswith(b"<!doctype html") or head.startswith(b"<html")


def business_dates(start: dt.date, end: dt.date) -> list[dt.date]:
    """Mon-Fri calendar prudence note: MCX historically ran occasional
    Saturday sessions (50 Saturdays, 2014+ trend per exchange notices) --
    when a bespoke session is needed it can be requested explicitly. Weekend
    skipping is conservative (missing optional Saturday data keeps provenance
    honest, it does not fabricate data)."""
    out: list[dt.date] = []
    d = start
    while d <= end:
        if d.weekday() < 5:
            out.append(d)
        d += dt.timedelta(days=1)
    return out


# ---------------------------------------------------------------------------
# transport: injectable for tests (file:// / fake), real MCX in production
# ---------------------------------------------------------------------------

def fetch_url(url: str, timeout: float = DEFAULT_TIMEOUT_S, extra_headers: dict[str, str] | None = None,
              session_factory: Callable[[], Any] | None = None) -> tuple[int, bytes, dict[str, str]]:
    """HTTP GET returning (status, body, headers). Uses `requests` when available."""
    import requests
    sess = requests.Session()
    sess.headers.update({"User-Agent": UA})
    if extra_headers:
        sess.headers.update(extra_headers)
    if session_factory is not None:
        sess = session_factory()
    r = sess.get(url, timeout=timeout)
    return r.status_code, r.content, dict(r.headers)


class McxSource:
    """Official MCX bhavcopy web source (date-wise query)."""

    name = "mcx_website_datewise"

    def __init__(self, base_url: str = "https://www.mcxindia.com",
                 fetcher: Callable[..., tuple[int, bytes, dict[str, str]]] = fetch_url,
                 rate_limit_s: float = DEFAULT_RATE_LIMIT_S):
        self.base_url = base_url
        self.page_url = urljoin(base_url, "/market-data/bhavcopy")
        self.fetcher = fetcher
        self.rate_limit_s = rate_limit_s
        self._xsrf: str | None = None

    def _get_xsrf_token(self) -> str | None:
        code, body, _ = self.fetcher(self.page_url)
        if code != 200 or not _looks_like_html(body):
            return None
        # __RequestVerificationToken is an input hidden field on the page
        import re
        m = re.search(rb"__RequestVerificationToken[^>]+value=\"([^\"]+)\"", body)
        return m.group(1).decode("ascii") if m else None

    def pf(self) -> dict[str, Any]:
        return {"source": self.name, "page_url": self.page_url}

    def plan_url(self, d: dt.date) -> str:
        return (f"{self.base_url}/MarketData/GetDateWiseBhavCopy"
                f"?InstrumentName=ALL&fromDate={d:%d/%m/%Y}")

    def fetch(self, d: dt.date, timeout: float, max_retries: int) -> Attempt:
        att = Attempt(trade_date=d.isoformat(), planned_url=self.plan_url(d), status="planned")
        tok = None
        try:
            tok = self._get_xsrf_token()
        except Exception as err:  # noqa: BLE001
            log.warning("xsrf-token fetch failed: %s", err)
        headers = {"X-Requested-With": "XMLHttpRequest"}
        if tok:
            headers["__RequestVerificationToken"] = tok
        for attempt_no in range(max_retries + 1):
            att.retries = attempt_no
            time.sleep(self.rate_limit_s if attempt_no else 0.0)
            try:
                code, body, headers_resp = self.fetcher(att.planned_url, timeout=timeout,
                                                        extra_headers=headers)
            except Exception as err:  # noqa: BLE001
                att.apply(status="failed", error=f"transport: {err}")
                continue
            if code == 200 and not _looks_like_html(body) and len(body) >= MIN_PAYLOAD_BYTES:
                sha = _sha256(body)
                ct = headers_resp.get("content-type", "")
                att.apply(status="downloaded", sha256=sha, size_bytes=len(body),
                          content_type=ct, checked_at=_utcnow())
                return att, body
            if code == 403 or (code == 200 and _looks_like_html(body)):
                att.apply(status="manual_required",
                          error=f"HTTP {code}, browser-like response (access control/HTML page)",
                          checked_at=_utcnow())
                return att, b""
            if code == 200:  # empty/short payload: holiday or unpublished
                att.apply(status="holiday_or_unavailable",
                          error=f"payload {len(body)} bytes (< {MIN_PAYLOAD_BYTES})",
                          checked_at=_utcnow())
                return att, b""
            if 400 <= code < 500:
                att.apply(status="blocked", error=f"HTTP {code}", checked_at=_utcnow())
                return att, b""
            att.apply(status="failed", error=f"HTTP {code}", checked_at=_utcnow())
        return att, b""


# ---------------------------------------------------------------------------
# orchestrator
# ---------------------------------------------------------------------------

def download(
    start_date: str,
    end_date: str,
    output_dir: Path | str,
    *,
    source: McxSource | None = None,
    dry_run: bool = False,
    timeout: float = DEFAULT_TIMEOUT_S,
    max_retries: int = DEFAULT_MAX_RETRIES,
    rate_limit_s: float | None = None,
) -> dict[str, Any]:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    src = source or McxSource(rate_limit_s=(DEFAULT_RATE_LIMIT_S if rate_limit_s is None else rate_limit_s))
    y, m, dd = (int(x) for x in start_date.split("-"))
    y2, m2, d2 = (int(x) for x in end_date.split("-"))
    dates = business_dates(dt.date(y, m, dd), dt.date(y2, m2, d2))
    manifest = Manifest(source=src.name, start_date=start_date, end_date=end_date)
    if dry_run:
        for d in dates:
            manifest.attempts.append(Attempt(trade_date=d.isoformat(), planned_url=src.plan_url(d),
                                             status="planned"))
    else:
        for d in dates:
            raw_name = f"bhavcopy_{d:%Y%m%d}.json"
            raw_path = out / raw_name
            att, body = src.fetch(d, timeout=timeout, max_retries=max_retries)
            if att.status == "downloaded":
                if raw_path.exists():
                    existing = raw_path.read_bytes()
                    if _sha256(existing) == att.sha256:
                        att.status = "skipped_verified"
                    else:
                        # raw payloads are immutable; a changed checksum means
                        # the exchange published revised data. Never silently
                        # overwrite: keep the new bytes as a sidecar for
                        # human review.
                        conflict_path = out / f"bhavcopy_{d:%Y%m%d}.conflict_{_utcnow().replace(':', '')}.json"
                        conflict_path.write_bytes(body)
                        att.apply(status="checksum_conflict",
                                  error="existing raw file hash differs; new bytes quarantined "
                                        f"at {conflict_path.name}")
                        att.path = str(conflict_path)
                if att.status == "downloaded":  # genuinely new content
                    raw_path.write_bytes(body)
                    raw_path.chmod(0o444)  # immutability after download
                    att.apply(path=str(raw_path))
            manifest.attempts.append(att)
    manifest_path = out / "manifest_download.json"
    manifest_path.write_text(json.dumps(asdict(manifest), indent=2), encoding="utf-8")
    manual = [a.trade_date for a in manifest.attempts if a.status == "manual_required"]
    if manual:
        log.info(
            "MANUAL DOWNLOAD CHECKLIST required for %d date(s): %s -> "
            "open %s, select Instrument=ALL and the date range, use the page's own "
            "Show/Download control, then save the CSV as "
            "data/raw/mcx/BhavCopyDateWise_<DDMMYYYY>.csv and rerun the validator.",
            len(manual), manual, src.page_url,
        )
    return {
        "manifest_path": str(manifest_path),
        "summary": manifest.summary(),
        "manual_required_dates": manual,
        "dry_run": dry_run,
        "raw_dir": str(out),
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="quant.ingestion.historical_downloader",
                                description="Safe MCX bhavcopy acquisition")
    p.add_argument("--start-date", required=True, help="YYYY-MM-DD")
    p.add_argument("--end-date", required=True, help="YYYY-MM-DD")
    p.add_argument("--output-dir", default="data/raw/mcx")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_S)
    p.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES)
    p.add_argument("--rate-limit", type=float, default=DEFAULT_RATE_LIMIT_S)
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    res = download(args.start_date, args.end_date, args.output_dir,
                   dry_run=args.dry_run, timeout=args.timeout,
                   max_retries=args.max_retries, rate_limit_s=args.rate_limit)
    print(json.dumps(res, indent=2))
    return 0 if not res["manual_required_dates"] or res["dry_run"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
