set search_path = public, extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- BUSSY v2 · 06 · Seed data (runs in production too, so it is a migration)
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.systems (name, sort_order) values
  ('Body', 1), ('Dynamics', 2), ('Electronics', 3), ('Powertrain', 4), ('Operations', 5),
  ('Manufacturing', 6), ('Composites', 7), ('Aero', 8), ('Management', 9),
  ('Purchasing for OB', 10), ('Purchasing for Other Team', 11)
on conflict (name) do nothing;

insert into public.expense_accounts (name, description, sort_order) values
  ('Direct Materials',      'Any parts that end up on the car', 1),
  ('Supplies',              'Markers, cleaning, gloves, boxes, IPA, etc.', 2),
  ('Equipment',             'Hand tools, machinery, reusable tools', 3),
  ('Maintenance',           'Parts used to maintain past vehicles, machinery upkeep, any repair including karts', 4),
  ('Competition/Transport', 'Competition fees, U-Hauls, expenses related to transportation', 5),
  ('Testing',               'Parts used to test things', 6),
  ('Hardware/tooling',      'Bolts, nuts, o-rings, vacuum bags, endmills, jig stock, etc.', 7),
  ('Other',                 'Anything else – describe it', 8)
on conflict (name) do nothing;

insert into public.cars (label, sort_order) values
  ('Panda (22-23)', 1), ('Badger (23-24)', 2), ('Raccoon (24-25)', 3),
  ('Penguin (25-26)', 4), ('LHRc (26-27)', 5), ('N/A', 99)
on conflict (label) do nothing;

insert into public.vendors (name, show_on_form, aliases) values
  ('Amazon', true, '{}'),
  ('Automation Direct', true, '{"AutomationDirect"}'),
  ('Chemical Concepts', true, '{}'),
  ('Composite Envisions', true, '{}'),
  ('DigiKey', true, '{"Digi-Key","Digi Key"}'),
  ('Fiberglast', true, '{}'),
  ('Grainger', true, '{}'),
  ('IMPAC', true, '{}'),
  ('McMaster', true, '{"McMaster-Carr","McMaster Carr","McMasterCarr"}'),
  ('Misumi', true, '{}'),
  ('Mouser', true, '{"Mouser Electronics"}'),
  ('MSC', true, '{"MSC Industrial","MSC Direct"}'),
  ('Ohlins', true, '{"Öhlins"}'),
  ('Pegasus', true, '{"Pegasus Auto Racing"}'),
  ('ProWireUSA', true, '{"ProWire USA","ProWire"}'),
  ('Push Button', true, '{}'),
  ('Rock West', true, '{"Rock West Composites"}'),
  ('RCV Performance', true, '{"RCV"}'),
  ('SendCutSend', true, '{"Send Cut Send"}'),
  ('Taylor Race Engineering', true, '{"Taylor Race"}'),
  ('TiCon', true, '{}'),
  ('Westbrook Metals', true, '{}'),
  ('Jkeys', true, '{"J Keys","J-Keys","JKeys"}'),
  ('Partzilla', false, '{}')
on conflict (name) do nothing;

-- Seasons. 2025-26 holds last year's import; 2026-27 is current.
-- !! Rohan: confirm the 2026-27 start date in Users & settings → Season.
insert into public.seasons (name, car_label, car_id, start_date, is_current, jkeys_fee_pct, dashboard_vendor_ids)
select '2025-26', 'Penguin (25-26)', (select id from public.cars where label = 'Penguin (25-26)'),
       date '2025-08-31', false, 0.10,
       array(select id from public.vendors
              where name in ('McMaster','Mouser','Amazon','SendCutSend','Jkeys')
              order by array_position(array['McMaster','Mouser','Amazon','SendCutSend','Jkeys'], name::text))
on conflict (name) do nothing;

insert into public.seasons (name, car_label, car_id, start_date, is_current, jkeys_fee_pct, dashboard_vendor_ids)
select '2026-27', 'LHRc (26-27)', (select id from public.cars where label = 'LHRc (26-27)'),
       date '2026-08-30', true, 0.10,
       array(select id from public.vendors
              where name in ('McMaster','Mouser','Amazon','SendCutSend','Jkeys')
              order by array_position(array['McMaster','Mouser','Amazon','SendCutSend','Jkeys'], name::text))
on conflict (name) do nothing;
