#!/usr/bin/env bash
# Aplica as migrações numa base de dados Postgres descartável (com um "stub"
# do schema auth do Supabase) e corre os testes SQL.
# Usa as variáveis PG* habituais (PGHOST, PGUSER, PGPASSWORD, PGPORT).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-apostas_test}"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { psql -v ON_ERROR_STOP=1 -q -X -d "$DB" -f "$1"; }
run supabase/tests/00_auth_stub.sql
for f in supabase/migrations/*.sql; do run "$f"; done
for f in supabase/tests/[1-9]*_test.sql; do run "$f"; done
