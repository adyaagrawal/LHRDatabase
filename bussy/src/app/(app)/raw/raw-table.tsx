"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { COLUMNS, type ColDef } from "@/lib/columns";
import { STATUS_LABEL, STATUS_ORDER, TYPE_LABEL, type RequestStatus, type RequestViewRow } from "@/lib/types";
import { dateShort, dateTime, money, reqNo, truncate } from "@/lib/format";
import { rowsToCsv } from "@/lib/esl";
import { StatusChip } from "@/components/StatusChip";
import { downloadText } from "@/components/download";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { updateRequestField } from "./actions";

const VIS_KEY = "bussy.raw.columns.v1";

function displayValue(c: ColDef, r: RequestViewRow): string {
  const v = r[c.key];
  if (v === null || v === undefined || v === "") return "";
  switch (c.kind) {
    case "money":
      return money(Number(v));
    case "date":
      return dateShort(String(v));
    case "datetime":
      return dateTime(String(v));
    case "bool":
      return v ? "Yes" : "No";
    case "status":
      return STATUS_LABEL[v as RequestStatus];
    case "id":
      return reqNo(Number(v));
    default:
      if (c.key === "request_type") return TYPE_LABEL[v as RequestViewRow["request_type"]];
      return String(v);
  }
}

function EditableCell({ row, col, onSaved }: { row: RequestViewRow; col: ColDef; onSaved: () => void }) {
  const initial = row[col.key] === null || row[col.key] === undefined ? "" : String(row[col.key]);
  const [val, setVal] = useState(initial);
  const [saving, start] = useTransition();
  const toast = useToast();
  useEffect(() => setVal(initial), [initial]);

  const save = () => {
    if (val === initial) return;
    start(async () => {
      const res = await updateRequestField(row.id, col.key as string, val);
      if (res.ok) {
        toast({ message: `${reqNo(row.request_number)}: ${col.label} saved` });
        onSaved();
      } else {
        toast({ message: res.error, tone: "error" });
        setVal(initial);
      }
    });
  };

  const common = {
    "aria-label": `${col.label} for ${reqNo(row.request_number)}`,
    value: val,
    disabled: saving,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setVal(e.target.value),
    onBlur: save,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    className: `w-full min-w-[120px] rounded border border-line bg-surface px-2 py-1 text-sm focus:border-accent ${saving ? "opacity-60" : ""}`,
  };
  if (col.editable === "longtext") return <textarea rows={2} {...common} className={`${common.className} min-w-[220px]`} />;
  return (
    <input
      {...common}
      inputMode={col.editable === "text" ? undefined : "decimal"}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setVal(initial);
      }}
    />
  );
}

interface Props {
  rows: RequestViewRow[];
  isAdmin: boolean;
  userId: string;
  userEmail: string;
  seasons: { id: string; name: string }[];
  seasonId: string;
  initialMine: boolean;
}

