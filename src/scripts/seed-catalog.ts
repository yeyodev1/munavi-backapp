/**
 * Seed script — carga el catálogo de Munavi desde src/scripts/data/catalog.json.
 *
 * Idempotente: categorías y productos se buscan por slug y solo se crean si no
 * existen. Un producto existente no se toca (Nathalie puede haberlo editado
 * desde el panel) salvo con --force.
 *
 * Uso:
 *   pnpm seed:catalog
 *   pnpm seed:catalog --force
 *   pnpm seed:catalog --images-dir /ruta/a/munavi-frontapp/public
 *   pnpm seed:catalog --publish-with-prices precios.json
 *   pnpm seed:catalog --migrate-images
 *
 * Imágenes: con Cloudinary configurado se suben a "munavi/products/<slug>";
 * sin Cloudinary se guarda la ruta relativa "/products/<slug>/<archivo>.webp",
 * que sirve el frontend desde su carpeta public/.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { env } from "../config/env";
import { Category } from "../models/category.model";
import { IImage } from "../models/image.schema";
import { IPrices, IVariant, Product } from "../models/product.model";
import { isCloudinaryConfigured, uploadImage } from "../services/cloudinary.service";

interface NutritionInfo {
  servingSize?: string | null;
  servingsPerContainer?: number | string | null;
  energy?: string | null;
  energyFromFat?: string | null;
  rows?: (string | null)[][];
  footnote?: string | null;
}

interface CatalogVariant {
  name: string;
  slug: string;
  image: string | null;
}

interface CatalogProduct {
  slug: string;
  name: string;
  categorySlug: string;
  presentation: string | null;
  shortDescription: string | null;
  description?: string | null;
  benefits: string[] | null;
  usage: string | null;
  ingredients: string | null;
  nutritionInfo: NutritionInfo | string | null;
  warnings: string | null;
  images: string[];
  variants: CatalogVariant[];
}

const CATEGORIES = [
  {
    slug: "colagenos",
    name: "Colágenos",
    description: "Colágeno hidrolizado para tu piel, cabello, uñas y articulaciones.",
  },
  {
    slug: "vitaminas-y-minerales",
    name: "Vitaminas y minerales",
    description: "Vitaminas y minerales esenciales para tu bienestar de todos los días.",
  },
  {
    slug: "digestivos-y-detox",
    name: "Digestivos y detox",
    description: "Fibra y apoyo hepático para una digestión ligera.",
  },
  {
    slug: "ninos",
    name: "Niños",
    description: "Suplementos pensados para los más pequeños de la casa.",
  },
  {
    slug: "salud-hormonal",
    name: "Salud hormonal",
    description: "Apoyo natural para el equilibrio hormonal femenino.",
  },
  {
    slug: "inmunidad",
    name: "Inmunidad",
    description: "Refuerza tus defensas con calostro, propóleo y vitaminas.",
  },
  {
    slug: "deporte",
    name: "Deporte",
    description: "Rendimiento y recuperación para tu entrenamiento.",
  },
  {
    slug: "cuidado-corporal",
    name: "Cuidado corporal",
    description: "Productos de uso tópico para cuidar tu cuerpo.",
  },
];

const CATALOG_PATH = path.resolve(__dirname, "data", "catalog.json");
// Funciona desde src/scripts y desde dist/scripts: ambos quedan dos niveles bajo la raíz del repo.
const DEFAULT_IMAGES_DIR = path.resolve(__dirname, "..", "..", "..", "munavi-frontapp", "public");

interface Options {
  force: boolean;
  imagesDir: string;
  pricesFile: string | null;
  migrateImages: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    force: false,
    imagesDir: DEFAULT_IMAGES_DIR,
    pricesFile: null,
    migrateImages: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Falta el valor de ${arg}`);
      return value;
    };

    if (arg === "--force") options.force = true;
    else if (arg === "--migrate-images") options.migrateImages = true;
    else if (arg === "--images-dir") options.imagesDir = path.resolve(next());
    else if (arg.startsWith("--images-dir=")) options.imagesDir = path.resolve(arg.split("=")[1]);
    else if (arg === "--publish-with-prices") options.pricesFile = path.resolve(next());
    else if (arg.startsWith("--publish-with-prices="))
      options.pricesFile = path.resolve(arg.split("=")[1]);
    else throw new Error(`Argumento desconocido: ${arg}`);
  }

  return options;
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

// El modelo guarda la tabla nutricional como texto libre (el panel la edita así).
function nutritionToText(info: NutritionInfo | string | null): string {
  if (!info) return "";
  if (typeof info === "string") return info;

  const lines: string[] = [];
  if (info.servingSize) lines.push(`Porción: ${info.servingSize}`);
  if (info.servingsPerContainer != null)
    lines.push(`Porciones por envase: ${info.servingsPerContainer}`);
  if (info.energy) lines.push(`Energía: ${info.energy}`);
  if (info.energyFromFat) lines.push(`Energía de grasa: ${info.energyFromFat}`);
  for (const [label, amount, daily] of info.rows ?? []) {
    if (!label) continue;
    const value = [amount, daily ? `(${daily} VD)` : ""].filter(Boolean).join(" ");
    lines.push(`${label}: ${value}`.trim());
  }
  if (info.footnote) lines.push("", info.footnote);
  return lines.join("\n");
}

/** "products/<slug>/<archivo>.webp" → ruta absoluta en el public del frontend. */
function localPath(imagesDir: string, relative: string): string {
  return path.join(imagesDir, relative.replace(/^\/+/, ""));
}

