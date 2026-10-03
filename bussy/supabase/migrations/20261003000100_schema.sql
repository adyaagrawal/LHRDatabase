set search_path = public, extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- BUSSY v2 · 01 · Schema (enums, tables, indexes)
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists citext with schema extensions;

-- ── Enums ──────────────────────────────────────────────────────────────────
create type public.user_role      as enum ('member', 'approver', 'admin');
create type public.access_status  as enum ('pending', 'approved', 'denied');
create type public.request_type   as enum ('purchase', 'reimbursement', 'other');
create type public.cart_or_item   as enum ('cart', 'item');
create type public.request_status as enum (
  'pending_review', 'approved', 'submitted_to_esl', 'received', 'returned_canceled', 'rejected'
);

-- ── Lookup tables ──────────────────────────────────────────────────────────
create table public.systems (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int  not null default 0,
  active      boolean not null default true
);

create table public.expense_accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  sort_order  int  not null default 0
);

create table public.cars (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique,
  sort_order  int  not null default 0,
  active      boolean not null default true
);

create table public.vendors (
  id           uuid primary key default gen_random_uuid(),
  name         extensions.citext not null unique,
  aliases      extensions.citext[] not null default '{}',
  show_on_form boolean not null default false,
  active       boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now()
);

create table public.seasons (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null unique,            -- '2026-27'
  car_label            text,                            -- 'LHRc (26-27)'
  car_id               uuid references public.cars(id),
  start_date           date not null,                   -- dashboard week 0
  is_current           boolean not null default false,
  jkeys_fee_pct        numeric(6,4) not null default 0.10,
  dashboard_vendor_ids uuid[] not null default '{}',
  created_at           timestamptz not null default now()
);
-- exactly one current season
create unique index seasons_one_current on public.seasons (is_current) where is_current;

-- ── People ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text unique,
  full_name      text,
  first_name     text,
  last_name      text,
  system_id      uuid references public.systems(id),
  role           public.user_role not null default 'member',
  access_status  public.access_status not null default 'pending',
  approved_by    uuid references public.profiles(id),
  approved_at    timestamptz,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now()
);

create table public.budgets (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references public.seasons(id) on delete cascade,
  system_id  uuid not null references public.systems(id) on delete cascade,
  amount     numeric(12,2) not null default 0,
  unique (season_id, system_id)
);

-- ── ESL batches ────────────────────────────────────────────────────────────
create table public.esl_batches (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid references public.seasons(id),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  layout      text not null check (layout in ('single', 'per_vendor')),
  line_count  int  not null default 0,
  total       numeric(12,2) not null default 0,
  file_path   text
);

-- ── Requests: one row per submission = one ESL line item ───────────────────
create table public.requests (
  id                     bigint generated always as identity primary key,
  season_id              uuid not null references public.seasons(id),
  request_number         int,
  legacy_form_id         int,

  -- who
  submitted_by           uuid references public.profiles(id),
  requester_name         text,
  requester_email        text,
  first_name             text,
  last_name              text,

  -- general
  system_id              uuid references public.systems(id),
  expense_account_id     uuid references public.expense_accounts(id),
  expense_account_other  text,
  car_id                 uuid references public.cars(id),
  date_of_purchase       date,
  request_type           public.request_type not null,

  -- purchase / other
  cart_or_item           public.cart_or_item,
  items_description      text,
  sku                    text,
  quantity               numeric(12,3),
  unit_cost              numeric(12,2),
  nominal_total          numeric(12,2),
  shipping_cost          numeric(12,2),
  vendor_id              uuid references public.vendors(id),
  vendor_other           text,
  purchase_link          text,
  standard_shipping      boolean,
  shipping_instructions  text,
  urgency                smallint check (urgency between 1 and 5),
  reason                 text,
  other_justification    text,

  -- reimbursement
  receipt_path           text,
  ess_form_ack           boolean,
  feedback               text,

  -- workflow
  status                 public.request_status not null default 'pending_review',
  approved_by            uuid references public.profiles(id),
  approved_at            timestamptz,
  rejected_by            uuid references public.profiles(id),
  rejected_at            timestamptz,
  rejection_reason       text,
  submitted_to_esl_at    timestamptz,
  submitted_to_esl_by    uuid references public.profiles(id),
  esl_batch_id           uuid references public.esl_batches(id),
  received_at            timestamptz,
  received_by            uuid references public.profiles(id),
  received_by_name       text,
  returned_at            timestamptz,
  admin_notes            text,
  esl_invoice_number     text,
  possible_duplicate_of  bigint references public.requests(id) on delete set null,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  form_started_at        timestamptz,

  unique (season_id, request_number),
  unique (season_id, legacy_form_id)
);

create index requests_season_status_idx on public.requests (season_id, status);
create index requests_submitted_by_idx  on public.requests (submitted_by);
create index requests_vendor_idx        on public.requests (vendor_id);
create index requests_email_idx         on public.requests (lower(requester_email));

-- ── Audit log (append-only) ───────────────────────────────────────────────
create table public.request_events (
  id           bigint generated always as identity primary key,
  request_id   bigint not null references public.requests(id) on delete cascade,
  actor_id     uuid references public.profiles(id),
  event        text not null check (event in (
                  'created','edited','approved','rejected','status_changed',
                  'exported','checked_in','check_in_undone','imported')),
  from_status  public.request_status,
  to_status    public.request_status,
  changes      jsonb,
  note         text,
  created_at   timestamptz not null default now()
);
create index request_events_request_idx on public.request_events (request_id, created_at);
