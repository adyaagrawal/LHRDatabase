import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function bootstrapEmails(): string[] {
  return (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  // Same host the user started on (works for localhost, production and Vercel previews).
  const origin = url.origin;

  if (!code) return NextResponse.redirect(`${origin}/login?error=auth`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const user = data.user;
  const email = (user.email ?? "").toLowerCase();

  // Bootstrap admins (Matthew, Sid, Rohan) are auto-approved as admin.
  if (email && bootstrapEmails().includes(email)) {
    try {
      const admin = createAdminClient();
      await admin
        .from("profiles")
        .update({
          role: "admin",
          access_status: "approved",
          approved_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .or("role.neq.admin,access_status.neq.approved");
    } catch (e) {
      console.error("Bootstrap admin promotion failed", e);
    }
  }

  await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);

  return NextResponse.redirect(`${origin}${next}`);
}
