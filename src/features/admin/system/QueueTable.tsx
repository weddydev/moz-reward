"use client";

import { Badge, type Column, Table } from "@/components/ui";
import type { SystemView } from "./view-model";

type Row = SystemView["queues"][number];

const COLUMNS: ReadonlyArray<Column<Row>> = [
  { key: "name", header: "Queue", cell: (r) => r.name },
  { key: "waiting", header: "Waiting", cell: (r) => r.waiting, align: "right", numeric: true },
  { key: "active", header: "Active", cell: (r) => r.active, align: "right", numeric: true },
  { key: "delayed", header: "Delayed", cell: (r) => r.delayed, align: "right", numeric: true },
  { key: "failed", header: "Failed", cell: (r) => r.failed, align: "right", numeric: true },
  {
    key: "lag",
    header: "Oldest waiting",
    align: "right",
    cell: (r) => (r.lagging ? <Badge tone="warning">{r.lag}</Badge> : r.lag),
  },
];

/** Queue depth and lag (System page). Client only because the Table primitive has a density toggle. */
export function QueueTable({ rows }: { rows: ReadonlyArray<Row> }): React.JSX.Element {
  return (
    <Table
      caption="Queues"
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.name}
      empty={
        <p className="text-small text-ink-2 p-4">
          Queue figures unavailable: Redis is not answering.
        </p>
      }
    />
  );
}
