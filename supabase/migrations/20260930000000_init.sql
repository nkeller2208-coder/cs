-- =====================================================================
-- CS2 Playbook – schéma initial
-- Tables relationnelles, RLS sur toutes les tables, RPC transactionnelles.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Membres & liste blanche
-- ---------------------------------------------------------------------

create table public.allowlist (
  id          bigint generated always as identity primary key,
  email       text unique check (email is null or email = lower(email)),
  discord_id  text unique,
  role        text not null default 'member' check (role in ('admin', 'member')),
  note        text,
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (email is not null or discord_id is not null)
);

create table public.members (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text not null default '',
  avatar_url    text,
  role          text not null default 'member' check (role in ('admin', 'member')),
  created_at    timestamptz not null default now()
);

-- Préférences par membre (dernières valeurs utilisées dans le formulaire).
create table public.member_prefs (
  member_id    uuid primary key references public.members (id) on delete cascade,
  last_values  jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where id = auth.uid());
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where id = auth.uid() and role = 'admin');
$$;

-- Appelée par le client après connexion : crée la fiche membre si l'email
-- ou l'identifiant Discord figure dans la liste blanche.
create or replace function public.claim_membership() returns public.members
language plpgsql security definer set search_path = public as $$
declare
  u        auth.users;
  entry    public.allowlist;
  m        public.members;
  v_email  text;
  v_disc   text;
  v_name   text;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  select * into u from auth.users where id = auth.uid();
  v_email := lower(u.email);
  v_disc  := coalesce(u.raw_user_meta_data ->> 'provider_id', u.raw_user_meta_data ->> 'sub');
  v_name  := coalesce(
    u.raw_user_meta_data -> 'custom_claims' ->> 'global_name',
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(coalesce(u.email, ''), '@', 1)
  );

  select * into m from public.members where id = u.id;
  if found then
    update public.members
       set email = coalesce(v_email, email),
           avatar_url = coalesce(u.raw_user_meta_data ->> 'avatar_url', avatar_url),
           display_name = case when display_name = '' then coalesce(v_name, '') else display_name end
     where id = u.id
     returning * into m;
    return m;
  end if;

  select * into entry from public.allowlist
   where (v_email is not null and email = v_email)
      or (v_disc is not null and discord_id = v_disc)
   limit 1;

  if not found then
    return null;
  end if;

  insert into public.members (id, email, display_name, avatar_url, role)
  values (u.id, v_email, coalesce(v_name, ''), u.raw_user_meta_data ->> 'avatar_url', entry.role)
  returning * into m;

  insert into public.member_prefs (member_id) values (u.id) on conflict do nothing;
  return m;
end;
$$;

-- Retire un membre : supprime sa fiche et son entrée de liste blanche.
-- Ses cartes sont conservées (auteur conservé en base, affiché « ancien membre »).
create or replace function public.remove_member(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux admins' using errcode = '42501';
  end if;
  if p_member = auth.uid() then
    raise exception 'Impossible de se retirer soi-même';
  end if;
  select email into v_email from public.members where id = p_member;
  delete from public.allowlist a
   where (v_email is not null and a.email = v_email)
      or a.discord_id = (select coalesce(raw_user_meta_data ->> 'provider_id', raw_user_meta_data ->> 'sub')
                           from auth.users where id = p_member);
  delete from public.members where id = p_member;
end;
$$;

-- ---------------------------------------------------------------------
-- Listes d'étiquettes (éditables par l'admin)
-- ---------------------------------------------------------------------

