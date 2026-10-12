#!/usr/bin/env bash
# Aplica la migración en una base de datos Postgres vacía y ejecuta las pruebas de acceso.
# Uso: DATABASE_URL=postgres://... scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/../supabase"
: "${DATABASE_URL:?Define DATABASE_URL apuntando a una base de datos vacía de pruebas}"
for f in tests/00_stub_supabase.sql migrations/*.sql tests/10_rls_test.sql; do
  if ! out=$(psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
    echo "$out" | grep -E 'ERROR|FALLO|CONTEXT' || echo "$out"
    echo "Falló $f"
    exit 1
  fi
  echo "$out" | grep -oE 'ok: .*' || true
done
echo "Pruebas de base de datos superadas"
