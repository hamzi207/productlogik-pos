-- Phase 19, owner request 2026-10-25: more measuring units (length, area, volume, weight) in the platform
-- presets, offered as one-click picks in Settings → Units → Add unit, and added to the industries that
-- measure. Existing organizations get their industry's new units (additive; nothing is removed or renamed).

insert into public.uom_presets (code, name, decimals, sort_order, is_pack) values
  ('ton', 'Tonne', 3, 112, false), ('lb', 'Pound', 2, 114, false),
  ('gal', 'Gallon', 2, 132, false),
  ('mm', 'Millimetre', 0, 152, false), ('in', 'Inch', 2, 162, false), ('rft', 'Running foot', 2, 164, false),
  ('sqm', 'Square metre', 2, 182, false), ('sqyd', 'Square yard', 2, 184, false),
  ('cbm', 'Cubic metre', 3, 186, false), ('cft', 'Cubic foot', 2, 188, false),
  ('roll', 'Roll', 0, 245, true), ('sheet', 'Sheet', 0, 255, false)
on conflict (code) do nothing;

-- Appends codes an industry doesn't list yet, keeping its order.
update public.industries ind
set default_uoms = ind.default_uoms || array(select c from unnest(x.extra) as c where c <> all (ind.default_uoms))
from (values
  ('hardware-building-sanitary', array['in', 'rft', 'sqm', 'cft', 'cbm', 'ton', 'sheet']),
  ('textile-fabric', array['cm', 'in']),
  ('electrical-lighting', array['ft', 'roll']),
  ('automotive', array['ft', 'sqft', 'sqm', 'roll']),
  ('computers-it', array['ft'])
) as x(slug, extra)
where ind.slug = x.slug;

select private.seed_tenant_lists(id) from public.tenants;
