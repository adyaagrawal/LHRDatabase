set search_path = public, extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- BUSSY v2 · 05 · Views for the app (security_invoker → RLS still applies)
-- ═══════════════════════════════════════════════════════════════════════════

-- Every request with human-readable lookups. Used by Raw data, Approvals, Export,
-- Package log and the Dashboard (one round-trip per page).
create or replace view public.request_view
with (security_invoker = true) as
select
  r.*,
  s.name                                   as system_name,
  ea.name                                  as expense_account_name,
  c.label                                  as car_label,
  coalesce(v.name::text, nullif(trim(r.vendor_other), ''), 'Unknown') as vendor_name,
  se.name                                  as season_name,
  coalesce(r.requester_name,
           nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
           r.requester_email)              as requester_display,
  ap.full_name                             as approved_by_name,
  rj.full_name                             as rejected_by_name,
  rb.full_name                             as received_by_profile_name,
  coalesce(rb.full_name, r.received_by_name) as received_by_display,
  coalesce(r.submitted_by::text,
           nullif(lower(trim(r.requester_email)), ''),
           lower(trim(r.requester_name)))  as spender_key
from public.requests r
left join public.systems          s  on s.id  = r.system_id
left join public.expense_accounts ea on ea.id = r.expense_account_id
left join public.cars             c  on c.id  = r.car_id
left join public.vendors          v  on v.id  = r.vendor_id
left join public.seasons          se on se.id = r.season_id
left join public.profiles         ap on ap.id = r.approved_by
left join public.profiles         rj on rj.id = r.rejected_by
left join public.profiles         rb on rb.id = r.received_by;

grant select on public.request_view to authenticated;
revoke all on public.request_view from anon;

-- Audit timeline with actor names
create or replace view public.request_event_view
with (security_invoker = true) as
select e.*, p.full_name as actor_name
from public.request_events e
left join public.profiles p on p.id = e.actor_id;

grant select on public.request_event_view to authenticated;
revoke all on public.request_event_view from anon;
