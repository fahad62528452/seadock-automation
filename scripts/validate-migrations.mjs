#!/usr/bin/env node
/**
 * Lightweight migration sanity checks for CI / local validation
 * without requiring a running Postgres instance.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("No migration files found.");
  process.exit(1);
}

const requiredTables = [
  "profiles",
  "vendors",
  "purchase_orders",
  "purchase_order_items",
  "goods_receipts",
  "goods_receipt_items",
  "batches",
  "processing_runs",
  "inventory_items",
  "inventory_movements",
  "customer_purchase_orders",
  "customer_purchase_order_items",
  "fulfilments",
  "fulfilment_items",
  "incoming_qaqc",
  "processing_qaqc",
  "final_qaqc",
  "audit_logs",
  "documents",
  "batch_number_counters",
  "processing_run_number_counters",
  "customers",
  "customer_code_counters",
  "customer_purchase_order_status_history",
  "email_messages",
  "email_provider_connections",
  "email_attachments",
  "email_po_candidates",
  "inventory_allocations",
  "fulfilment_number_counters",
];

const requiredRelationships = [
  ["purchase_orders", "vendors"],
  ["purchase_order_items", "purchase_orders"],
  ["goods_receipts", "purchase_orders"],
  ["goods_receipt_items", "goods_receipts"],
  ["batches", "goods_receipts"],
  ["processing_runs", "batches"],
  ["inventory_items", "batches"],
  ["inventory_movements", "inventory_items"],
  ["customer_purchase_order_items", "customer_purchase_orders"],
  ["fulfilments", "customer_purchase_orders"],
  ["fulfilment_items", "fulfilments"],
  ["fulfilment_items", "inventory_items"],
  ["fulfilment_items", "batches"],
  ["incoming_qaqc", "goods_receipts"],
  ["processing_qaqc", "processing_runs"],
  ["final_qaqc", "customer_purchase_orders"],
  ["customer_purchase_order_status_history", "customer_purchase_orders"],
  ["email_messages", "customer_purchase_orders"],
  ["email_attachments", "email_messages"],
  ["email_po_candidates", "email_messages"],
  ["email_po_candidates", "customers"],
  ["inventory_allocations", "customer_purchase_order_items"],
  ["inventory_allocations", "inventory_items"],
  ["inventory_allocations", "batches"],
  ["inventory_allocations", "fulfilments"],
];

const requiredFunctions = [
  "next_fulfilment_number",
  "allocate_inventory_to_customer_po",
  "release_inventory_allocation",
  "create_fulfilment_from_allocations",
  "record_final_qaqc",
  "dispatch_fulfilment",
  "cancel_customer_po_release_allocations",
  "cancel_fulfilment",
  "freeze_eligible_inventory",
];

let combined = "";
const issues = [];

for (const file of files) {
  const fullPath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(fullPath, "utf8");
  combined += `\n${sql}\n`;

  const opens = (sql.match(/\(/g) || []).length;
  const closes = (sql.match(/\)/g) || []).length;
  if (opens !== closes) {
    issues.push(`${file}: unbalanced parentheses (${opens} open / ${closes} close)`);
  }

  if (!/enable row level security/i.test(sql)) {
    issues.push(`${file}: expected RLS enablement`);
  }
}

for (const table of requiredTables) {
  const pattern = new RegExp(`create table public\\.${table}\\b`, "i");
  if (!pattern.test(combined)) {
    issues.push(`Missing table: public.${table}`);
  }
}

for (const [from, to] of requiredRelationships) {
  const pattern = new RegExp(
    `create table public\\.${from}[\\s\\S]*?references public\\.${to}\\b`,
    "i",
  );
  if (!pattern.test(combined)) {
    issues.push(`Missing FK relationship: ${from} → ${to}`);
  }
}

if (!/batch_number text not null/i.test(combined) || !/batches_batch_number_unique/i.test(combined)) {
  issues.push("batches.batch_number must be unique");
}

if (!/previous_quantity/i.test(combined) || !/new_quantity/i.test(combined)) {
  issues.push("inventory_movements must store previous_quantity and new_quantity");
}

if (!/on delete restrict/i.test(combined)) {
  issues.push("Expected operational foreign keys to use ON DELETE RESTRICT");
}

if (!/create or replace function public\.complete_receiving_workflow/i.test(combined)) {
  issues.push("Missing complete_receiving_workflow RPC");
}

if (!/create or replace function public\.next_batch_number/i.test(combined)) {
  issues.push("Missing next_batch_number helper");
}

if (!/create or replace function public\.create_customer_purchase_order/i.test(combined)) {
  issues.push("Missing create_customer_purchase_order RPC");
}

for (const fn of requiredFunctions) {
  if (!new RegExp(`create or replace function public\\.${fn}\\b`, "i").test(combined)) {
    issues.push(`Missing function: public.${fn}`);
  }
}

if (!/reserved_quantity numeric\(14, 3\) not null default 0/i.test(combined)) {
  issues.push("inventory_items.reserved_quantity must be numeric(14, 3) not null default 0");
}

if (!/create table public\.customers\b/i.test(combined)) {
  issues.push("Missing customers table");
}

if (issues.length > 0) {
  console.error("Migration validation failed:\n" + issues.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${files.length} migrations and ${requiredTables.length} tables.`);