create table public.maps (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.zones (
  id          bigint generated always as identity primary key,
  map_id      bigint not null references public.maps (id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  pending     boolean not null default false,   -- « à valider » : créée par un membre
  created_by  uuid references public.members (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (map_id, name)
);

create table public.roles (
  id          bigint generated always as identity primary key,
  side        text not null check (side in ('CT', 'T')),
  name        text not null,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (side, name)
);

create table public.categories (
  id            bigint generated always as identity primary key,
  name          text not null unique,
  shows_utility boolean not null default false, -- « Stuff » : affiche le type d'utilitaire
  sort_order    int not null default 0,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.risks (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  color       text not null default '#64748b',
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.utilities (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.economies (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Cartes
-- ---------------------------------------------------------------------

create table public.cards (
  id              bigint generated always as identity primary key,
  title           varchar(100) not null default '',
  description     text not null default '',
  map_id          bigint references public.maps (id) on delete restrict,
  side            text check (side in ('CT', 'T')),
  risk_id         bigint references public.risks (id) on delete set null,
  status          text not null default 'published' check (status in ('draft', 'published', 'review')),
  review_comment  text,
  review_by       uuid references public.members (id) on delete set null,
  author_id       uuid not null default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  -- Un brouillon peut être incomplet ; une carte publiée respecte les obligatoires.
  constraint card_complete check (
    status = 'draft' or (btrim(title) <> '' and map_id is not null and side is not null)
  )
);
-- author_id doit pouvoir être null si le compte auth est supprimé
alter table public.cards alter column author_id drop not null;

create index cards_map_idx on public.cards (map_id);
create index cards_status_idx on public.cards (status);

create table public.card_media (
  id        bigint generated always as identity primary key,
  card_id   bigint not null references public.cards (id) on delete cascade,
  url       text not null,
  kind      text not null check (kind in ('youtube', 'image', 'link')),
  url_key   text not null,          -- clé normalisée pour l'anti-doublon
  position  int not null default 0
);
create index card_media_card_idx on public.card_media (card_id);
create index card_media_key_idx on public.card_media (url_key);

create table public.card_roles (
  card_id bigint not null references public.cards (id) on delete cascade,
  role_id bigint not null references public.roles (id) on delete restrict,
  primary key (card_id, role_id)
);
create table public.card_categories (
  card_id     bigint not null references public.cards (id) on delete cascade,
  category_id bigint not null references public.categories (id) on delete restrict,
  primary key (card_id, category_id)
);
create table public.card_zones (
  card_id bigint not null references public.cards (id) on delete cascade,
  zone_id bigint not null references public.zones (id) on delete cascade,
  primary key (card_id, zone_id)
);
create table public.card_utilities (
  card_id    bigint not null references public.cards (id) on delete cascade,
  utility_id bigint not null references public.utilities (id) on delete restrict,
  primary key (card_id, utility_id)
);
create table public.card_economies (
  card_id    bigint not null references public.cards (id) on delete cascade,
  economy_id bigint not null references public.economies (id) on delete restrict,
  primary key (card_id, economy_id)
);
create index card_roles_role_idx on public.card_roles (role_id);
create index card_categories_cat_idx on public.card_categories (category_id);
create index card_zones_zone_idx on public.card_zones (zone_id);
create index card_utilities_util_idx on public.card_utilities (utility_id);
create index card_economies_eco_idx on public.card_economies (economy_id);

-- Historique : un instantané complet par modification.
create table public.card_history (
  id          bigint generated always as identity primary key,
  card_id     bigint not null references public.cards (id) on delete cascade,
  action      text not null,  -- create | update | status
  changed_by  uuid references auth.users (id) on delete set null,
  changed_at  timestamptz not null default now(),
  note        text,
  snapshot    jsonb not null
);
create index card_history_card_idx on public.card_history (card_id, changed_at desc);

-- ---------------------------------------------------------------------
-- Fonctions utilitaires cartes
-- ---------------------------------------------------------------------

create or replace function public.can_edit_card(p_card bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.cards c
                  where c.id = p_card and c.author_id = auth.uid() and public.is_member());
$$;

create or replace function public.can_view_card(p_card bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and exists (
    select 1 from public.cards c
     where c.id = p_card and (c.status <> 'draft' or c.author_id = auth.uid())
  );
$$;

-- Réservée aux fonctions internes (pas de droit d'exécution pour les clients).
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
    'economy_ids', coalesce((select jsonb_agg(economy_id order by economy_id) from public.card_economies where card_id = c.id), '[]'::jsonb)
  )
  from public.cards c where c.id = p_card;
$$;

create or replace function public.log_card_history(p_card bigint, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_snap jsonb := public.card_snapshot(p_card);
  v_last public.card_history;
begin
  if not public.can_view_card(p_card) then
    raise exception 'Carte introuvable' using errcode = '42501';
  end if;
  select * into v_last from public.card_history
   where card_id = p_card order by changed_at desc, id desc limit 1;
  -- Évite d'empiler des entrées identiques (sauvegarde auto des brouillons).
  if found and v_last.snapshot = v_snap and v_last.changed_by is not distinct from auth.uid() then
    return;
  end if;
  -- Les sauvegardes auto successives d'un brouillon par la même personne
  -- sont fusionnées en une seule entrée.
  if found and v_last.snapshot ->> 'status' = 'draft' and v_snap ->> 'status' = 'draft'
     and v_last.changed_by is not distinct from auth.uid() then
    update public.card_history set snapshot = v_snap, changed_at = now() where id = v_last.id;
    return;
  end if;
  insert into public.card_history (card_id, action, changed_by, note, snapshot)
  values (p_card, p_action, auth.uid(), p_note, v_snap);
end;
$$;

-- Création / mise à jour atomique d'une carte et de toutes ses étiquettes.
-- SECURITY INVOKER : la RLS s'applique normalement.
--
-- p jsonb = {
--   id?, title, description, map_id, side, risk_id, status,
--   media: [{url, kind, url_key}], role_ids, category_ids, zone_ids,
--   utility_ids, economy_ids, remember?: bool
-- }
create or replace function public.save_card(p jsonb) returns bigint
language plpgsql security invoker set search_path = public as $$
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
begin
  if not public.is_member() then
    raise exception 'Accès réservé aux membres' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'published', 'review') then
    raise exception 'Statut invalide';
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
    select status into v_prev from public.cards where id = v_id;
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
  select distinct v_id, x::bigint from jsonb_array_elements_text(coalesce(p -> 'role_ids', '[]')) x;

  delete from public.card_categories where card_id = v_id;
  insert into public.card_categories (card_id, category_id)
  select distinct v_id, x from unnest(v_cats) x;

  delete from public.card_zones where card_id = v_id;
  insert into public.card_zones (card_id, zone_id)
  select distinct v_id, x::bigint from jsonb_array_elements_text(coalesce(p -> 'zone_ids', '[]')) x;

  delete from public.card_utilities where card_id = v_id;
  -- Le type d'utilitaire n'a de sens que si une catégorie « Stuff » est cochée.
  if exists (select 1 from public.categories where id = any (v_cats) and shows_utility) then
    insert into public.card_utilities (card_id, utility_id)
    select distinct v_id, x::bigint from jsonb_array_elements_text(coalesce(p -> 'utility_ids', '[]')) x;
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
      'economy_ids', coalesce(p -> 'economy_ids', '[]')
    ), now())
    on conflict (member_id) do update set last_values = excluded.last_values, updated_at = now();
  end if;

  return v_id;
end;
$$;

-- N'importe quel membre peut signaler une carte « À revoir ».
create or replace function public.flag_card_for_review(p_card bigint, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_view_card(p_card) then
    raise exception 'Carte introuvable' using errcode = '42501';
  end if;
  if btrim(coalesce(p_comment, '')) = '' then
    raise exception 'Un commentaire est requis';
  end if;
  update public.cards
     set status = 'review', review_comment = left(btrim(p_comment), 280), review_by = auth.uid(),
         updated_by = auth.uid(), updated_at = now()
   where id = p_card and status <> 'draft';
  if not found then raise exception 'Un brouillon ne peut pas être signalé'; end if;
  perform public.log_card_history(p_card, 'status', left(btrim(p_comment), 280));
end;
$$;

-- Lever le signalement : auteur, admin, ou le membre qui l'a signalée.
create or replace function public.resolve_card_review(p_card bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.can_edit_card(p_card)
          or exists (select 1 from public.cards where id = p_card and review_by = auth.uid())) then
    raise exception 'Non autorisé' using errcode = '42501';
  end if;
  update public.cards
     set status = 'published', review_comment = null, review_by = null,
         updated_by = auth.uid(), updated_at = now()
   where id = p_card and status = 'review';
  perform public.log_card_history(p_card, 'status', 'Signalement levé');
end;
$$;

-- Fusion de zones (admin) : les cartes de la source passent sur la cible.
create or replace function public.merge_zones(p_source bigint, p_target bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux admins' using errcode = '42501';
  end if;
  if p_source = p_target then raise exception 'Zones identiques'; end if;
  if (select map_id from public.zones where id = p_source)
     is distinct from (select map_id from public.zones where id = p_target) then
    raise exception 'Les deux zones doivent appartenir à la même map';
  end if;
  insert into public.card_zones (card_id, zone_id)
  select card_id, p_target from public.card_zones where zone_id = p_source
  on conflict do nothing;
  delete from public.zones where id = p_source;
  update public.zones set pending = false where id = p_target;
end;
$$;

-- Réordonnancement en une requête : ids dans l'ordre voulu.
create or replace function public.reorder_tags(p_table text, p_ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux admins' using errcode = '42501';
  end if;
  if p_table not in ('maps', 'zones', 'roles', 'categories', 'risks', 'utilities', 'economies') then
    raise exception 'Table inconnue';
  end if;
  execute format(
    'update public.%I t set sort_order = o.ord from unnest($1) with ordinality o(id, ord) where t.id = o.id',
    p_table) using p_ids;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.allowlist       enable row level security;
alter table public.members         enable row level security;
alter table public.member_prefs    enable row level security;
alter table public.maps            enable row level security;
alter table public.zones           enable row level security;
alter table public.roles           enable row level security;
alter table public.categories      enable row level security;
alter table public.risks           enable row level security;
alter table public.utilities       enable row level security;
alter table public.economies       enable row level security;
alter table public.cards           enable row level security;
alter table public.card_media      enable row level security;
alter table public.card_roles      enable row level security;
alter table public.card_categories enable row level security;
alter table public.card_zones      enable row level security;
alter table public.card_utilities  enable row level security;
alter table public.card_economies  enable row level security;
alter table public.card_history    enable row level security;

-- Liste blanche : admin uniquement.
create policy allowlist_admin on public.allowlist for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Membres : lecture par les membres, gestion par l'admin.
create policy members_select on public.members for select to authenticated using (public.is_member());
create policy members_admin_update on public.members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy members_self_update on public.members for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select m.role from public.members m where m.id = auth.uid()));

-- Préférences : chacun les siennes.
create policy prefs_own on public.member_prefs for all to authenticated
  using (member_id = auth.uid() and public.is_member())
  with check (member_id = auth.uid() and public.is_member());

-- Listes d'étiquettes : lecture membres, écriture admin.
do $$
declare t text;
begin
  foreach t in array array['maps', 'roles', 'categories', 'risks', 'utilities', 'economies', 'zones'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_member())', t);
    execute format('create policy %1$s_admin on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Zones : un membre peut proposer une zone (marquée « à valider »).
create policy zones_member_insert on public.zones for insert to authenticated
  with check (public.is_member() and pending and created_by = auth.uid() and not archived);

-- Cartes
create policy cards_select on public.cards for select to authenticated
  using (public.is_member() and (status <> 'draft' or author_id = auth.uid()));
create policy cards_insert on public.cards for insert to authenticated
  with check (public.is_member() and author_id = auth.uid());
create policy cards_update on public.cards for update to authenticated
  using (public.is_admin() or (public.is_member() and author_id = auth.uid()))
  with check (public.is_admin() or (public.is_member() and author_id = auth.uid()));
create policy cards_delete on public.cards for delete to authenticated
  using (public.is_admin() or (public.is_member() and author_id = auth.uid()));

-- Tables liées aux cartes : visibles si la carte l'est, modifiables si la carte l'est.
do $$
declare t text;
begin
  foreach t in array array['card_media', 'card_roles', 'card_categories', 'card_zones', 'card_utilities', 'card_economies'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.can_view_card(card_id))', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated using (public.can_edit_card(card_id)) with check (public.can_edit_card(card_id))', t);
  end loop;
end $$;

-- Historique : lecture seule (écrit par les fonctions SECURITY DEFINER).
create policy history_select on public.card_history for select to authenticated
  using (public.can_view_card(card_id));

-- Aucun accès anonyme.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.card_snapshot(bigint) from authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
