-- Run with: pnpm test:db   (needs `supabase start` running locally)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

-- Users: one pending, one member, one admin (trigger creates their profiles)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'pending@test.dev', '{"full_name":"Pending Person"}'),
  ('00000000-0000-0000-0000-00000000000b', 'member@test.dev',  '{"full_name":"Member Person"}'),
  ('00000000-0000-0000-0000-00000000000c', 'admin@test.dev',   '{"full_name":"Admin Person"}');

update public.profiles set access_status = 'approved' where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set access_status = 'approved', role = 'admin' where id = '00000000-0000-0000-0000-00000000000c';

-- A request created by the service role (like an import)
insert into public.requests (season_id, request_type, cart_or_item, items_description, requester_email, quantity, unit_cost, nominal_total)
values ((select id from public.seasons where is_current), 'purchase', 'item', 'Imported thing', 'someone@test.dev', 1, 10, 10);

select ok(exists (select 1 from public.profiles where email = 'pending@test.dev' and access_status = 'pending'),
          'new sign-ins start as pending');

-- ── pending user ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*) from public.requests)::int, 0, 'pending user sees no requests');
select is((select count(*) from public.vendors)::int, 0, 'pending user sees no lookups');

-- ── member ──
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select ok((select count(*) from public.requests) >= 1, 'approved member can read requests');

select throws_ok(
  $$ select public.transition_request((select min(id) from public.requests), 'approved'::public.request_status, null) $$,
  '42501', null, 'member cannot approve');

insert into public.requests (season_id, submitted_by, request_type, cart_or_item, items_description, quantity, unit_cost, nominal_total)
values ((select id from public.seasons where is_current), '00000000-0000-0000-0000-00000000000b',
        'purchase', 'cart', 'A; B; C', 5, 100, 999);

select results_eq(
  $$ select quantity::int, nominal_total::numeric from public.requests where submitted_by = auth.uid() $$,
  $$ values (1, 100.00::numeric) $$,
  'cart is forced to qty 1 and the total is computed server-side');

select throws_ok(
  $$ update public.requests set status = 'approved' where submitted_by = auth.uid() $$,
  '42501', null, 'member cannot change status columns directly');

-- ── admin ──
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select lives_ok(
  $$ select public.transition_request((select min(id) from public.requests), 'approved'::public.request_status, null) $$,
  'admin can approve');

select ok(exists (select 1 from public.request_events where event = 'approved'
                  and actor_id = '00000000-0000-0000-0000-00000000000c'),
          'approval is written to the audit log');

select * from finish();
rollback;
