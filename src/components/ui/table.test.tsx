// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type Column, Table, overflowSides } from "./Table";

type Member = { id: string; name: string; visits: number };
const ROWS: Member[] = [
  { id: "K7Q-42M", name: "Aisha Khan", visits: 18 },
  { id: "R3D-9VX", name: "Tom Fletcher", visits: 9 },
];
const COLUMNS: Column<Member>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
  { key: "visits", header: "Visits", cell: (r) => r.visits, numeric: true },
];
const rowKey = (r: Member): string => r.id;

describe("[P0-09] Table", () => {
  it("renders a labelled table with one row per item", () => {
    render(<Table caption="Customers" columns={COLUMNS} rows={ROWS} rowKey={rowKey} />);
    const table = screen.getByRole("table", { name: "Customers" });
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2
    expect(within(table).getByRole("columnheader", { name: "Visits" })).toBeInTheDocument();
  });

  it("shows the empty row when there is nothing to list", () => {
    render(<Table caption="Customers" columns={COLUMNS} rows={[]} rowKey={rowKey} />);
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("shows skeleton rows while loading, marks the region busy and hides the empty row", () => {
    render(
      <Table
        caption="Customers"
        columns={COLUMNS}
        rows={[]}
        rowKey={rowKey}
        loading
        loadingRows={4}
      />,
    );
    expect(screen.getByRole("region", { name: "Customers" })).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll('[data-part="loading-row"]')).toHaveLength(4);
    expect(screen.queryByText("Nothing here yet.")).not.toBeInTheDocument();
    expect(screen.getByText("Loading Customers")).toBeInTheDocument();
  });

  it("gives rows with an action a real button: Enter and Space run it once", async () => {
    const onRowClick = vi.fn();
    render(
      <Table
        caption="Customers"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={rowKey}
        onRowClick={onRowClick}
        rowLabel={(r) => `Open ${r.name}`}
      />,
    );
    const open = screen.getByRole("button", { name: "Open Aisha Khan" });
    open.focus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[0]);
    await userEvent.keyboard(" ");
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("runs the row action once when any other cell of the row is clicked", async () => {
    const onRowClick = vi.fn();
    render(
      <Table
        caption="Customers"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={rowKey}
        onRowClick={onRowClick}
        rowLabel={(r) => `Open ${r.name}`}
      />,
    );
    await userEvent.click(screen.getByRole("cell", { name: "9" }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1]);
  });

  it("has no row buttons when rows have no action", () => {
    render(<Table caption="Customers" columns={COLUMNS} rows={ROWS} rowKey={rowKey} />);
    expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
  });

  it("toggles compact density with a pressed state", async () => {
    render(<Table caption="Customers" columns={COLUMNS} rows={ROWS} rowKey={rowKey} />);
    const toggle = screen.getByRole("button", { name: "Compact rows" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("table")).toHaveAttribute("data-density", "compact");
  });
});

describe("[P0-09] overflowSides (C-13 scroll hint)", () => {
  it.each([
    ["fits", 0, 300, 300, "none"],
    ["more to the right at the start", 0, 600, 300, "end"],
    ["more on both sides in the middle", 150, 600, 300, "both"],
    ["more to the left at the end", 300, 600, 300, "start"],
    ["sub-pixel end position counts as the end", 299.5, 600, 300, "start"],
    ["sub-pixel overflow counts as fitting", 0, 300.6, 300, "none"],
  ] as const)("%s", (_name, left, width, client, expected) => {
    expect(overflowSides(left, width, client)).toBe(expected);
  });
});