export function RawTable(p: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(p.initialMine);
  const [editMode, setEditMode] = useState(false);
  const [filters, setFilters] = useState({
    type: "",
    system: "",
    status: "",
    vendor: "",
    requester: "",
    car: "",
    from: "",
    to: "",
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(COLUMNS.map((c) => [c.key, Boolean(c.default)])),
  );
  const [showColumns, setShowColumns] = useState(false);

  // per-user column choice, remembered in this browser
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`${VIS_KEY}.${p.userId}`);
      if (saved) setVisibility((v) => ({ ...v, ...JSON.parse(saved) }));
    } catch {
      /* storage unavailable */
    }
  }, [p.userId]);
  useEffect(() => {
    try {
      localStorage.setItem(`${VIS_KEY}.${p.userId}`, JSON.stringify(visibility));
    } catch {
      /* storage unavailable */
    }
  }, [visibility, p.userId]);

  const options = useMemo(() => {
    const uniq = (f: (r: RequestViewRow) => string | null) =>
      [...new Set(p.rows.map(f).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b));
    return {
      system: uniq((r) => r.system_name),
      vendor: uniq((r) => r.vendor_name),
      requester: uniq((r) => r.requester_display),
      car: uniq((r) => r.car_label),
    };
  }, [p.rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return p.rows.filter((r) => {
      if (mine && r.submitted_by !== p.userId && (r.requester_email ?? "").toLowerCase() !== p.userEmail) return false;
      if (filters.type && r.request_type !== filters.type) return false;
      if (filters.system && r.system_name !== filters.system) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.vendor && r.vendor_name !== filters.vendor) return false;
      if (filters.requester && r.requester_display !== filters.requester) return false;
      if (filters.car && r.car_label !== filters.car) return false;
      const d = r.date_of_purchase ?? r.created_at.slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (q) {
        const hay = [
          r.items_description,
          r.requester_display,
          r.requester_email,
          r.vendor_name,
          r.sku,
          r.purchase_link,
          r.system_name,
          r.reason,
          r.admin_notes,
          String(r.request_number ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [p.rows, p.userId, p.userEmail, search, mine, filters]);

  const helper = createColumnHelper<RequestViewRow>();
  const columns = useMemo(
    () =>
      COLUMNS.map((c) =>
        helper.accessor((r) => r[c.key] as unknown, {
          id: c.key as string,
          header: c.label,
          sortingFn: c.kind === "money" || c.kind === "number" || c.kind === "id" ? "basic" : "alphanumeric",
          sortUndefined: "last",
          cell: (info) => {
            const r = info.row.original;
            if (editMode && c.editable) return <EditableCell row={r} col={c} onSaved={() => router.refresh()} />;
            if (c.kind === "status") return <StatusChip status={r.status} />;
            if (c.kind === "id")
              return (
                <Link
                  href={`/requests/${r.id}`}
                  className="font-mono text-[13px] font-semibold text-accent-ink underline-offset-4 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {reqNo(r.request_number)}
                </Link>
              );
            if (c.kind === "link" && r.purchase_link)
              return (
                <a
                  href={r.purchase_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-ink underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {truncate(r.purchase_link.replace(/^https?:\/\/(www\.)?/, ""), 32)}
                </a>
              );
            const text = displayValue(c, r);
            const mono = c.kind === "money" || c.key === "sku";
            return (
              <span className={`${mono ? "mono" : ""} ${c.kind === "money" || c.kind === "number" ? "block text-right" : ""}`} title={text.length > 60 ? text : undefined}>
                {truncate(text, 60) || <span className="text-muted">—</span>}
              </span>
            );
          },
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editMode, router],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
    autoResetPageIndex: true,
  });

  const visibleCols = COLUMNS.filter((c) => visibility[c.key as string] !== false);
  const exportRows = () =>
    table.getSortedRowModel().rows.map((row) =>
      Object.fromEntries(visibleCols.map((c) => [c.label, c.kind === "id" ? row.original.request_number : displayValue(c, row.original)])),
    );

  async function downloadXlsx() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BUSSY");
    XLSX.writeFile(wb, `BUSSY_raw_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const setFilter = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const anyFilter = Object.values(filters).some(Boolean) || search || mine;

  // A render helper (not a component) so selects keep focus between renders.
  const select = (k: keyof typeof filters, label: string, opts: { v: string; l: string }[]) => (
    <label key={k} className="flex flex-col text-sm">
      <span className="mb-1 font-semibold">{label}</span>
      <select className="input" value={filters[k]} onChange={(e) => setFilter(k, e.target.value)}>
        <option value="">All</option>
        {opts.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-1 flex-col text-sm">
            <span className="mb-1 font-semibold">Search</span>
            <input
              className="input"
              type="search"
              placeholder="Items, people, vendors, SKUs, links, #ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-semibold">Season</span>
            <select
              className="input"
              value={p.seasonId}
              onChange={(e) => router.push(`/raw?season=${e.target.value}${mine ? "&mine=1" : ""}`)}
            >
              {p.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="all">All seasons</option>
            </select>
          </label>
          <label className="flex min-h-touch cursor-pointer items-center gap-2 rounded-md border border-line px-3 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-[#BF5700]" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            Only my requests
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {select("type", "Type", (["purchase", "reimbursement", "other"] as const).map((t) => ({ v: t, l: TYPE_LABEL[t] })))}
          {select("status", "Status", STATUS_ORDER.map((s) => ({ v: s, l: STATUS_LABEL[s] })))}
          {select("system", "System", options.system.map((v) => ({ v, l: v })))}
          {select("vendor", "Vendor", options.vendor.map((v) => ({ v, l: v })))}
          {select("requester", "Requester", options.requester.map((v) => ({ v, l: v })))}
          {select("car", "Car", options.car.map((v) => ({ v, l: v })))}
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-semibold">From</span>
            <input className="input" type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-semibold">To</span>
            <input className="input" type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted" aria-live="polite">
            {filtered.length} of {p.rows.length} requests
            {anyFilter && (
              <button
                type="button"
                className="ml-3 min-h-touch font-semibold text-accent-ink underline"
                onClick={() => {
                  setFilters({ type: "", system: "", status: "", vendor: "", requester: "", car: "", from: "", to: "" });
                  setSearch("");
                  setMine(false);
                }}
              >
                Clear filters
              </button>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {p.isAdmin && (
              <button type="button" className={editMode ? "btn-primary" : "btn-secondary"} aria-pressed={editMode} onClick={() => setEditMode((e) => !e)}>
                {editMode ? "Done editing" : "Edit cells"}
              </button>
            )}
            <div className="relative">
              <button type="button" className="btn-secondary" aria-expanded={showColumns} onClick={() => setShowColumns((s) => !s)}>
                Columns
              </button>
              {showColumns && (
                <div className="absolute right-0 z-20 mt-1 max-h-96 w-72 overflow-y-auto rounded-md border border-line bg-surface p-2 shadow-lg">
                  {COLUMNS.map((c) => (
                    <label key={c.key} className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-ground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#BF5700]"
                        checked={visibility[c.key as string] !== false}
                        onChange={(e) => setVisibility((v) => ({ ...v, [c.key]: e.target.checked }))}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn-secondary" onClick={() => downloadText(`BUSSY_raw_${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(exportRows()))}>
              Download CSV
            </button>
            <button type="button" className="btn-secondary" onClick={downloadXlsx}>
              Download .xlsx
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No requests match">Clear a filter or search for something else.</EmptyState>
      ) : (
        <div className="table-wrap max-h-[70vh]">
          <table className="data-table">
            <thead className="sticky top-0 z-10">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const dir = h.column.getIsSorted();
                    return (
                      <th key={h.id} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}>
                        <button type="button" className="inline-flex min-h-[32px] items-center gap-1 font-semibold" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span aria-hidden className="text-muted">
                            {dir === "asc" ? "▲" : dir === "desc" ? "▼" : ""}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`${editMode ? "" : "cursor-pointer hover:bg-ground"}`}
                  onClick={() => {
                    if (!editMode) router.push(`/requests/${row.original.id}`);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {table.getPageCount() > 1 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              Previous
            </button>
            <button type="button" className="btn-secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </button>
            <select
              aria-label="Rows per page"
              className="input w-auto"
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {[25, 50, 100, 250].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
        </nav>
      )}
    </div>
  );
}
