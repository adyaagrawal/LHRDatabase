import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile, Season, UserRole } from "./types";

/** Current user + profile, memoised per request. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { supabase, user, profile: (profile as Profile | null) ?? null };
});

/** For pages: approved user or redirect. Optionally require a role. */
export async function requireUser(roles?: UserRole[]) {
  const s = await getSession();
  if (!s.user) redirect("/login");
  if (!s.profile || s.profile.access_status === "pending") redirect("/pending");
  if (s.profile.access_status === "denied") redirect("/denied");
  if (roles && !roles.includes(s.profile.role)) redirect("/");
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}

/** For server actions: same checks, but returns an error instead of redirecting. */
export async function actionUser(roles?: UserRole[]) {
  const s = await getSession();
  if (!s.user || !s.profile || s.profile.access_status !== "approved")
    return { ok: false as const, error: "Your session expired or your account isn't approved. Sign in again." };
  if (roles && !roles.includes(s.profile.role))
    return { ok: false as const, error: "You don't have permission to do that." };
  return { ok: true as const, supabase: s.supabase, user: s.user, profile: s.profile };
}

export const isAdmin = (p: Profile | null) => p?.role === "admin";
export const isApprover = (p: Profile | null) => p?.role === "admin" || p?.role === "approver";

export async function getCurrentSeason(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("seasons").select("*").eq("is_current", true).maybeSingle();
  return data as Season | null;
}

export async function getSeasons(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("seasons").select("*").order("start_date", { ascending: false });
  return (data ?? []) as Season[];
}
