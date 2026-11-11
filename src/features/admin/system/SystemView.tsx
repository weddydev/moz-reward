import { CircleAlert, CircleCheck } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { QueueTable } from "./QueueTable";
import type { SystemView as View } from "./view-model";

function Stat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-small text-ink-2">{label}</dt>
      <dd className="text-small tabular text-right font-semibold">
        {warn ? <Badge tone="warning">{value}</Badge> : value}
      </dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card className="p-4">
      <h2 className="text-h2 mb-2">{title}</h2>
      {children}
    </Card>
  );
}

/** Admin System page body (P0-13): the health monitor's latest snapshot. Text always says what colour shows. */
export function SystemView({ view }: { view: View }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-ink-2">
        Snapshot from {view.takenAt} ({view.takenAgo} ago). The worker refreshes it every minute;
        reload for the latest.
      </p>
      {view.stale ? (
        <p role="alert" className="bg-gold-100 text-small rounded-md p-3 font-semibold">
          This snapshot is more than 3 minutes old: the worker may be down. See RUNBOOK “Worker
          down”.
        </p>
      ) : null}
      {view.alerts.length > 0 ? (
        <p className="text-small bg-warning-tint rounded-md p-3">
          <span className="font-semibold">Alerts raised by this snapshot:</span>{" "}
          {view.alerts.join(", ")}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Status">
          <ul className="divide-line divide-y">
            {view.status.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-4 py-2">
                <span className="text-small flex items-center gap-2 font-semibold">
                  {s.ok ? (
                    <CircleCheck
                      aria-hidden="true"
                      size={18}
                      strokeWidth={1.5}
                      className="text-success"
                    />
                  ) : (
                    <CircleAlert
                      aria-hidden="true"
                      size={18}
                      strokeWidth={1.5}
                      className="text-danger"
                    />
                  )}
                  {s.label}
                </span>
                <span className="text-small text-ink-2 text-right">
                  {s.ok ? "OK" : "Problem"} · {s.detail}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Free-tier quotas">
          <dl className="divide-line divide-y">
            <Stat label="Emails sent today" value={view.email.text} warn={view.email.warn} />
            <Stat
              label="Sentry errors this month"
              value={view.sentry.text}
              warn={view.sentry.warn}
            />
          </dl>
        </Section>

        <Section title="Outbox and failed jobs">
          <dl className="divide-line divide-y">
            <Stat label="Outbox rows waiting" value={String(view.outbox.pending ?? "unknown")} />
            <Stat label="Oldest waiting" value={view.outbox.oldest} warn={view.outbox.late} />
            <Stat
              label="Failed jobs (unresolved)"
              value={String(view.failedJobs.unresolved ?? "unknown")}
            />
            <Stat
              label="Failed in the last 10 min"
              value={String(view.failedJobs.recent ?? "unknown")}
              warn={(view.failedJobs.recent ?? 0) > 0}
            />
          </dl>
        </Section>

        <Section title="Host and backups">
          <dl className="divide-line divide-y">
            <Stat label={`Disk (${view.disk.path})`} value={view.disk.text} warn={view.disk.warn} />
            <Stat label="Database size" value={view.dbSize} />
            <Stat label="Live connections (SSE)" value={view.sse} />
            {view.backups.enabled ? (
              view.backups.rows.map((r) => (
                <Stat key={r.label} label={r.label} value={`${r.value} ago`} />
              ))
            ) : (
              <Stat label="Backups" value="Not set up yet (comes with staging)" />
            )}
          </dl>
        </Section>
      </div>

      <QueueTable rows={view.queues} />
    </div>
  );
}
