import type { Metadata } from "next";
import { requireUser, getCurrentSeason } from "@/lib/auth";
import type { Car, ExpenseAccount, SystemRow, Vendor } from "@/lib/types";
import { RequestForm } from "./request-form";
import { todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "New request" };

export default async function NewRequestPage() {
  const { supabase, user, profile } = await requireUser();
  const [season, systems, accounts, cars, vendors] = await Promise.all([
    getCurrentSeason(supabase),
    supabase.from("systems").select("*").eq("active", true).order("sort_order"),
    supabase.from("expense_accounts").select("*").order("sort_order"),
    supabase.from("cars").select("*").eq("active", true).order("sort_order"),
    supabase.from("vendors").select("id,name,aliases,show_on_form,active").eq("active", true).order("name"),
  ]);

  const [given, ...rest] = (profile.full_name ?? "").split(" ");
  return (
    <RequestForm
      userId={user.id}
      email={user.email ?? profile.email ?? ""}
      defaults={{
        first_name: profile.first_name ?? given ?? "",
        last_name: profile.last_name ?? rest.join(" ") ?? "",
        system_id: profile.system_id ?? "",
        car_id: season?.car_id ?? "",
        date_of_purchase: todayISO(),
      }}
      systems={(systems.data ?? []) as SystemRow[]}
      accounts={(accounts.data ?? []) as ExpenseAccount[]}
      cars={(cars.data ?? []) as Car[]}
      vendors={(vendors.data ?? []) as Vendor[]}
      seasonName={season?.name ?? ""}
    />
  );
}
