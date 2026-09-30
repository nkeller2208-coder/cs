-- =====================================================================
-- Rounds lancés, post-plant et principes de jeu
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Type de round (Rush, Déclic, Strat…) : sous-choix de la catégorie « Round lancé »
-- ---------------------------------------------------------------------

alter table public.categories add column shows_round_type boolean not null default false;

create table public.round_types (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.card_round_types (
  card_id       bigint not null references public.cards (id) on delete cascade,
  round_type_id bigint not null references public.round_types (id) on delete restrict,
  primary key (card_id, round_type_id)
);
create index card_round_types_rt_idx on public.card_round_types (round_type_id);

alter table public.round_types enable row level security;
alter table public.card_round_types enable row level security;
create policy round_types_select on public.round_types for select to authenticated using (public.is_member());
create policy round_types_admin on public.round_types for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy card_round_types_select on public.card_round_types for select to authenticated using (public.can_view_card(card_id));
grant select on public.round_types, public.card_round_types to authenticated;
grant insert, update, delete on public.round_types to authenticated;

insert into public.categories (name, shows_utility, shows_round_type, sort_order) values
  ('Post-plant', false, false, 8),
  ('Round lancé', false, true, 9)
on conflict (name) do update set shows_round_type = excluded.shows_round_type;

insert into public.round_types (name, sort_order) values
  ('Rush', 1), ('Déclic', 2), ('Strat', 3), ('Default', 4), ('Exé', 5), ('Fake', 6), ('Split', 7), ('Contact', 8)
on conflict (name) do nothing;

create or replace function public.card_snapshot(p_card bigint) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'title', c.title,
    'description', c.description,
    'map_id', c.map_id,
    'side', c.side,
    'risk_id', c.risk_id,
    'status', c.status,
    'review_comment', c.review_comment,
    'media', coalesce((select jsonb_agg(jsonb_build_object('url', m.url, 'kind', m.kind) order by m.position)
                         from public.card_media m where m.card_id = c.id), '[]'::jsonb),
    'role_ids', coalesce((select jsonb_agg(role_id order by role_id) from public.card_roles where card_id = c.id), '[]'::jsonb),
    'category_ids', coalesce((select jsonb_agg(category_id order by category_id) from public.card_categories where card_id = c.id), '[]'::jsonb),
    'zone_ids', coalesce((select jsonb_agg(zone_id order by zone_id) from public.card_zones where card_id = c.id), '[]'::jsonb),
    'utility_ids', coalesce((select jsonb_agg(utility_id order by utility_id) from public.card_utilities where card_id = c.id), '[]'::jsonb),
    'economy_ids', coalesce((select jsonb_agg(economy_id order by economy_id) from public.card_economies where card_id = c.id), '[]'::jsonb),
    'round_type_ids', coalesce((select jsonb_agg(round_type_id order by round_type_id) from public.card_round_types where card_id = c.id), '[]'::jsonb)
  )
  from public.cards c where c.id = p_card;
$$;


