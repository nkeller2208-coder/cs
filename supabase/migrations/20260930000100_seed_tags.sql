-- =====================================================================
-- Valeurs initiales des listes d'étiquettes (toutes modifiables par l'admin)
-- =====================================================================

insert into public.maps (name, sort_order) values
  ('Ancient', 1), ('Anubis', 2), ('Dust II', 3), ('Inferno', 4),
  ('Mirage', 5), ('Nuke', 6), ('Overpass', 7), ('Train', 8)
on conflict (name) do nothing;

insert into public.roles (side, name, sort_order) values
  ('CT', 'Fixe A', 1), ('CT', 'Fixe B', 2), ('CT', 'Pivot A', 3), ('CT', 'Pivot B', 4), ('CT', 'AWP', 5),
  ('T', 'Extre A', 1), ('T', 'Extre B', 2), ('T', 'Central', 3), ('T', 'AWP', 4), ('T', '+1', 5)
on conflict (side, name) do nothing;

insert into public.categories (name, shows_utility, sort_order) values
  ('Stuff', true, 1), ('Position', false, 2), ('Move solo', false, 3), ('Routine', false, 4),
  ('Prise de zone', false, 5), ('Reprise de zone', false, 6), ('Retake', false, 7)
on conflict (name) do nothing;

-- Dégradé vert → rouge : du moins risqué au plus risqué.
insert into public.risks (name, color, sort_order) values
  ('Passif', '#22c55e', 1), ('En réaction', '#a3e635', 2),
  ('Semi-agressif', '#f97316', 3), ('Agressif', '#ef4444', 4)
on conflict (name) do nothing;

insert into public.utilities (name, sort_order) values
  ('Smoke', 1), ('Flash', 2), ('Molotov/Incendiaire', 3), ('HE', 4), ('Decoy', 5)
on conflict (name) do nothing;

insert into public.economies (name, sort_order) values
  ('Pistol', 1), ('Eco', 2), ('Force buy', 3), ('Full buy', 4)
on conflict (name) do nothing;

-- Callouts courants par map (point de départ, à compléter par l'équipe).
insert into public.zones (map_id, name, sort_order, created_by)
select m.id, z.name, z.ord, null
from (values
  ('Mirage', array['T Spawn', 'T Ramp', 'Palace', 'Tetris', 'Sandwich', 'Firebox', 'Stairs', 'Jungle', 'Connector',
                   'CT Spawn', 'Ticket', 'Site A', 'Top Mid', 'Mid', 'Window', 'Short', 'Underpass', 'Apartments',
                   'Van', 'Bench', 'Market', 'Kitchen', 'Site B', 'Arch']),
  ('Inferno', array['T Spawn', 'Banana', 'Car', 'Coffins', 'Construction', 'Site B', 'CT Spawn', 'Arch', 'Library',
                    'Pit', 'Graveyard', 'Site A', 'Apartments', 'Balcony', 'Boiler', 'Second Mid', 'Top Mid', 'Mid',
                    'Short', 'Long', 'Moto']),
  ('Dust II', array['T Spawn', 'Long Doors', 'Long A', 'Pit', 'Car', 'Site A', 'Goose', 'Short', 'Catwalk', 'Mid',
                    'Xbox', 'Mid Doors', 'CT Spawn', 'Tunnels', 'Upper Tunnels', 'Lower Tunnels', 'Site B',
                    'Window', 'Back Plat']),
  ('Nuke', array['T Spawn', 'Outside', 'Secret', 'Garage', 'Lobby', 'Squeaky', 'Hut', 'Heaven', 'Hell', 'Site A',
                 'Ramp', 'Site B', 'Vents', 'Control Room', 'Main', 'Mini', 'CT Spawn', 'Silo']),
  ('Ancient', array['T Spawn', 'Main A', 'Donut', 'Temple', 'Site A', 'Mid', 'Cave', 'Ramp', 'Site B', 'CT Spawn',
                    'Elbow', 'Red Room', 'Pillar', 'Lane']),
  ('Anubis', array['T Spawn', 'Main A', 'Canal', 'Connector', 'Mid', 'Bridge', 'Site A', 'Heaven', 'Main B',
                   'Site B', 'Ruins', 'Street', 'Palace', 'CT Spawn', 'Water']),
  ('Overpass', array['T Spawn', 'Fountain', 'Toilets', 'Long A', 'Site A', 'Truck', 'Bank', 'Connector', 'Party',
                     'Monster', 'Water', 'Short B', 'Heaven', 'Pillar', 'Site B', 'Barrels', 'CT Spawn']),
  ('Train', array['T Spawn', 'Main', 'Ivy', 'Connector', 'Site A', 'Ladder', 'Popdog', 'Site B', 'Upper B',
                  'Lower B', 'Hell', 'Heaven', 'CT Spawn', 'Z Connector'])
) as z0(map_name, names)
join public.maps m on m.name = z0.map_name
cross join lateral unnest(z0.names) with ordinality as z(name, ord)
on conflict (map_id, name) do nothing;
