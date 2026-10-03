set search_path = public, extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- BUSSY v2 · 02 · Helper functions, triggers, status machine, admin RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Access helpers (security definer so they can read profiles under RLS) ──
create or replace function public.app_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and access_status = 'approved'
$$;

create or replace function public.is_approved()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and access_status = 'approved')
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

create or replace function public.is_approver()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.app_role() in ('approver', 'admin'), false)
$$;

-- ── New Google sign-in → pending profile ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, full_name, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(meta->>'full_name', meta->>'name'),
    meta->>'given_name',
    meta->>'family_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Profile guard: only admins change role/access; never remove the last admin ──
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.access_status is distinct from old.access_status
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.email is distinct from old.email then
      raise exception 'Only admins can change roles or account access' using errcode = '42501';
    end if;
  end if;

  if old.role = 'admin' and old.access_status = 'approved'
     and (new.role <> 'admin' or new.access_status <> 'approved')
     and not exists (
       select 1 from public.profiles
        where role = 'admin' and access_status = 'approved' and id <> old.id
     ) then
    raise exception 'BUSSY needs at least one admin. Make someone else an admin first.';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ── Requests: BEFORE triggers fire alphabetically (a_, b_, c_, d_) ─────────

-- a) totals are computed server-side, never trusted from the client
create or replace function public.requests_compute_totals()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  -- Service-role writes (importer) have no auth.uid(): keep the form's own values.
  if auth.uid() is null then
    return new;
  end if;

  -- On UPDATE only recompute when an input actually changed (keeps imported totals intact
  -- when someone just checks a package in).
  if tg_op = 'UPDATE'
     and new.quantity      is not distinct from old.quantity
     and new.unit_cost     is not distinct from old.unit_cost
     and new.shipping_cost is not distinct from old.shipping_cost
     and new.cart_or_item  is not distinct from old.cart_or_item
     and new.request_type  is not distinct from old.request_type then
    return new;
  end if;

  if new.request_type = 'purchase' then
    if new.cart_or_item = 'cart' then
      new.quantity := 1;                                   -- a cart is ONE ESL line
      new.nominal_total := round(coalesce(new.unit_cost, 0), 2);
    else
      new.nominal_total := round(coalesce(new.quantity, 0) * coalesce(new.unit_cost, 0), 2);
    end if;
  elsif new.request_type = 'other' then
    new.nominal_total := round(
      coalesce(new.quantity, 0) * coalesce(new.unit_cost, 0) + coalesce(new.shipping_cost, 0), 2);
  end if;
  -- reimbursement: nominal_total is the amount entered on the form
  return new;
end;
$$;

create trigger a_requests_compute_totals
  before insert or update on public.requests
  for each row execute function public.requests_compute_totals();

-- b) insert prep: sanitize workflow columns for non-admins, assign per-season number
create or replace function public.requests_prepare_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.status := 'pending_review';
    new.request_number := null;
    new.legacy_form_id := null;
    new.approved_by := null;  new.approved_at := null;
    new.rejected_by := null;  new.rejected_at := null;  new.rejection_reason := null;
    new.submitted_to_esl_at := null;  new.submitted_to_esl_by := null;  new.esl_batch_id := null;
    new.received_at := null;  new.received_by := null;  new.received_by_name := null;
    new.returned_at := null;  new.admin_notes := null;  new.esl_invoice_number := null;
    new.possible_duplicate_of := null;
    new.requester_email := coalesce(
      (select email from public.profiles where id = auth.uid()), new.requester_email);
  end if;

  if new.request_number is null then
    perform pg_advisory_xact_lock(hashtext('bussy_request_number_' || new.season_id::text));
    select coalesce(max(request_number), 0) + 1
      into new.request_number
      from public.requests
     where season_id = new.season_id;
  end if;
  return new;
end;
$$;

create trigger b_requests_prepare_insert
  before insert on public.requests
  for each row execute function public.requests_prepare_insert();

-- c) update guard: members may only touch form fields; status moves only via functions
create or replace function public.requests_guard_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  editable text[] := array[
    'first_name','last_name','requester_name','system_id','expense_account_id',
    'expense_account_other','car_id','date_of_purchase','request_type','cart_or_item',
    'items_description','sku','quantity','unit_cost','nominal_total','shipping_cost',
    'vendor_id','vendor_other','purchase_link','standard_shipping','shipping_instructions',
    'urgency','reason','other_justification','receipt_path','ess_form_ack','feedback',
    'updated_at'];
