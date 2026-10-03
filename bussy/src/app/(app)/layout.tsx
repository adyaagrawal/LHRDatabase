import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, user } = await requireUser();

  const isApproverish = profile.role === "admin" || profile.role === "approver";
  const isAdmin = profile.role === "admin";

  const [pending, ready, access] = await Promise.all([
    isApproverish
      ? supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "pending_review")
      : Promise.resolve({ count: 0 }),
    isAdmin
      ? supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "approved")
      : Promise.resolve({ count: 0 }),
    isAdmin
      ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("access_status", "pending")
      : Promise.resolve({ count: 0 }),
  ]);

  // "Last active" on Users & settings — refresh at most hourly.
  const seen = profile.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
  if (Date.now() - seen > 3_600_000) {
    await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
  }

  return (
    <ToastProvider>
      <div className="min-h-screen md:flex">
        <Sidebar
          name={profile.full_name ?? user.email ?? "Signed in"}
          email={user.email ?? ""}
          role={profile.role}
          pendingApprovals={pending.count ?? 0}
          readyToExport={ready.count ?? 0}
          accessRequests={access.count ?? 0}
        />
        <main id="content" className="min-w-0 flex-1">
          <div className="mx-auto max-w-content px-4 py-6 md:px-10 md:py-10">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
