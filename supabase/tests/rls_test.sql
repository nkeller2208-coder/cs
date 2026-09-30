-- Tests de bout en bout des politiques RLS et des RPC.
-- Usage : psql -v ON_ERROR_STOP=1 -f stub_supabase.sql -f migrations/*.sql -f rls_test.sql
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin@Team.gg', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@team.gg', '{"provider_id":"123456","custom_claims":{"global_name":"Bibi"}}'),
  ('00000000-0000-0000-0000-00000000000c', 'intrus@x.gg', '{}');
insert into public.allowlist (email, role) values ('admin@team.gg', 'admin');
insert into public.allowlist (discord_id, role) values ('123456', 'member');

set role authenticated;

-- Intrus : pas de fiche membre, rien de visible
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select public.claim_membership()) is null, 'intrus accepté';
  assert (select count(*) from public.maps) = 0, 'intrus voit les maps';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select (public.claim_membership()).role) = 'admin', 'admin non reconnu';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$
declare v_id bigint; v_draft bigint; mirage bigint; ctfixe bigint; stuff bigint; smoke bigint; z bigint;
begin
  assert (select (public.claim_membership()).display_name) = 'Bibi', 'membre discord non reconnu';
  assert (select count(*) from public.maps) = 8, 'membre ne voit pas les maps';
  select id into mirage from public.maps where name = 'Mirage';
  select id into ctfixe from public.roles where name = 'Fixe A';
  select id into stuff from public.categories where name = 'Stuff';
  select id into smoke from public.utilities where name = 'Smoke';

  -- validation
  begin
    perform public.save_card(jsonb_build_object('title', 'x', 'map_id', mirage, 'side', 'CT'));
    assert false, 'carte sans catégorie acceptée';
  exception when raise_exception then null; end;

  v_id := public.save_card(jsonb_build_object(
    'title', 'Smoke CT depuis T spawn', 'map_id', mirage, 'side', 'CT',
    'role_ids', jsonb_build_array(ctfixe), 'category_ids', jsonb_build_array(stuff),
    'utility_ids', jsonb_build_array(smoke),
    'media', jsonb_build_array(jsonb_build_object('url', 'https://youtu.be/abc?t=12', 'kind', 'youtube', 'url_key', 'yt:abc'))));
  assert (select count(*) from public.card_utilities where card_id = v_id) = 1, 'utilitaire non enregistré';
  assert (select count(*) from public.card_history where card_id = v_id) = 1, 'historique absent';
  assert (select last_values ->> 'side' from public.member_prefs) = 'CT', 'prefs non mémorisées';

  -- utilitaire ignoré sans Stuff
  perform public.save_card(jsonb_build_object('id', v_id,
    'title', 'Smoke CT (maj)', 'map_id', mirage, 'side', 'CT',
    'category_ids', jsonb_build_array((select id from public.categories where name = 'Position')),
    'utility_ids', jsonb_build_array(smoke), 'description', 'desc'));
  assert (select count(*) from public.card_utilities where card_id = v_id) = 0, 'utilitaire gardé sans Stuff';
  assert (select count(*) from public.card_media where card_id = v_id) = 0, 'médias non remplacés';
  assert (select count(*) from public.card_history where card_id = v_id) = 2, 'historique maj absent';

  -- brouillon incomplet autorisé, sauvegardes auto fusionnées
  v_draft := public.save_card(jsonb_build_object('status', 'draft', 'title', ''));
  perform public.save_card(jsonb_build_object('id', v_draft, 'status', 'draft', 'title', 'wip'));
  perform public.save_card(jsonb_build_object('id', v_draft, 'status', 'draft', 'title', 'wip 2'));
  assert (select count(*) from public.card_history where card_id = v_draft) = 1, 'brouillon : historique non fusionné';
  perform set_config('test.draft', v_draft::text, false);
  perform set_config('test.card', v_id::text, false);

  -- proposer une zone
  insert into public.zones (map_id, name, pending) values (mirage, 'Chair', true) returning id into z;
  begin
    insert into public.zones (map_id, name, pending) values (mirage, 'Pas pending', false);
    assert false, 'zone non pending acceptée';
  exception when insufficient_privilege then null; end;
  perform set_config('test.zone', z::text, false);

  -- pas d'accès admin
  begin
    insert into public.maps (name) values ('Vertigo');
    assert false, 'membre a créé une map';
  exception when insufficient_privilege then null; end;
  begin
    update public.members set role = 'admin' where id = auth.uid();
  exception when insufficient_privilege then null; end;
  assert (select role from public.members where id = auth.uid()) = 'member', 'auto-promotion possible';
exception when check_violation then assert false, 'check violation';
end $$;

-- Admin : ne voit pas le brouillon de B, peut modifier la carte publiée, fusionne la zone
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare v_id bigint := current_setting('test.card')::bigint; z bigint := current_setting('test.zone')::bigint; palace bigint;
begin
  assert (select count(*) from public.cards where id = current_setting('test.draft')::bigint) = 0, 'admin voit un brouillon';
  assert (select count(*) from public.cards where id = v_id) = 1, 'admin ne voit pas la carte';
  select id into palace from public.zones where name = 'Palace' and map_id = (select id from public.maps where name='Mirage');
  insert into public.card_zones values (v_id, z);
  perform public.merge_zones(z, palace);
  assert (select zone_id from public.card_zones where card_id = v_id) = palace, 'fusion ratée';
  perform public.flag_card_for_review(v_id, 'Lineup cassé depuis le patch');
  assert (select status from public.cards where id = v_id) = 'review', 'signalement raté';
  perform public.reorder_tags('maps', array(select id from public.maps order by name desc));
  assert (select name from public.maps order by sort_order limit 1) = 'Train', 'reorder raté';
end $$;

-- B : ne peut pas modifier une carte d'autrui ; lève le signalement de sa carte
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$
declare v_id bigint := current_setting('test.card')::bigint; other bigint;
begin
  perform public.resolve_card_review(v_id);
  assert (select status from public.cards where id = v_id) = 'published', 'résolution ratée';
  assert (select count(*) from public.card_history where card_id = v_id) >= 4, 'historique statut absent';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare other bigint;
begin
  other := public.save_card(jsonb_build_object('title', 'Carte admin', 'map_id', (select id from public.maps limit 1),
    'side', 'T', 'category_ids', jsonb_build_array((select id from public.categories limit 1)), 'description', 'x'));
  perform set_config('test.other', other::text, false);
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$
declare other bigint := current_setting('test.other')::bigint;
begin
  begin
    perform public.save_card(jsonb_build_object('id', other, 'title', 'piratage', 'map_id', 1, 'side', 'T',
      'category_ids', jsonb_build_array(1), 'description', 'x'));
    assert false, 'modification carte d''autrui acceptée';
  exception when insufficient_privilege then null; end;
  delete from public.cards where id = other;
  assert (select count(*) from public.cards where id = other) = 1, 'suppression carte d''autrui';
  begin
    perform public.card_snapshot(other);
    assert false, 'card_snapshot exposé';
  exception when insufficient_privilege then null; end;
  begin
    perform public.merge_zones(1, 2);
    assert false, 'fusion par un membre';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select 'OK : tous les tests RLS passent' as result;