begin
  if auth.uid() is null then
    return new;                                   -- service role (importer, migrations)
  end if;
  if coalesce(current_setting('bussy.via_fn', true), '') = 'on' then
    return new;                                   -- transition_request & friends
  end if;
  if public.is_admin() then
    if new.status is distinct from old.status then
      raise exception 'Change status with an override (needs a note) so it is logged';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'Only form fields can be edited directly; status and workflow fields change through BUSSY actions'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger c_requests_guard_update
  before update on public.requests
  for each row execute function public.requests_guard_update();

-- d) duplicate flag (never blocks submission)
create or replace function public.requests_flag_duplicate()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  t timestamptz := coalesce(new.created_at, now());
begin
  if new.possible_duplicate_of is null and nullif(trim(coalesce(new.requester_email, '')), '') is not null then
    select r.id
      into new.possible_duplicate_of
      from public.requests r
     where r.season_id = new.season_id
       and r.status <> 'rejected'
       and lower(r.requester_email) = lower(new.requester_email)
       and (new.legacy_form_id is null or r.legacy_form_id is distinct from new.legacy_form_id)
       and (
             (nullif(trim(coalesce(new.purchase_link, '')), '') is not null
              and r.purchase_link = new.purchase_link)
          or (new.vendor_id is not null
              and r.vendor_id = new.vendor_id
              and r.nominal_total = new.nominal_total
              and r.created_at between t - interval '24 hours' and t + interval '24 hours')
       )
     order by r.created_at desc
     limit 1;
  end if;
  return new;
end;
$$;

create trigger d_requests_flag_duplicate
  before insert on public.requests
  for each row execute function public.requests_flag_duplicate();

-- z) audit log — every insert/update lands in request_events
create or replace function public.requests_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_event   text := nullif(current_setting('bussy.event', true), '');
  v_note    text := nullif(current_setting('bussy.note', true), '');
  v_changes jsonb;
  v_status_changed boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.request_events (request_id, actor_id, event, to_status, note)
    values (new.id, auth.uid(),
            case when auth.uid() is null then 'imported' else 'created' end,
            new.status, v_note);
    return new;
  end if;

  select coalesce(jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)), '{}'::jsonb)
    into v_changes
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
   where n.value is distinct from o.value
     and n.key <> 'updated_at';

  if v_changes = '{}'::jsonb then
    return new;
  end if;

  v_status_changed := new.status is distinct from old.status;

  insert into public.request_events
    (request_id, actor_id, event, from_status, to_status, changes, note)
  values (
    new.id,
    auth.uid(),
    case
      when v_status_changed then coalesce(v_event, 'status_changed')
      when auth.uid() is null then 'imported'
      else 'edited'
    end,
    case when v_status_changed then old.status end,
    case when v_status_changed then new.status end,
    v_changes,
    v_note
  );
  return new;
end;
$$;

create trigger z_requests_audit
  after insert or update on public.requests
  for each row execute function public.requests_audit();

-- ── Status machine ────────────────────────────────────────────────────────
create or replace function public.transition_request(
  p_request_id bigint,
  p_to         public.request_status,
  p_note       text default null
)
returns public.requests
language plpgsql security definer set search_path = public
as $$
declare
  r       public.requests;
  v_uid   uuid := auth.uid();
  v_role  public.user_role := public.app_role();
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
  v_event text;
  v_ok    boolean := false;
