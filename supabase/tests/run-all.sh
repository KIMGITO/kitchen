#!/usr/bin/env bash
# Applies every migration to a throwaway database on plain PostgreSQL, then runs each SQL suite on a fresh copy.
#   PGURL=postgres://postgres:postgres@localhost:5432/postgres ./supabase/tests/run-all.sh
# Needs psql. Never point this at a real project: it creates and drops databases.
set -euo pipefail
PGURL="${PGURL:-postgres://postgres:postgres@localhost:5432/postgres}"
base="${PGURL%/*}"; here="$(cd "$(dirname "$0")" && pwd)"; mig="$here/../migrations"
psql_db() { psql -q -v ON_ERROR_STOP=1 "$base/$1" "${@:2}"; }

psql_db postgres -c 'drop database if exists kt_tpl' -c 'create database kt_tpl' >/dev/null
psql_db kt_tpl -f "$here/ci-stubs.sql" >/dev/null 2>&1
for f in $(ls "$mig"/*.sql | sort); do
  psql_db kt_tpl -f "$f" >/dev/null 2>/tmp/migration.err || { echo "MIGRATION FAILED: $(basename "$f")"; cat /tmp/migration.err; exit 1; }
done
echo "migrations: $(ls "$mig"/*.sql | wc -l) applied"

fail=0
for t in isolation_and_money checkout_and_refunds automation platform_setup flutterwave; do
  psql_db postgres -c "drop database if exists t_$t" -c "create database t_$t template kt_tpl" >/dev/null
  if out=$(psql_db "t_$t" -f "$here/$t.sql" 2>&1); then echo "ok   $t ($(grep -c 'PASS' <<<"$out") assertions)"
  else echo "FAIL $t"; grep -E "ERROR|FAIL" <<<"$out" | head -5; fail=1; fi
  psql_db postgres -c "drop database if exists t_$t" >/dev/null
done
psql_db postgres -c 'drop database if exists kt_tpl' >/dev/null
exit $fail
