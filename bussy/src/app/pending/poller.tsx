"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Checks every 5 s (and on a Realtime change) whether an admin approved this account. */
export function PendingPoller({ userId }: { userId: string }) {
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;

    async function check() {
      const { data } = await supabase
        .from("profiles")
        .select("access_status")
        .eq("id", userId)
        .maybeSingle();
      if (stopped) return;
      setChecks((c) => c + 1);
      if (data?.access_status === "approved") window.location.assign("/");
      if (data?.access_status === "denied") window.location.assign("/denied");
    }

    const channel = supabase
      .channel(`profile-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        () => void check(),
      )
      .subscribe();

    const t = setInterval(check, 5000);
    void check();
    return () => {
      stopped = true;
      clearInterval(t);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <p className="mt-4 flex items-center gap-2 text-sm text-muted" aria-live="polite">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
      Checking for approval{checks > 0 ? ` (checked ${checks}×)` : ""}
    </p>
  );
}
