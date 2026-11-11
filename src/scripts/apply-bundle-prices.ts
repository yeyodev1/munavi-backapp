/**
 * Carga "Compra más, ahorra más" por producto (src/scripts/data/bundle-prices.json):
 * el precio final de los packs de 2 a 6 unidades tal como los mandó Munavi el
 * 5 nov 2026. Reemplaza los packs del producto.
 *
 * La tabla también trae el P.V.P. de 1 unidad; solo se escribe con --pvp porque
 * dos productos no coinciden con el catálogo.
 *
 * Uso:
 *   pnpm apply:bundle-prices --dry-run
 *   pnpm apply:bundle-prices [--pvp]
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { env } from "../config/env";
import { Product } from "../models/product.model";
import { parseBundlePrices } from "../services/product.service";

const DATA_PATH = path.resolve(__dirname, "data", "bundle-prices.json");
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const withPvp = argv.includes("--pvp");
  const unknown = argv.filter((arg) => arg !== "--dry-run" && arg !== "--pvp");
  if (unknown.length) throw new Error(`Argumento desconocido: ${unknown.join(" ")}`);

  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as Record<
    string,
    { pvp: number; bundles: { qty: number; total: number }[] }
  >;

  await mongoose.connect(env.DB_URI);

  for (const [slug, entry] of Object.entries(data)) {
    const product = await Product.findOne({ slug });
    if (!product) {
      console.log(`  ✖ No existe el producto ${slug}`);
      continue;
    }

    const changes: string[] = [];
    if (product.prices.card !== entry.pvp) {
      if (withPvp) {
        changes.push(`P.V.P. ${usd(product.prices.card)} → ${usd(entry.pvp)}`);
        product.prices = { card: entry.pvp, transfer: entry.pvp, cashOnDelivery: entry.pvp };
      } else {
        console.log(
          `  ! ${slug}: la tabla dice ${usd(entry.pvp)} y la tienda ${usd(product.prices.card)} (usa --pvp)`,
        );
      }
    }

    const bundles = parseBundlePrices(entry.bundles);
    // Un pack que no ahorra frente al precio regular confundiría al cliente.
    for (const b of bundles) {
      if (b.total >= product.prices.card * b.qty) {
        throw new Error(`${slug}: el pack de ${b.qty} (${usd(b.total)}) no ahorra nada`);
      }
    }
    if (JSON.stringify(product.toObject().bundlePrices ?? []) !== JSON.stringify(bundles)) {
      product.bundlePrices = bundles;
      changes.push(bundles.map((b) => `${b.qty}=${usd(b.total)}`).join(" "));
    }

    if (!changes.length) {
      console.log(`  · ${slug}: sin cambios`);
      continue;
    }
    if (!dryRun) await product.save();
    console.log(`  ✔ ${slug}: ${changes.join(" | ")}${dryRun ? " (simulado)" : ""}`);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Error cargando los precios por cantidad:", error);
  await mongoose.disconnect();
  process.exit(1);
});
