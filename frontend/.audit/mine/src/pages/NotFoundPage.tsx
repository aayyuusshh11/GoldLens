import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionPanel } from "@/components/primitives/SectionPanel";
import { EmptyState } from "@/components/primitives/EmptyState";

export default function NotFoundPage() {
  return (
    <div>
      <PageHeader kicker="Not found" title="This page does not exist" />
      <SectionPanel kicker="Navigation" title="Return to Overview">
        <EmptyState title="Unknown address">
          The research terminal has five areas: Overview, Pair Explorer, Signal
          Forensics, Backtest, and Data Quality.
        </EmptyState>
        <Link
          to="/"
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-elevated"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Go to Overview
        </Link>
      </SectionPanel>
    </div>
  );
}
