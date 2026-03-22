import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// NEW project
const NEW_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aekvrcguphmjrszbpyof.supabase.co";
const NEW_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!NEW_KEY) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY in env"); process.exit(1); }

const newDb = createClient(NEW_URL, NEW_KEY);

// OLD project for verification
const OLD_URL = "https://naxldsrvyurgjnnqbvmc.supabase.co";
const OLD_KEY = "REDACTED_OLD_SERVICE_ROLE_KEY";
const oldDb = createClient(OLD_URL, OLD_KEY);

const EXPORT_DIR = path.resolve("scripts/migration-export");

const TABLES = [
  "pineyweb_clients",
  "pineyweb_site_content",
  "pineyweb_scanner_queue",
  "pineyweb_daily_send_tracker",
  "pineyweb_prospects",
];

function ts(): string { return new Date().toLocaleTimeString(); }

async function importTable(table: string): Promise<number> {
  const filePath = path.join(EXPORT_DIR, `${table}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`  Skipping ${table} — no export file`);
    return 0;
  }

  const rows = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows (empty)`);
    return 0;
  }

  console.log(`[${ts()}] Importing ${rows.length} rows into ${table}...`);

  const BATCH = 200;
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await newDb.from(table).upsert(batch, { onConflict: "id", ignoreDuplicates: true });

    if (error) {
      if (error.message.includes("schema cache")) {
        console.log(`  ✗ Table ${table} not found — run migrations first!`);
        return 0;
      }
      console.log(`  ✗ Batch ${i}-${i + batch.length}: ${error.message}`);
      // Try one-by-one
      for (const row of batch) {
        const { error: singleErr } = await newDb.from(table).upsert(row, { onConflict: "id", ignoreDuplicates: true });
        if (singleErr) {
          errors++;
          if (errors <= 3) console.log(`    Row error: ${singleErr.message.substring(0, 100)}`);
        } else {
          imported++;
        }
      }
    } else {
      imported += batch.length;
    }

    if (i > 0 && i % 1000 === 0) {
      console.log(`  ... ${imported} rows imported so far`);
    }
  }

  if (errors > 3) console.log(`    (${errors} total row errors)`);
  console.log(`  ✓ ${table}: ${imported}/${rows.length} rows imported`);
  return imported;
}

async function verify() {
  console.log(`\n[${ts()}] Verifying row counts...`);
  console.log(`${"Table".padEnd(35)} ${"Old".padStart(6)} ${"New".padStart(6)}  Status`);
  console.log("-".repeat(60));

  let allMatch = true;
  for (const table of TABLES) {
    const { count: oldCount } = await oldDb.from(table).select("*", { count: "exact", head: true });
    const { count: newCount } = await newDb.from(table).select("*", { count: "exact", head: true });
    const match = oldCount === newCount;
    if (!match) allMatch = false;
    console.log(`${table.padEnd(35)} ${String(oldCount ?? 0).padStart(6)} ${String(newCount ?? 0).padStart(6)}  ${match ? "✓" : "✗ MISMATCH"}`);
  }
  return allMatch;
}

async function main() {
  console.log(`=== Import Data to New Supabase ===\n`);

  // Check if tables exist
  console.log(`[${ts()}] Checking if tables exist in new project...`);
  const { error: testErr } = await newDb.from("pineyweb_clients").select("id").limit(1);
  if (testErr?.message.includes("schema cache") || testErr?.message.includes("does not exist")) {
    console.log(`\n✗ Tables don't exist yet!`);
    console.log(`\nPlease paste the SQL from scripts/migration-export/all-migrations.sql`);
    console.log(`into the Supabase SQL Editor at:`);
    console.log(`  https://supabase.com/dashboard/project/aekvrcguphmjrszbpyof/sql\n`);
    console.log(`Then re-run: npx tsx scripts/import-to-new-supabase.ts`);
    process.exit(1);
  }
  console.log(`  ✓ Tables found\n`);

  // Import in order
  for (const table of TABLES) {
    await importTable(table);
  }

  // Verify
  const allMatch = await verify();

  console.log(`\n=== ${allMatch ? "Migration successful! ✓" : "Migration complete with mismatches — review above"} ===`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
