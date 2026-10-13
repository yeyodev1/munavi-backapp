/**
 * Aplica la ficha del catálogo impreso (src/scripts/data/catalog-sheet.json) a
 * los productos que ya existen: P.V.P., descripción, beneficios, modo de uso y
 * presentación. No toca imágenes, variantes, stock ni publicación.
 *
 * Idempotente y respetuoso con el panel:
 *  - Los precios solo se escriben si el producto sigue en $0 (sin --force).
 *  - Los textos solo se escriben si el campo está vacío o si viene --force.
 *  - El P.V.P. del catálogo va a los tres precios (tarjeta, transferencia y
 *    contra entrega); la diferencia entre métodos se ajusta desde el panel.
 *
 * Uso:
 *   pnpm apply:catalog-sheet
 *   pnpm apply:catalog-sheet --force
 *   pnpm apply:catalog-sheet --dry-run
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { env } from "../config/env";
import { Product } from "../models/product.model";

interface SheetEntry {
  pvp: number;
  shortDescription?: string | null;
  description?: string | null;
  benefits?: string[] | null;
  usage?: string | null;
  presentation?: string | null;
  ingredients?: string | null;
}

type TextField = "shortDescription" | "description" | "usage" | "presentation" | "ingredients";

const TEXT_FIELDS: TextField[] = [
  "shortDescription",
  "description",
  "usage",
  "presentation",
  "ingredients",
];

const SHEET_PATH = path.resolve(__dirname, "data", "catalog-sheet.json");

function isValidCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const dryRun = argv.includes("--dry-run");
  const unknown = argv.filter((arg) => arg !== "--force" && arg !== "--dry-run");
  if (unknown.length) throw new Error(`Argumento desconocido: ${unknown.join(" ")}`);

  const sheet = JSON.parse(fs.readFileSync(SHEET_PATH, "utf8")) as Record<string, SheetEntry>;

  console.log("Conectando a MongoDB...");
  await mongoose.connect(env.DB_URI);

  const stats = { updated: 0, unchanged: 0, missing: 0 };

  for (const [slug, entry] of Object.entries(sheet)) {
    const product = await Product.findOne({ slug });
    if (!product) {
      console.log(`  ✖ No existe el producto ${slug}: corre antes pnpm seed:catalog`);
      stats.missing++;
      continue;
    }

    const changes: string[] = [];

    if (!isValidCents(entry.pvp)) throw new Error(`P.V.P. inválido para ${slug}`);
    if (force || product.prices.card === 0) {
      const same =
        product.prices.card === entry.pvp &&
        product.prices.transfer === entry.pvp &&
        product.prices.cashOnDelivery === entry.pvp;
      if (!same) {
        product.prices = { card: entry.pvp, transfer: entry.pvp, cashOnDelivery: entry.pvp };
        changes.push(`precio $${(entry.pvp / 100).toFixed(2)}`);
      }
    }

    for (const field of TEXT_FIELDS) {
      const value = entry[field]?.trim();
      if (!value || product[field] === value) continue;
      if (!force && product[field]) continue;
      product[field] = value;
      changes.push(field);
    }

    const benefits = (entry.benefits ?? []).map((b) => b.trim()).filter(Boolean);
    if (
      benefits.length &&
      (force || product.benefits.length === 0) &&
      benefits.join("|") !== product.benefits.join("|")
    ) {
      product.benefits = benefits;
      changes.push("benefits");
    }

    if (changes.length === 0) {
      console.log(`  · ${slug}: sin cambios`);
      stats.unchanged++;
      continue;
    }

    if (!dryRun) await product.save();
    console.log(`  ✔ ${slug}: ${changes.join(", ")}${dryRun ? " (simulado)" : ""}`);
    stats.updated++;
  }

  console.log(
    `\nListo: ${stats.updated} actualizados, ${stats.unchanged} sin cambios, ${stats.missing} sin producto`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Error aplicando la ficha del catálogo:", error);
  await mongoose.disconnect();
  process.exit(1);
});
