import "server-only";
import ExcelJS from "exceljs";
import { ESL_COLUMNS, groupByVendor, type EslLayout, type EslLine } from "./esl";

const WIDTHS: Record<string, number> = {
  ID: 8,
  Item: 48,
  Quantity: 10,
  "Cost per Item": 14,
  "Total Cost": 14,
  "Item/SKU Number": 22,
  "Other Specs if Applicable": 30,
  Link: 44,
  Vendor: 20,
  System: 18,
  Requester: 22,
  "Request Date": 14,
};
const CURRENCY = '"$"#,##0.00';

function sheetName(s: string, used: Set<string>): string {
  const base = s.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Vendor";
  let n = 2;
  let name = base;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

function setupSheet(ws: ExcelJS.Worksheet) {
  ws.columns = ESL_COLUMNS.map((c) => ({ header: c, key: c, width: WIDTHS[c] ?? 14 }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1B19" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function addLine(ws: ExcelJS.Worksheet, l: EslLine) {
  const row = ws.addRow({
    ...l,
    Link: l.Link ? { text: l.Link, hyperlink: l.Link } : "",
  });
  row.getCell("Cost per Item").numFmt = CURRENCY;
  row.getCell("Total Cost").numFmt = CURRENCY;
  if (l.Link) row.getCell("Link").font = { color: { argb: "FF2F5D8A" }, underline: true };
  row.getCell("Item").alignment = { wrapText: true, vertical: "top" };
}

function addSubtotal(ws: ExcelJS.Worksheet, label: string, total: number) {
  const row = ws.addRow({ Item: label, "Total Cost": total });
  row.font = { bold: true };
  row.getCell("Total Cost").numFmt = CURRENCY;
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F2EE" } };
}

/**
 * Builds the workbook ESL receives. Deterministic for a given set of lines, so the copy saved
 * to Storage on "Mark submitted" is identical to what the admin downloaded.
 */
export async function buildEslWorkbook(lines: EslLine[], layout: EslLayout) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BUSSY – Longhorn Racing Combustion";
  wb.created = new Date();
  const groups = groupByVendor(lines);

  if (layout === "single") {
    const ws = wb.addWorksheet("ESL Orders");
    setupSheet(ws);
    for (const g of groups) {
      for (const l of g.lines) addLine(ws, l);
      addSubtotal(ws, `${g.vendor} subtotal (${g.lines.length} line${g.lines.length === 1 ? "" : "s"})`, g.total);
    }
    const grand = groups.reduce((a, g) => a + g.total, 0);
    addSubtotal(ws, `Grand total (${lines.length} lines)`, Math.round(grand * 100) / 100);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ESL_COLUMNS.length } };
  } else {
    const used = new Set<string>();
    for (const g of groups) {
      const ws = wb.addWorksheet(sheetName(g.vendor, used));
      setupSheet(ws);
      for (const l of g.lines) addLine(ws, l);
      addSubtotal(ws, `${g.vendor} total`, g.total);
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ESL_COLUMNS.length } };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  // Copy into a plain Uint8Array<ArrayBuffer> so it works as a Response body and a Storage upload.
  return new Uint8Array(buf as ArrayBuffer);
}
