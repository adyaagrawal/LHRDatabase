-- ═══════════════════════════════════════════════════════════════════════════
-- BUSSY v2 · 03 · Row Level Security
-- Pending/denied users can read nothing except their own profile.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles          enable row level security;
alter table public.seasons           enable row level security;
alter table public.systems           enable row level security;
alter table public.expense_accounts  enable row level security;
alter table public.cars              enable row level security;
alter table public.vendors           enable row level security;
alter table public.budgets           enable row level security;
alter table public.requests          enable row level security;
alter table public.esl_batches       enable row level security;
alter table public.request_events    enable row level security;

-- ── profiles ──────────────────────────────────────────────────────────────
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles: approved read approved"
  on public.profiles for select to authenticated
  using (public.is_approved() and (access_status = 'approved' or public.is_admin()));

create policy "profiles: update own name/system"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());          -- role/access changes blocked by profiles_guard

create policy "profiles: admin update"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles: admin delete"
  on public.profiles for delete to authenticated
  using (public.is_admin());

-- ── lookup tables, seasons, budgets: approved read, admin write ──────────
do $$
declare t text;
begin
  foreach t in array array['seasons','systems','expense_accounts','cars','vendors','budgets'] loop
    execute format(
      'create policy "%1$s: approved read" on public.%1$I for select to authenticated using (public.is_approved())', t);
    execute format(
      'create policy "%1$s: admin write" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ── requests ──────────────────────────────────────────────────────────────
create policy "requests: approved read all"
  on public.requests for select to authenticated
  using (public.is_approved());

create policy "requests: insert own pending"
  on public.requests for insert to authenticated
  with check (public.is_approved() and submitted_by = auth.uid() and status = 'pending_review');

create policy "requests: edit own while pending"
  on public.requests for update to authenticated
  using (public.is_approved() and submitted_by = auth.uid() and status = 'pending_review')
  with check (public.is_approved() and submitted_by = auth.uid());

create policy "requests: admin all"
  on public.requests for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── audit + batches: read-only for approved users (writes via triggers/functions) ──
create policy "request_events: approved read"
  on public.request_events for select to authenticated
  using (public.is_approved());

create policy "esl_batches: approved read"
  on public.esl_batches for select to authenticated
  using (public.is_approved());

-- /pending listens for its own profile row changing (RLS still applies to Realtime).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
end $$;