class ImageResolver {
  private cache = new Map<string, IImage>();
  readonly useCloudinary = isCloudinaryConfigured();
  uploads = 0;

  constructor(private imagesDir: string) {}

  async resolve(relative: string, productSlug: string): Promise<IImage> {
    const normalized = relative.replace(/^\/+/, "");
    const cached = this.cache.get(normalized);
    if (cached) return cached;

    let image: IImage;
    if (this.useCloudinary) {
      const absolute = localPath(this.imagesDir, normalized);
      if (!fs.existsSync(absolute)) throw new Error(`No existe la imagen ${absolute}`);
      image = await uploadImage(absolute, `munavi/products/${productSlug}`);
      this.uploads++;
    } else {
      image = { url: `/${normalized}`, publicId: "" };
    }

    this.cache.set(normalized, image);
    return image;
  }
}

async function seedCategories(): Promise<Map<string, mongoose.Types.ObjectId>> {
  const ids = new Map<string, mongoose.Types.ObjectId>();

  for (const [index, data] of CATEGORIES.entries()) {
    const existing = await Category.findOne({ slug: data.slug });
    if (existing) {
      console.log(`  · Categoría ya existía: ${data.slug}`);
      ids.set(data.slug, existing._id);
      continue;
    }
    const created = await Category.create({ ...data, order: index, isActive: true });
    console.log(`  ✔ Categoría creada: ${data.slug}`);
    ids.set(data.slug, created._id);
  }

  return ids;
}

async function buildContent(
  item: CatalogProduct,
  order: number,
  categoryId: mongoose.Types.ObjectId,
  resolver: ImageResolver,
) {
  const images: IImage[] = [];
  for (const relative of item.images) images.push(await resolver.resolve(relative, item.slug));

  const variants: IVariant[] = [];
  for (const variant of item.variants) {
    variants.push({
      name: variant.name,
      slug: variant.slug,
      image: variant.image ? await resolver.resolve(variant.image, item.slug) : null,
      stock: null,
      isActive: true,
    });
  }

  return {
    name: item.name,
    slug: item.slug,
    category: categoryId,
    shortDescription: text(item.shortDescription),
    description: text(item.description),
    presentation: text(item.presentation),
    usage: text(item.usage),
    ingredients: text(item.ingredients),
    nutritionInfo: nutritionToText(item.nutritionInfo),
    warnings: text(item.warnings),
    benefits: Array.isArray(item.benefits) ? item.benefits : [],
    images,
    variants,
    order,
  };
}

