import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { exportFileName, toDelimited, toEslLine, type EslLayout } from "@/lib/esl";
import { buildEslWorkbook } from "@/lib/esl-xlsx";
import type { RequestViewRow } from "@/lib/types";

export const runtime = "nodejs";

/** GET /admin/export/file?ids=1,2,3&layout=single|per_vendor&format=xlsx|csv  (admins only) */
export async function GET(req: NextRequest) {
  const { supabase, profile } = await getSession();
  if (!profile || profile.access_status !== "approved" || profile.role !== "admin")
    return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const ids = (sp.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  const layout: EslLayout = sp.get("layout") === "per_vendor" ? "per_vendor" : "single";
  const format = sp.get("format") === "csv" ? "csv" : "xlsx";
  if (!ids.length) return NextResponse.json({ error: "No requests selected" }, { status: 400 });

  const { data, error } = await supabase.from("request_view").select("*").in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lines = ((data ?? []) as RequestViewRow[]).map(toEslLine);

  if (format === "csv") {
    return new NextResponse("\uFEFF" + toDelimited(lines, ","), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName("csv")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const file = await buildEslWorkbook(lines, layout);
  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName("xlsx")}"`,
      "Cache-Control": "no-store",
    },
  });
}
