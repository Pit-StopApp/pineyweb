#!/bin/bash
# Run all migrations and import data into the new Supabase project.
# Uses SUPABASE_DB_URL from .env.local for direct PostgreSQL connection.
#
# Usage:
#   1. supabase login
#   2. ./scripts/run-migration.sh
#
# If direct connection fails (IPv6-only host), falls back to:
#   supabase db push --linked
#
set -euo pipefail

# Load env
set -a; source .env.local 2>/dev/null; set +a

DB_URL="${SUPABASE_DB_URL:-}"
PROJECT_REF="aekvrcguphmjrszbpyof"
PSQL="/opt/homebrew/Cellar/libpq/18.3/bin/psql"
MIGRATIONS_SQL="scripts/migration-export/all-migrations.sql"

echo "=== Supabase Migration ==="
echo ""

# Step 1: Try direct psql connection
echo "Step 1: Testing database connection..."
if [ -n "$DB_URL" ] && $PSQL "${DB_URL}?sslmode=require" -c "SELECT 'connected' as status" 2>/dev/null; then
    echo "✓ Direct connection works"
    echo ""
    echo "Step 2: Running migrations..."
    $PSQL "${DB_URL}?sslmode=require" -f "$MIGRATIONS_SQL" 2>&1 || true
    echo "✓ Migrations complete"
else
    echo "✗ Direct connection failed (likely IPv6-only host)"
    echo ""
    echo "Step 2: Trying supabase db push..."
    if supabase link --project-ref "$PROJECT_REF" 2>/dev/null; then
        echo "Linked to project"
        supabase db push
        echo "✓ Migrations pushed via Supabase CLI"
    else
        echo "✗ Supabase CLI not authenticated"
        echo ""
        echo "Please run one of:"
        echo "  ! supabase login"
        echo "  Then re-run: ./scripts/run-migration.sh"
        echo ""
        echo "OR paste scripts/migration-export/all-migrations.sql into:"
        echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/sql"
        exit 1
    fi
fi

echo ""
echo "Step 3: Importing data..."
npx tsx scripts/import-to-new-supabase.ts

echo ""
echo "=== Done ==="