async function seedProducts(
  catalog: CatalogProduct[],
  categories: Map<string, mongoose.Types.ObjectId>,
  resolver: ImageResolver,
  force: boolean,
) {
  const stats = { created: 0, updated: 0, skipped: 0 };

  for (const [order, item] of catalog.entries()) {
    const categoryId = categories.get(item.categorySlug);
    if (!categoryId)
      throw new Error(`Categoría desconocida "${item.categorySlug}" en ${item.slug}`);

    const existing = await Product.findOne({ slug: item.slug });

    if (existing && !force) {
      console.log(`  · Producto ya existía (sin cambios): ${item.slug}`);
      stats.skipped++;
      continue;
    }

    const content = await buildContent(item, order, categoryId, resolver);

    if (existing) {
      // --force pisa el contenido del catálogo pero respeta precios y publicación del panel.
      existing.set(content);
      await existing.save();
      console.log(`  ↻ Producto sobrescrito (--force): ${item.slug}`);
      stats.updated++;
      continue;
    }

    await Product.create({
      ...content,
      prices: { card: 0, transfer: 0, cashOnDelivery: 0 },
      compareAtPrice: null,
      volumeDiscounts: [],
      isFeatured: false,
      isBestSeller: false,
      // Sin precios todavía: se publica después con --publish-with-prices.
      isPublished: false,
    });
    console.log(`  ✔ Producto creado: ${item.slug}`);
    stats.created++;
  }

  return stats;
}

function isValidCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

async function publishWithPrices(file: string) {
  if (!fs.existsSync(file)) throw new Error(`No existe el archivo de precios ${file}`);
  const prices = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Partial<IPrices>>;

  for (const [slug, value] of Object.entries(prices)) {
    if (
      !isValidCents(value.card) ||
      !isValidCents(value.transfer) ||
      !isValidCents(value.cashOnDelivery)
    ) {
      console.log(`  ✖ Precios inválidos para ${slug} (enteros en centavos ≥ 0): se omite`);
      continue;
    }
    const result = await Product.updateOne(
      { slug },
      {
        $set: {
          prices: {
            card: value.card,
            transfer: value.transfer,
            cashOnDelivery: value.cashOnDelivery,
          },
          isPublished: true,
        },
      },
    );
    if (result.matchedCount === 0) console.log(`  ✖ No existe el producto ${slug}: se omite`);
    else console.log(`  ✔ Precios actualizados y publicado: ${slug}`);
  }
}

function isLocalImage(image: IImage | null | undefined): image is IImage {
  return !!image && !image.publicId && image.url.startsWith("/products/");
}

async function migrateImages(resolver: ImageResolver) {
  if (!resolver.useCloudinary) {
    throw new Error("Cloudinary no está configurado: no se pueden migrar las imágenes");
  }

  const products = await Product.find({
    $or: [
      { images: { $elemMatch: { publicId: "", url: /^\/products\// } } },
      { "variants.image.url": /^\/products\// },
    ],
  });

  if (products.length === 0) {
    console.log("  · No hay imágenes locales por migrar");
    return;
  }

  for (const product of products) {
    let migrated = 0;

    const images: IImage[] = [];
    for (const image of product.images) {
      if (isLocalImage(image)) {
        images.push(await resolver.resolve(image.url, product.slug));
        migrated++;
      } else images.push(image);
    }

    const variants: IVariant[] = [];
    for (const variant of product.variants) {
      if (isLocalImage(variant.image)) {
        variants.push({
          ...variant,
          image: await resolver.resolve(variant.image.url, product.slug),
        });
        migrated++;
      } else variants.push(variant);
    }

    if (migrated === 0) continue;
    product.set({ images, variants });
    await product.save();
    console.log(`  ✔ ${product.slug}: ${migrated} imágenes migradas a Cloudinary`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as CatalogProduct[];
  const resolver = new ImageResolver(options.imagesDir);

  console.log(
    resolver.useCloudinary
      ? `Imágenes: Cloudinary (origen ${options.imagesDir})`
      : "Imágenes: locales (/products/...), Cloudinary no está configurado",
  );

  console.log("Conectando a MongoDB...");
  await mongoose.connect(env.DB_URI);

  console.log("Categorías:");
  const categories = await seedCategories();

  console.log(`Productos (${catalog.length} en el catálogo):`);
  const stats = await seedProducts(catalog, categories, resolver, options.force);
  console.log(
    `  Resumen: ${stats.created} creados, ${stats.updated} sobrescritos, ${stats.skipped} ya existían`,
  );

  if (options.pricesFile) {
    console.log(`Precios desde ${options.pricesFile}:`);
    await publishWithPrices(options.pricesFile);
  }

  if (options.migrateImages) {
    console.log("Migración de imágenes locales a Cloudinary:");
    await migrateImages(resolver);
  }

  if (resolver.useCloudinary) console.log(`Subidas a Cloudinary: ${resolver.uploads}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("✖ Falló el seed del catálogo:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