begin
  if v_role is null then
    raise exception 'Your account is not approved' using errcode = '42501';
  end if;

  select * into r from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'Request % not found', p_request_id;
  end if;
  if r.status = p_to then
    raise exception 'Request #% is already %', r.request_number, p_to;
  end if;

  if r.status = 'pending_review' and p_to = 'approved' and v_role in ('approver', 'admin') then
    v_ok := true; v_event := 'approved';
  elsif r.status = 'pending_review' and p_to = 'rejected' and v_role in ('approver', 'admin') then
    if v_note is null then
      raise exception 'A rejection reason is required';
    end if;
    v_ok := true; v_event := 'rejected';
  elsif r.status = 'pending_review' and p_to = 'returned_canceled'
        and (r.submitted_by = v_uid or v_role = 'admin') then
    v_ok := true; v_event := 'status_changed';
  elsif r.status = 'submitted_to_esl' and p_to = 'received' then
    v_ok := true; v_event := 'checked_in';
  elsif r.status = 'received' and p_to = 'submitted_to_esl'
        and (v_role = 'admin'
             or (r.received_by = v_uid and r.received_at > now() - interval '10 minutes')) then
    v_ok := true; v_event := 'check_in_undone';
  elsif p_to = 'pending_review' and v_role in ('approver', 'admin')
        and ((r.status = 'approved' and r.approved_by = v_uid
              and r.approved_at > now() - interval '2 minutes')
          or (r.status = 'rejected' and r.rejected_by = v_uid
              and r.rejected_at > now() - interval '2 minutes')) then
    v_ok := true; v_event := 'status_changed';          -- "Undo" toast in Approvals
  end if;

  if not v_ok then
    if v_role = 'admin' then
      if v_note is null then
        raise exception 'Admin overrides need a note explaining why';
      end if;
      v_event := 'status_changed';
    else
      raise exception 'You can''t move request #% from % to %', r.request_number, r.status, p_to
        using errcode = '42501';
    end if;
  end if;

  perform set_config('bussy.via_fn', 'on', true);
  perform set_config('bussy.event', v_event, true);
  perform set_config('bussy.note', coalesce(v_note, ''), true);

  update public.requests set
    status = p_to,
    approved_by = case when p_to = 'approved' then v_uid
                       when p_to = 'pending_review' then null else approved_by end,
    approved_at = case when p_to = 'approved' then now()
                       when p_to = 'pending_review' then null else approved_at end,
    rejected_by = case when p_to = 'rejected' then v_uid
                       when p_to = 'pending_review' then null else rejected_by end,
    rejected_at = case when p_to = 'rejected' then now()
                       when p_to = 'pending_review' then null else rejected_at end,
    rejection_reason = case when p_to = 'rejected' then v_note
                            when p_to = 'pending_review' then null else rejection_reason end,
    received_at = case when p_to = 'received' then now()
                       when r.status = 'received' then null else received_at end,
    received_by = case when p_to = 'received' then v_uid
                       when r.status = 'received' then null else received_by end,
    received_by_name = case when r.status = 'received' and p_to <> 'received' then null
                            else received_by_name end,
    returned_at = case when p_to = 'returned_canceled' then now()
                       when r.status = 'returned_canceled' then null else returned_at end,
    submitted_to_esl_at = case when p_to = 'submitted_to_esl' and submitted_to_esl_at is null
                               then now() else submitted_to_esl_at end,
    submitted_to_esl_by = case when p_to = 'submitted_to_esl' and submitted_to_esl_by is null
                               then v_uid else submitted_to_esl_by end
  where id = p_request_id
  returning * into r;

  perform set_config('bussy.via_fn', '', true);
  perform set_config('bussy.event', '', true);
  perform set_config('bussy.note', '', true);
  return r;
end;
$$;

-- Package check-in: any approved member, submitted_to_esl → received
create or replace function public.check_in_package(p_request_id bigint)
returns public.requests
language plpgsql security definer set search_path = public
as $$
declare
  v_status public.request_status;
begin
  if not public.is_approved() then
    raise exception 'Your account is not approved' using errcode = '42501';
  end if;
  select status into v_status from public.requests where id = p_request_id;
  if v_status is null then
    raise exception 'Request not found';
  end if;
  if v_status <> 'submitted_to_esl' then
    raise exception 'Only orders that are "Submitted to ESL" can be checked in (this one is %)', v_status;
  end if;
  return public.transition_request(p_request_id, 'received', null);
end;
$$;

-- ESL batch: record the batch + move the selected approved rows in one transaction
create or replace function public.mark_submitted_to_esl(
  p_batch_id    uuid,
  p_season_id   uuid,
  p_layout      text,
  p_file_path   text,
  p_request_ids bigint[]
)
returns public.esl_batches
language plpgsql security definer set search_path = public
as $$
declare
  b       public.esl_batches;
  v_bad   int;
  v_count int;
  v_total numeric;
