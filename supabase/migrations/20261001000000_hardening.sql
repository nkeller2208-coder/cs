-- =====================================================================
-- Durcissement (audit) :
--  * toutes les écritures de cartes passent par save_card (SECURITY DEFINER)
--    qui vérifie droits, cohérence (zones ↔ map, rôles ↔ side) et limites ;
--  * plus d'écriture directe sur cards / tables de liaison via l'API ;
--  * log_card_history n'est plus appelable par les clients.
-- =====================================================================

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


revoke execute on function public.log_card_history(bigint, text, text) from authenticated;

-- Écritures directes interdites : seules les fonctions (propriétaire) écrivent.
drop policy if exists cards_insert on public.cards;
drop policy if exists cards_update on public.cards;
revoke insert, update on public.cards from authenticated;
do $$
declare t text;
begin
  foreach t in array array['card_media', 'card_roles', 'card_categories', 'card_zones', 'card_utilities', 'card_economies'] loop
    execute format('drop policy if exists %1$s_write on public.%1$I', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;
revoke insert, update, delete on public.card_history from authenticated;

alter table public.cards add constraint card_description_length check (length(description) <= 20000);
