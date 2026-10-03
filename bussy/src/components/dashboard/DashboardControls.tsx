"use client";
import { useRouter } from "next/navigation";
import { downloadText } from "@/components/download";
import { rowsToCsv } from "@/lib/esl";

export function DashboardControls({
  seasons,
  seasonId,
  includeAll,
  csvRows,
  seasonName,
}: {
  seasons: { id: string; name: string }[];
  seasonId: string;
  includeAll: boolean;
  csvRows: Record<string, unknown>[];
  seasonName: string;
}) {
  const router = useRouter();
  const go = (s: string, all: boolean) => router.push(`/?season=${s}&all=${all ? 1 : 0}`);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="season">
        Season
      </label>
      <select
        id="season"
        className="input w-auto"
        value={seasonId}
        onChange={(e) => go(e.target.value, includeAll)}
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <label className="flex min-h-touch cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#BF5700]"
          checked={includeAll}
          onChange={(e) => go(seasonId, e.target.checked)}
        />
        Include reimbursements &amp; other
      </label>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => downloadText(`BUSSY_dashboard_${seasonName}.csv`, rowsToCsv(csvRows))}
      >
        Download CSV
      </button>
    </div>
  );
}