create or replace function public.save_card(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id      bigint := nullif(p ->> 'id', '')::bigint;
  v_status  text   := coalesce(p ->> 'status', 'published');
  v_action  text;
  v_map     bigint := nullif(p ->> 'map_id', '')::bigint;
  v_side    text   := nullif(p ->> 'side', '');
  v_desc    text   := coalesce(p ->> 'description', '');
  v_media   jsonb  := coalesce(p -> 'media', '[]'::jsonb);
  v_cats    bigint[] := array(select jsonb_array_elements_text(coalesce(p -> 'category_ids', '[]'))::bigint);
  v_prev    text;
  v_roles   bigint[] := array(select jsonb_array_elements_text(coalesce(p -> 'role_ids', '[]'))::bigint);
  v_zones   bigint[] := array(select jsonb_array_elements_text(coalesce(p -> 'zone_ids', '[]'))::bigint);
begin
  if not public.is_member() then
    raise exception 'Accès réservé aux membres' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'published', 'review') then
    raise exception 'Statut invalide';
  end if;

  -- Limites de taille (protège la base contre les abus via l'API).
  if length(v_desc) > 20000 then raise exception 'Description trop longue (20 000 caractères max)'; end if;
  if jsonb_array_length(v_media) > 20 then raise exception '20 liens maximum par carte'; end if;
  if exists (select 1 from jsonb_array_elements(v_media) e
              where length(e.value ->> 'url') > 2048 or (e.value ->> 'url') !~* '^https?://') then
    raise exception 'Lien invalide (http(s) uniquement, 2048 caractères max)';
  end if;

  -- Cohérence : zones de la map de la carte, rôles de son side.
  if exists (select 1 from unnest(v_zones) z left join public.zones zz on zz.id = z
              where zz.id is null or zz.map_id is distinct from v_map) then
    raise exception 'Zone incompatible avec la map choisie';
  end if;
  if exists (select 1 from unnest(v_roles) r left join public.roles rr on rr.id = r
              where rr.id is null or rr.side is distinct from v_side) then
    raise exception 'Rôle incompatible avec le side choisi';
  end if;

  if v_status <> 'draft' then
    if btrim(coalesce(p ->> 'title', '')) = '' then raise exception 'Le titre est obligatoire'; end if;
    if v_map is null then raise exception 'La map est obligatoire'; end if;
    if v_side is null then raise exception 'Le side est obligatoire'; end if;
    if cardinality(v_cats) = 0 then raise exception 'Au moins une catégorie est obligatoire'; end if;
    if jsonb_array_length(v_media) = 0 and btrim(v_desc) = '' then
      raise exception 'Ajoute au moins un lien média ou une description';
    end if;
  end if;

  if v_id is null then
    insert into public.cards (title, description, map_id, side, risk_id, status, author_id, updated_by)
    values (left(coalesce(p ->> 'title', ''), 100), v_desc, v_map, v_side,
            nullif(p ->> 'risk_id', '')::bigint, v_status, auth.uid(), auth.uid())
    returning id into v_id;
    v_action := 'create';
  else
    -- SECURITY DEFINER : les droits sont vérifiés ici (auteur ou admin).
    if not public.can_edit_card(v_id) then
      raise exception 'Carte introuvable ou modification non autorisée' using errcode = '42501';
    end if;
    select status into v_prev from public.cards where id = v_id;
    -- Le brouillon d'un autre membre reste privé, même pour un admin.
    if v_prev = 'draft' and (select author_id from public.cards where id = v_id) is distinct from auth.uid() then
      raise exception 'Carte introuvable ou modification non autorisée' using errcode = '42501';
    end if;
    update public.cards set
      title       = left(coalesce(p ->> 'title', ''), 100),
      description = v_desc,
      map_id      = v_map,
      side        = v_side,
      risk_id     = nullif(p ->> 'risk_id', '')::bigint,
      status      = v_status,
      review_comment = case when v_status = 'review' then review_comment else null end,
      review_by      = case when v_status = 'review' then review_by else null end,
      updated_by  = auth.uid(),
      updated_at  = now()
    where id = v_id;
    if not found then
      raise exception 'Carte introuvable ou modification non autorisée' using errcode = '42501';
    end if;
    -- Publier un brouillon = création visible pour l'équipe.
    v_action := case when v_prev = 'draft' and v_status <> 'draft' then 'create' else 'update' end;
  end if;

  delete from public.card_media where card_id = v_id;
  insert into public.card_media (card_id, url, kind, url_key, position)
  select v_id, e.value ->> 'url', coalesce(e.value ->> 'kind', 'link'),
         coalesce(e.value ->> 'url_key', e.value ->> 'url'), (e.ordinality - 1)::int
    from jsonb_array_elements(v_media) with ordinality e;

  delete from public.card_roles where card_id = v_id;
  insert into public.card_roles (card_id, role_id)
  select distinct v_id, x from unnest(v_roles) x;

  delete from public.card_categories where card_id = v_id;
  insert into public.card_categories (card_id, category_id)
  select distinct v_id, x from unnest(v_cats) x;

  delete from public.card_zones where card_id = v_id;
  insert into public.card_zones (card_id, zone_id)
  select distinct v_id, x from unnest(v_zones) x;

  delete from public.card_utilities where card_id = v_id;
  -- Le type d'utilitaire n'a de sens que si une catégorie « Stuff » est cochée.
  if exists (select 1 from public.categories where id = any (v_cats) and shows_utility) then
    insert into public.card_utilities (card_id, utility_id)
    select distinct v_id, x::bigint from jsonb_array_elements_text(coalesce(p -> 'utility_ids', '[]')) x;
  end if;

  delete from public.card_round_types where card_id = v_id;
  -- Le type de round n'a de sens que si une catégorie « Round lancé » est cochée.
  if exists (select 1 from public.categories where id = any (v_cats) and shows_round_type) then
    insert into public.card_round_types (card_id, round_type_id)
    select distinct v_id, x::bigint from jsonb_array_elements_text(coalesce(p -> 'round_type_ids', '[]')) x;
  end if;

  delete from public.card_economies where card_id = v_id;
  insert into public.card_economies (card_id, economy_id)
  select distinct v_id, x::bigint from jsonb_array_elements_text(coalesce(p -> 'economy_ids', '[]')) x;

  perform public.log_card_history(v_id, v_action);

  -- Mémorise les dernières valeurs utilisées par le membre.
  if coalesce((p ->> 'remember')::boolean, true) and v_status <> 'draft' then
    insert into public.member_prefs (member_id, last_values, updated_at)
    values (auth.uid(), jsonb_build_object(
      'map_id', v_map, 'side', v_side,
      'role_ids', coalesce(p -> 'role_ids', '[]'),
      'zone_ids', coalesce(p -> 'zone_ids', '[]'),
      'category_ids', coalesce(p -> 'category_ids', '[]'),
      'risk_id', p -> 'risk_id',
      'utility_ids', coalesce(p -> 'utility_ids', '[]'),
      'economy_ids', coalesce(p -> 'economy_ids', '[]'),
      'round_type_ids', coalesce(p -> 'round_type_ids', '[]')
    ), now())
    on conflict (member_id) do update set last_values = excluded.last_values, updated_at = now();
  end if;

  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. Principes de jeu : fiches de doctrine rattachées à des étiquettes et à des cartes
-- ---------------------------------------------------------------------

create table public.principle_themes (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

insert into public.principle_themes (name, sort_order) values
  ('Fondamentaux', 1), ('Communication', 2), ('Utilitaire', 3), ('Économie', 4),
  ('Positionnement', 5), ('Duels & trades', 6), ('Post-plant & retake', 7), ('Mental', 8)
on conflict (name) do nothing;

create table public.principles (
  id          bigint generated always as identity primary key,
  title       varchar(120) not null check (btrim(title) <> ''),
  summary     varchar(280) not null default '',
  body        text not null default '' check (length(body) <= 20000),
  theme_id    bigint references public.principle_themes (id) on delete set null,
  -- Étiquettes : vide = s'applique à tout. « ET » entre familles, « OU » dans une famille.
  sides       text[] not null default '{}' check (sides <@ array['CT', 'T']),
  pinned      boolean not null default false,  -- incontournable, affiché en tête
  author_id   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table public.principle_maps (
  principle_id bigint not null references public.principles (id) on delete cascade,
  map_id       bigint not null references public.maps (id) on delete cascade,
  primary key (principle_id, map_id)
);
create table public.principle_roles (
  principle_id bigint not null references public.principles (id) on delete cascade,
  role_id      bigint not null references public.roles (id) on delete cascade,
  primary key (principle_id, role_id)
);
create table public.principle_categories (
  principle_id bigint not null references public.principles (id) on delete cascade,
  category_id  bigint not null references public.categories (id) on delete cascade,
  primary key (principle_id, category_id)
);
create table public.principle_round_types (
  principle_id  bigint not null references public.principles (id) on delete cascade,
  round_type_id bigint not null references public.round_types (id) on delete cascade,
  primary key (principle_id, round_type_id)
);
-- Liens explicites principe ↔ carte (en plus de la correspondance par étiquettes).
create table public.principle_cards (
  principle_id bigint not null references public.principles (id) on delete cascade,
  card_id      bigint not null references public.cards (id) on delete cascade,
  linked_by    uuid default auth.uid() references auth.users (id) on delete set null,
  linked_at    timestamptz not null default now(),
  primary key (principle_id, card_id)
);
create index principle_cards_card_idx on public.principle_cards (card_id);

alter table public.principle_themes      enable row level security;
alter table public.principles            enable row level security;
alter table public.principle_maps        enable row level security;
alter table public.principle_roles       enable row level security;
alter table public.principle_categories  enable row level security;
alter table public.principle_round_types enable row level security;
alter table public.principle_cards       enable row level security;

create policy principle_themes_select on public.principle_themes for select to authenticated using (public.is_member());
create policy principle_themes_admin on public.principle_themes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy principles_select on public.principles for select to authenticated using (public.is_member());
create policy principles_delete on public.principles for delete to authenticated
  using (public.is_admin() or (public.is_member() and author_id = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['principle_maps', 'principle_roles', 'principle_categories', 'principle_round_types'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_member())', t);
  end loop;
end $$;

-- Tout membre peut rattacher / détacher une carte (qu'il voit) à un principe.
create policy principle_cards_select on public.principle_cards for select to authenticated
  using (public.can_view_card(card_id));
create policy principle_cards_insert on public.principle_cards for insert to authenticated
  with check (public.can_view_card(card_id) and linked_by = auth.uid());
create policy principle_cards_delete on public.principle_cards for delete to authenticated
  using (public.can_view_card(card_id));

grant select on public.principle_themes, public.principles, public.principle_maps, public.principle_roles,
  public.principle_categories, public.principle_round_types, public.principle_cards to authenticated;
grant insert, update, delete on public.principle_themes to authenticated;
grant delete on public.principles to authenticated;
grant insert, delete on public.principle_cards to authenticated;

-- Création / mise à jour atomique d'un principe et de ses étiquettes.
-- p = { id?, title, summary, body, theme_id, sides[], pinned, map_ids, role_ids, category_ids, round_type_ids }
create or replace function public.save_principle(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id    bigint := nullif(p ->> 'id', '')::bigint;
  v_sides text[] := array(select jsonb_array_elements_text(coalesce(p -> 'sides', '[]')));
  v_roles bigint[] := array(select jsonb_array_elements_text(coalesce(p -> 'role_ids', '[]'))::bigint);
begin
  if not public.is_member() then
    raise exception 'Accès réservé aux membres' using errcode = '42501';
  end if;
  if btrim(coalesce(p ->> 'title', '')) = '' then raise exception 'Le titre est obligatoire'; end if;
  if length(p ->> 'title') > 120 then raise exception 'Titre trop long (120 caractères max)'; end if;
  if length(coalesce(p ->> 'summary', '')) > 280 then raise exception 'Résumé trop long (280 caractères max)'; end if;
  if length(coalesce(p ->> 'body', '')) > 20000 then raise exception 'Texte trop long (20 000 caractères max)'; end if;
  if not v_sides <@ array['CT', 'T'] then raise exception 'Side invalide'; end if;
  -- Rôles cohérents avec les sides choisis (si des sides sont choisis).
  if cardinality(v_sides) > 0 and exists (
       select 1 from unnest(v_roles) r join public.roles rr on rr.id = r where not rr.side = any (v_sides)) then
    raise exception 'Rôle incompatible avec le side choisi';
  end if;

  if v_id is null then
    insert into public.principles (title, summary, body, theme_id, sides, pinned, author_id, updated_by)
    values (btrim(p ->> 'title'), coalesce(p ->> 'summary', ''), coalesce(p ->> 'body', ''),
            nullif(p ->> 'theme_id', '')::bigint, v_sides, coalesce((p ->> 'pinned')::boolean, false),
            auth.uid(), auth.uid())
    returning id into v_id;
  else
    if not (public.is_admin() or exists (select 1 from public.principles where id = v_id and author_id = auth.uid())) then
      raise exception 'Seuls l''auteur et les admins peuvent modifier ce principe' using errcode = '42501';
    end if;
    update public.principles set
      title = btrim(p ->> 'title'), summary = coalesce(p ->> 'summary', ''), body = coalesce(p ->> 'body', ''),
      theme_id = nullif(p ->> 'theme_id', '')::bigint, sides = v_sides,
      pinned = coalesce((p ->> 'pinned')::boolean, false),
      updated_by = auth.uid(), updated_at = now()
    where id = v_id;
  end if;

  delete from public.principle_maps where principle_id = v_id;
  insert into public.principle_maps select distinct v_id, x::bigint from jsonb_array_elements_text(coalesce(p -> 'map_ids', '[]')) x;
  delete from public.principle_roles where principle_id = v_id;
  insert into public.principle_roles select distinct v_id, x from unnest(v_roles) x;
  delete from public.principle_categories where principle_id = v_id;
  insert into public.principle_categories select distinct v_id, x::bigint from jsonb_array_elements_text(coalesce(p -> 'category_ids', '[]')) x;
  delete from public.principle_round_types where principle_id = v_id;
  insert into public.principle_round_types select distinct v_id, x::bigint from jsonb_array_elements_text(coalesce(p -> 'round_type_ids', '[]')) x;
  return v_id;
end;
$$;

-- Réordonnancement : nouvelles listes admin.
create or replace function public.reorder_tags(p_table text, p_ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux admins' using errcode = '42501';
  end if;
  if p_table not in ('maps', 'zones', 'roles', 'categories', 'risks', 'utilities', 'economies',
                     'round_types', 'principle_themes', 'principles') then
    raise exception 'Table inconnue';
  end if;
  execute format(
    'update public.%I t set sort_order = o.ord from unnest($1) with ordinality o(id, ord) where t.id = o.id',
    p_table) using p_ids;
end;
$$;

-- Les principes se réordonnent aussi (au sein d'un thème).
alter table public.principles add column sort_order int not null default 0;

revoke execute on function public.card_snapshot(bigint) from authenticated;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.save_principle(jsonb), public.reorder_tags(text, bigint[]), public.save_card(jsonb) to authenticated;
