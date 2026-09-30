#!/usr/bin/env bash
# Rejoue les migrations sur une base Postgres locale vierge puis lance les tests RLS.
# Usage : PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -v ON_ERROR_STOP=1 -q"
$P -c 'drop database if exists cs2kb_test' -c 'create database cs2kb_test'
$P -d cs2kb_test -f tests/stub_supabase.sql
for f in migrations/*.sql; do $P -d cs2kb_test -f "$f"; done
$P -d cs2kb_test -f tests/rls_test.sql
