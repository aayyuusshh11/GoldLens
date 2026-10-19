import { NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  Crosshair,
  Home,
  ReceiptText,
  ShieldCheck,
  Table,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Information architecture from SKILLS.md — order matters (workflow top→down). */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Overview", blurb: "Run status & provenance", icon: Home, end: true },
  { to: "/pair", label: "Pair Explorer", blurb: "Legs & spread series", icon: ArrowLeftRight },
  { to: "/signals", label: "Signal Forensics", blurb: "Z-scores, filters, rationale", icon: Crosshair },
  { to: "/backtest", label: "Backtest", blurb: "Metrics, trades, validity", icon: ReceiptText },
  { to: "/contracts", label: "Eligible Contracts", blurb: "Filters & registry", icon: Table },
  { to: "/data-quality", label: "Data Quality", blurb: "Sources & methodology", icon: ShieldCheck },
];

export function SidebarNav() {
  return (
    <nav aria-label="Primary" className="px-3 py-4">
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex items-start gap-3 rounded-lg border-l-2 px-3 py-2 transition-colors ${
                  isActive
                    ? "border-l-gold bg-surface text-gold"
                    : "border-l-transparent text-mute hover:bg-elevated/60 hover:text-ink"
                }`
              }
            >
              <item.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-[11px] text-mute">{item.blurb}</span>
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
