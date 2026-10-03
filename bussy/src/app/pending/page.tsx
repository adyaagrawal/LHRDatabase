import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PendingPoller } from "./poller";

export const metadata: Metadata = { title: "Waiting for approval" };

export default async function PendingPage() {
  const { user, profile } = await getSession();
  if (!user) redirect("/login");
  if (profile?.access_status === "approved") redirect("/");
  if (profile?.access_status === "denied") redirect("/denied");

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <p className="font-display text-5xl font-bold uppercase text-ink">BUSSY</p>
        <h1 className="mt-6 section-title">Waiting on an admin</h1>
        <p className="mt-3 text-muted">
          Matthew, Sid or Rohan needs to approve your account. This page opens BUSSY by itself as
          soon as they do — no need to sign out.
        </p>
        <dl className="card mt-6 divide-y divide-line2 text-sm">
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-muted">Signed in as</dt>
            <dd className="font-medium">{profile?.full_name ?? user.email}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-muted">Google email</dt>
            <dd className="mono">{user.email}</dd>
          </div>
        </dl>
        <PendingPoller userId={user.id} />
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="btn-secondary" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
