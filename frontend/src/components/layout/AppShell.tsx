import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, RefreshCw, X } from "lucide-react";
import { useReport } from "../../app/ReportContext";
import { REPORT_SYMBOLS, type ReportSymbol } from "../../types/api";
import { DataModePill } from "./DataModePill";
import { FixtureBanner } from "./FixtureBanner";
import { NAV_ITEMS, SidebarNav } from "./SidebarNav";

function SymbolSelector() {
  const { symbol, setSymbol, source } = useReport();
  return (
    <label className="flex items-center gap-2">
      <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-mute sm:inline">
        Family
      </span>
      <select
        aria-label="Contract family"
        value={symbol}
        onChange={(event) => setSymbol(event.target.value as ReportSymbol)}
        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink hover:border-mute/60"
      >
        {REPORT_SYMBOLS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="sr-only">
        {source.mode === "fixture"
          ? "Fixture mode: only GOLDM has data in the bundled sample."
          : "Switching family re-queries the backend report for that symbol."}
      </span>
    </label>
  );
}

function Header() {
  const { refresh, entry } = useReport();
  const [menuOpen, setMenuOpen] = useState(false);
  const busy = entry.key === "loading" || (entry.key === "ready" && entry.refreshing);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base">
      <div className="mx-auto flex h-14 w-full max-w-content items-center gap-3 px-4 md:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="relative inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-gold"
          >
            <span className="h-2 w-2 rounded-full bg-gold" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight text-ink">GoldLens</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-widest text-mute">
              MCX gold calendar spreads
            </span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <DataModePill />
          <SymbolSelector />
          <button
            type="button"
            aria-label="Reload report"
            title="Reload report (bypasses the in-memory cache)"
            onClick={refresh}
            disabled={busy}
            className="rounded-lg border border-line bg-surface p-2 text-mute hover:border-gold/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "opacity-60" : ""}`} aria-hidden />
          </button>
          <button
            type="button"
            className="rounded-lg border border-line bg-surface p-2 text-mute hover:text-ink lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-nav" className="border-t border-line bg-surface lg:hidden">
          <nav aria-label="Primary mobile" className="px-3 py-2">
            <ul>
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                        isActive ? "bg-elevated text-gold" : "text-mute hover:text-ink"
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}

/** App shell: sticky header, desktop sidebar, fixture banner, footer. */
export function AppShell({ children }: { children: ReactNode }) {
  const { source } = useReport();

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Header />
      <div className="mx-auto flex w-full max-w-content flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r border-line bg-base lg:block">
          <SidebarNav />
        </aside>
        <main id="main-content" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-content px-4 py-6 md:px-8 md:py-8">
            {source.mode === "fixture" && <FixtureBanner />}
            {children}
            <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-mute">
              <p>
                Historical research output — not trading advice. Expiries, costs and
                spread conventions follow the quant pipeline; see Data Quality.
              </p>
              <p className="font-mono">
                {source.mode === "fixture"
                  ? "data source: bundled sample fixture"
                  : (source.config.baseUrl ?? "API base URL not set")}
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