begin
  if not public.is_admin() then
    raise exception 'Only admins can mark orders as submitted to ESL' using errcode = '42501';
  end if;
  if coalesce(array_length(p_request_ids, 1), 0) = 0 then
    raise exception 'Select at least one request';
  end if;

  select count(*) into v_bad
    from public.requests where id = any(p_request_ids) and status <> 'approved';
  if v_bad > 0 then
    raise exception '% selected request(s) are no longer Approved. Refresh and try again.', v_bad;
  end if;

  select count(*), coalesce(sum(nominal_total), 0)
    into v_count, v_total
    from public.requests where id = any(p_request_ids);

  insert into public.esl_batches (id, season_id, created_by, layout, line_count, total, file_path)
  values (coalesce(p_batch_id, gen_random_uuid()), p_season_id, auth.uid(), p_layout,
          v_count, v_total, p_file_path)
  returning * into b;

  perform set_config('bussy.via_fn', 'on', true);
  perform set_config('bussy.event', 'exported', true);
  perform set_config('bussy.note', 'ESL batch ' || left(b.id::text, 8), true);

  update public.requests
     set status = 'submitted_to_esl',
         submitted_to_esl_at = now(),
         submitted_to_esl_by = auth.uid(),
         esl_batch_id = b.id
   where id = any(p_request_ids);

  perform set_config('bussy.via_fn', '', true);
  perform set_config('bussy.event', '', true);
  perform set_config('bussy.note', '', true);
  return b;
end;
$$;

-- Merge vendor p_merge into p_keep (re-points requests, keeps the old name as an alias)
create or replace function public.merge_vendors(p_keep uuid, p_merge uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  m public.vendors;
begin
  if not public.is_admin() then
    raise exception 'Only admins can merge vendors' using errcode = '42501';
  end if;
  if p_keep = p_merge then
    raise exception 'Pick two different vendors';
  end if;
  select * into m from public.vendors where id = p_merge;
  if not found then
    raise exception 'Vendor to merge not found';
  end if;

  update public.requests set vendor_id = p_keep where vendor_id = p_merge;
  update public.seasons
     set dashboard_vendor_ids = array_remove(array_replace(dashboard_vendor_ids, p_merge, p_keep), null);
  update public.vendors v
     set aliases = coalesce((
           select array_agg(distinct a)
             from unnest(v.aliases || array[m.name] || m.aliases) as a
            where a is not null and a <> v.name), '{}')
   where v.id = p_keep;
  delete from public.vendors where id = p_merge;
end;
$$;

-- Start a new season and make it current
create or replace function public.start_new_season(
  p_name       text,
  p_car_label  text,
  p_start_date date
)
returns public.seasons
language plpgsql security definer set search_path = public
as $$
declare
  cur   public.seasons;
  s     public.seasons;
  v_car uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can start a season' using errcode = '42501';
  end if;
  select * into cur from public.seasons where is_current;

  if nullif(trim(coalesce(p_car_label, '')), '') is not null then
    insert into public.cars (label, sort_order)
    values (trim(p_car_label), coalesce((select max(sort_order) from public.cars where label <> 'N/A'), 0) + 1)
    on conflict (label) do nothing;
    select id into v_car from public.cars where label = trim(p_car_label);
  end if;

  update public.seasons set is_current = false where is_current;
  insert into public.seasons (name, car_label, car_id, start_date, is_current, jkeys_fee_pct, dashboard_vendor_ids)
  values (trim(p_name), trim(p_car_label), v_car, p_start_date, true,
          coalesce(cur.jkeys_fee_pct, 0.10), coalesce(cur.dashboard_vendor_ids, '{}'))
  returning * into s;
  return s;
end;
$$;

-- RPCs are for signed-in users only
revoke execute on function public.transition_request(bigint, public.request_status, text) from anon, public;
revoke execute on function public.check_in_package(bigint) from anon, public;
revoke execute on function public.mark_submitted_to_esl(uuid, uuid, text, text, bigint[]) from anon, public;
revoke execute on function public.merge_vendors(uuid, uuid) from anon, public;
revoke execute on function public.start_new_season(text, text, date) from anon, public;
grant execute on function public.transition_request(bigint, public.request_status, text) to authenticated;
grant execute on function public.check_in_package(bigint) to authenticated;
grant execute on function public.mark_submitted_to_esl(uuid, uuid, text, text, bigint[]) to authenticated;
grant execute on function public.merge_vendors(uuid, uuid) to authenticated;
grant execute on function public.start_new_season(text, text, date) to authenticated;
