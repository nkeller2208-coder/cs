#!/usr/bin/env bash
# Test de bout en bout sans Supabase : Postgres local + PostgREST + Vite + Playwright.
#
# Prérequis : un serveur Postgres accessible (variables PGHOST/PGPORT/PGUSER, superutilisateur),
#             le binaire `postgrest` dans le PATH (https://github.com/PostgREST/postgrest/releases).
# Usage     : PGHOST=/var/run/postgresql PGUSER=postgres npm run e2e
set -euo pipefail
cd "$(dirname "$0")/.."

DB=cs2kb_e2e
SECRET=super-secret-jwt-token-with-at-least-32-characters-long
P="psql -v ON_ERROR_STOP=1 -q"
TMP=$(mktemp -d)
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; rm -rf "$TMP"; }
trap cleanup EXIT

echo "→ Base de test $DB"
$P -c "drop database if exists $DB with (force)" -c "create database $DB" 2>&1 | grep -v NOTICE || true
$P -d $DB -f supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do $P -d $DB -f "$f"; done
$P -d $DB <<'SQL'
do $$ begin create role authenticator login noinherit; exception when duplicate_object then null; end $$;
grant anon, authenticated to authenticator;
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111', 'admin@team.gg', '{"full_name":"Zywoo"}'),
 ('22222222-2222-2222-2222-222222222222', 'membre@team.gg', '{"full_name":"Apex"}'),
 ('33333333-3333-3333-3333-333333333333', 'intrus@x.gg', '{}');
insert into public.allowlist (email, role) values ('admin@team.gg', 'admin'), ('membre@team.gg', 'member');
SQL

HOST_PARAM=${PGHOST:-localhost}
cat > "$TMP/pgrst.conf" <<CONF
db-uri = "postgres://authenticator@/$DB?host=$HOST_PARAM&port=${PGPORT:-5432}"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 3001
CONF

echo "→ PostgREST, proxy, Vite"
postgrest "$TMP/pgrst.conf" > "$TMP/pgrst.log" 2>&1 & PIDS+=($!)
node e2e/proxy.mjs > "$TMP/proxy.log" 2>&1 & PIDS+=($!)
ANON=$(node e2e/jwt.mjs anon)
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=$ANON \
  npx vite --port 5173 --strictPort --mode e2e > "$TMP/vite.log" 2>&1 & PIDS+=($!)
for i in $(seq 1 40); do curl -sf -o /dev/null http://localhost:5173 && break; sleep 0.5; done

echo "→ Scénario"
node e2e/scenario.mjs
