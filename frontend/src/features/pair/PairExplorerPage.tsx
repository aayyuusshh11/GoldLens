import type { BacktestReportDTO } from "../../types/api";
import { countStale } from "../../lib/reportAnalysis";
import { formatDateShort, formatInt } from "../../lib/formatters/format";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataNotice } from "../../components/primitives/DataNotice";
import { StaleBadge, StatusBadge } from "../../components/layout/Badges";
import { NearFarChart, SpreadSeriesChart } from "../../components/charts/SpreadChart";


const rejectionLabels: Record<string, string> = {
  invalid_price_rows_dropped: "non-finite price rows dropped",
  stale_rows_flagged: "rows flagged stale",
};

function ObservationsTable({ points }: { points: BacktestReportDTO["spread_observations"] }) {
  if (points.length === 0) {
    return (
      <DataNotice tone="info" title="No spread observations in this report">
        The pair selection produced no eligible near/far combination for this dataset.
      </DataNotice>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <caption className="sr-only">Spread observations per trading session (₹)</caption>
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-widest text-mute">
            <th scope="col" className="py-2 pr-3 font-semibold">Session</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Near close (₹)</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Far close (₹)</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Spread (₹)</th>
            <th scope="col" className="py-2 font-semibold">State</th>
          </tr>
        </thead>
        <tbody>
          {points.map((o) => (
            <tr key={o.trade_date} className="border-b border-line/50 last:border-b-0 hover:bg-elevated/40">
              <td className="py-2 pr-3 font-mono tabular text-ink">{formatDateShort(o.trade_date)}</td>
              <td className="py-2 pr-3 text-right font-mono tabular text-ink">{o.near_close.toFixed(2)}</td>
              <td className="py-2 pr-3 text-right font-mono tabular text-ink">{o.far_close.toFixed(2)}</td>
              <td className="py-2 pr-3 text-right font-mono tabular text-ink">{o.spread.toFixed(2)}</td>
              <td className="py-2">
                {o.stale ? <StaleBadge /> : <StatusBadge tone="mute">leg ok</StatusBadge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PairExplorerPage({ report }: { report: BacktestReportDTO }) {
  const rejections = Object.entries(report.pair.rejections);
  const staleCount = countStale(report.spread_observations);

  return (
    <div>
      <PageHeader
        kicker="Pair Explorer"
        title={`${report.pair.symbol} — near ${report.pair.near_expiry ?? "?"} vs far ${report.pair.far_expiry ?? "?"}`}
        subtitle="Expiries and spread are selected by the quant boundary on the latest eligible session; the UI renders them as-is."
        actions={<StatusBadge tone="mute">{formatInt(report.spread_observations.length)} observations</StatusBadge>}
      />

      <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3">
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Near leg</dt>
          <dd className="font-mono tabular text-sm text-gold">{report.pair.near_expiry ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Far leg</dt>
          <dd className="font-mono tabular text-sm text-[#8BA4C4]">{report.pair.far_expiry ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Filter failures</dt>
          <dd className="font-mono tabular text-sm text-ink">{formatInt(report.pair.filter_failures)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-mute">Stale flagged</dt>
          <dd className="font-mono tabular text-sm text-ink">{formatInt(staleCount)}</dd>
        </div>
        {rejections.map(([key, value]) => (
          <div key={key}>
            <dt className="text-[11px] uppercase tracking-widest text-mute">
              {rejectionLabels[key] ?? key}
            </dt>
            <dd className="font-mono tabular text-sm text-ink">{formatInt(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 xl:grid-cols-2">
        <NearFarChart observations={report.spread_observations} />
        <SpreadSeriesChart observations={report.spread_observations} />
      </div>

      <div className="mt-4">
        <DataNotice tone="info" title="What a spread is — and is not">
          <p>
            Spread is a raw research input in ₹ (far close − near close as produced by the
            pipeline). It is <span className="text-ink">not rupee P&L</span> and{" "}
            <span className="text-ink">not a guaranteed trading opportunity</span> — acting on
            it depends on the strategy&apos;s thresholds, filters and costs.
          </p>
        </DataNotice>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4 md:p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Observation log</h2>
        <ObservationsTable points={report.spread_observations} />
      </section>
    </div>
  );
}
