import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// OLD project (PitStop shared Supabase)
const OLD_URL = "https://naxldsrvyurgjnnqbvmc.supabase.co";
const OLD_KEY = "REDACTED_OLD_SERVICE_ROLE_KEY";

// NEW project (dedicated Piney Web Supabase)
const NEW_URL = "https://aekvrcguphmjrszbpyof.supabase.co";
const NEW_KEY = "REDACTED_NEW_SERVICE_ROLE_KEY";

const oldDb = createClient(OLD_URL, OLD_KEY);
const newDb = createClient(NEW_URL, NEW_KEY);

const TABLES = [
  "pineyweb_clients",
  "pineyweb_orders",
  "pineyweb_site_content",
  "pineyweb_scanner_queue",
  "pineyweb_daily_send_tracker",
  "pineyweb_prospects", // last because it's the largest
];

const EXPORT_DIR = path.resolve("scripts/migration-export");

async function fetchAll(db: ReturnType<typeof createClient>, table: string) {
  const allRows: unknown[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Fetch ${table} at offset ${offset}: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return allRows;
}

async function exportData() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

  for (const table of TABLES) {
    console.log(`Exporting ${table}...`);
    try {
      const rows = await fetchAll(oldDb, table);
      const filePath = path.join(EXPORT_DIR, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
      console.log(`  ✓ ${rows.length} rows → ${filePath}`);
    } catch (err) {
      console.log(`  ✗ ${table}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function runMigrations() {
  const migrationsDir = path.resolve("supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  console.log(`\nRunning ${files.length} migrations against NEW project...`);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    console.log(`  Running ${file}...`);
    const { error } = await newDb.rpc("exec_sql", { sql_text: sql }).maybeSingle();
    if (error) {
      // rpc may not exist — try raw REST
      console.log(`  ⚠ RPC not available, trying direct SQL via REST...`);
      const res = await fetch(`${NEW_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": NEW_KEY,
          "Authorization": `Bearer ${NEW_KEY}`,
        },
        body: JSON.stringify({ sql_text: sql }),
      });
      if (!res.ok) {
        console.log(`  ✗ ${file}: REST also failed (${res.status}). Will need manual migration.`);
      } else {
        console.log(`  ✓ ${file}`);
      }
    } else {
      console.log(`  ✓ ${file}`);
    }
  }
}

async function importData() {
  console.log(`\nImporting data into NEW project...`);

  for (const table of TABLES) {
    const filePath = path.join(EXPORT_DIR, `${table}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping ${table} — no export file`);
      continue;
    }

    const rows = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows (empty)`);
      continue;
    }

    console.log(`  Importing ${rows.length} rows into ${table}...`);

    // Insert in batches of 500
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await newDb.from(table).upsert(batch, { onConflict: "id", ignoreDuplicates: true });
      if (error) {
        console.log(`    ✗ Batch ${i}-${i + batch.length}: ${error.message}`);
        // Try one by one for this batch
        for (const row of batch) {
          const { error: singleErr } = await newDb.from(table).upsert(row, { onConflict: "id", ignoreDuplicates: true });
          if (!singleErr) inserted++;
        }
      } else {
        inserted += batch.length;
      }
    }
    console.log(`  ✓ ${table}: ${inserted}/${rows.length} rows imported`);
  }
}

async function verify() {
  console.log(`\nVerifying row counts...`);
  console.log(`${"Table".padEnd(35)} ${"Old".padStart(6)} ${"New".padStart(6)}  Status`);
  console.log("-".repeat(65));

  for (const table of TABLES) {
    const { count: oldCount } = await oldDb.from(table).select("*", { count: "exact", head: true });
    const { count: newCount } = await newDb.from(table).select("*", { count: "exact", head: true });
    const match = oldCount === newCount ? "✓" : "✗ MISMATCH";
    console.log(`${table.padEnd(35)} ${String(oldCount ?? 0).padStart(6)} ${String(newCount ?? 0).padStart(6)}  ${match}`);
  }
}

async function main() {
  console.log("=== Supabase Migration: Old → New ===\n");

  console.log("Step 1: Export data from OLD project");
  await exportData();

  console.log("\nStep 2: Run migrations on NEW project");
  await runMigrations();

  console.log("\nStep 3: Import data into NEW project");
  await importData();

  console.log("\nStep 4: Verify");
  await verify();

  console.log("\n=== Migration complete ===");
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
