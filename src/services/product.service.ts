import { CustomError } from "../errors/customError.error";
import { Category } from "../models/category.model";
import { IProduct, IVariant, Product } from "../models/product.model";
import { escapeRegex, paginated, parsePagination } from "../utils/pagination";
import { slugify } from "../utils/slugify";
import { isObjectId } from "../utils/validation";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function image(value: any) {
  if (!value || typeof value !== "object" || !value.url) return null;
  return { url: String(value.url), publicId: String(value.publicId ?? "") };
}

function cents(value: unknown, label: string): number {
  const n = Number(value);
  if (value === null || value === "" || !Number.isFinite(n) || n < 0) {
    throw new CustomError(`El precio ${label} no es válido`, 400);
  }
  return Math.round(n);
}

function parseVariants(raw: unknown): IVariant[] {
  // Un producto sin sabores igual necesita una variante para el carrito.
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ name: "Único", slug: "unico", image: null, stock: null, isActive: true }];
  }

  const seen = new Set<string>();
  return raw.map((v: any) => {
    const name = text(v?.name);
    if (!name) throw new CustomError("Cada sabor necesita un nombre", 400);
    const slug = text(v?.slug) ? slugify(text(v.slug)) : slugify(name);
    if (!slug) throw new CustomError(`El sabor "${name}" no genera un enlace válido`, 400);
    if (seen.has(slug)) throw new CustomError(`El sabor "${name}" está repetido`, 400);
    seen.add(slug);

    let stock: number | null = null;
    if (v?.stock !== null && v?.stock !== undefined && v?.stock !== "") {
      const n = Number(v.stock);
      if (!Number.isInteger(n) || n < 0) {
        throw new CustomError(`El stock de "${name}" debe ser un número entero de 0 o más`, 400);
      }
      stock = n;
    }

    return {
      name,
      slug,
      image: image(v?.image),
      stock,
      isActive: v?.isActive === undefined ? true : Boolean(v.isActive),
    };
  });
}

function parseVolumeDiscounts(raw: unknown) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw))
    throw new CustomError("Los descuentos por volumen deben ser una lista", 400);

  const tiers = raw.map((t: any) => {
    const minQty = Number(t?.minQty);
    const percent = Number(t?.percent);
    if (!Number.isInteger(minQty) || minQty < 1) {
      throw new CustomError(
        "La cantidad mínima de cada descuento debe ser un entero de 1 o más",
        400,
      );
    }
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw new CustomError("El porcentaje de cada descuento debe estar entre 1 y 100", 400);
    }
    return { minQty, percent };
  });

  if (new Set(tiers.map((t) => t.minQty)).size !== tiers.length) {
    throw new CustomError("Hay dos descuentos por volumen con la misma cantidad mínima", 400);
  }
  return tiers.sort((a, b) => a.minQty - b.minQty);
}

async function parseInput(body: any, partial: boolean): Promise<Partial<IProduct>> {
  const data: Record<string, unknown> = {};
  const has = (key: string) => !partial || body?.[key] !== undefined;

  if (has("name")) {
    const name = text(body?.name);
    if (!name) throw new CustomError("Escribe el nombre del producto", 400);
    data.name = name;
  }
  if (body?.slug !== undefined && text(body.slug)) data.slug = slugify(text(body.slug));

  if (has("category")) {
    const category = String(body?.category ?? "");
    if (!isObjectId(category) || !(await Category.exists({ _id: category }))) {
      throw new CustomError("Elige una categoría válida", 400);
    }
    data.category = category;
  }

  for (const key of [
    "shortDescription",
    "description",
    "presentation",
    "usage",
    "ingredients",
    "nutritionInfo",
    "warnings",
  ]) {
    if (body?.[key] !== undefined) data[key] = text(body[key]);
  }

  if (body?.benefits !== undefined) {
    if (!Array.isArray(body.benefits))
      throw new CustomError("Los beneficios deben ser una lista", 400);
    data.benefits = body.benefits.map(text).filter(Boolean);
  }

  if (body?.images !== undefined) {
    if (!Array.isArray(body.images)) throw new CustomError("Las imágenes deben ser una lista", 400);
    data.images = body.images.map(image).filter(Boolean);
  }

  if (has("variants")) data.variants = parseVariants(body?.variants);

  if (has("prices")) {
    const p = body?.prices ?? {};
    data.prices = {
      card: cents(p.card, "con tarjeta"),
      transfer: cents(p.transfer, "por transferencia"),
      cashOnDelivery: cents(p.cashOnDelivery, "contra entrega"),
    };
  }

  if (body?.compareAtPrice !== undefined) {
    data.compareAtPrice =
      body.compareAtPrice === null || body.compareAtPrice === ""
        ? null
        : cents(body.compareAtPrice, "tachado");
  }

  if (body?.volumeDiscounts !== undefined)
    data.volumeDiscounts = parseVolumeDiscounts(body.volumeDiscounts);

  for (const key of ["isFeatured", "isBestSeller", "isPublished"]) {
    if (body?.[key] !== undefined) data[key] = Boolean(body[key]);
  }
  if (body?.order !== undefined) data.order = Number(body.order) || 0;

  return data as Partial<IProduct>;
}

/** Slug libre: si el automático ya existe, agrega -2, -3… */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  for (let i = 2; ; i++) {
    const filter: Record<string, unknown> = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    if (!(await Product.exists(filter))) return candidate;
    candidate = `${base}-${i}`;
  }
}

export async function listProducts(query: any) {
  const pagination = parsePagination(query, 20);
  const filter: Record<string, unknown> = {};

  if (query?.q && String(query.q).trim()) {
    filter.name = { $regex: escapeRegex(String(query.q).trim()), $options: "i" };
  }
  if (query?.category) {
    const value = String(query.category);
    if (isObjectId(value)) filter.category = value;
    else {
      const category = await Category.findOne({ slug: value }).select("_id").lean();
      if (!category) return paginated([], 0, pagination);
      filter.category = category._id;
    }
  }

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ order: 1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("category", "name slug")
      .lean(),
    Product.countDocuments(filter),
  ]);
  return paginated(items, total, pagination);
}

export async function getProduct(id: string) {
  if (!isObjectId(id)) throw new CustomError("Producto no encontrado", 404);
  const product = await Product.findById(id).populate("category", "name slug").lean();
  if (!product) throw new CustomError("Producto no encontrado", 404);
  return product;
}

export async function createProduct(body: any) {
  const data = await parseInput(body, false);
  if (data.slug) {
    if (await Product.exists({ slug: data.slug })) {
      throw new CustomError("Ya existe un producto con ese enlace", 409);
    }
  } else {
    const base = slugify(data.name!);
    if (!base) throw new CustomError("El nombre del producto no genera un enlace válido", 400);
    data.slug = await uniqueSlug(base);
  }
  const product = await Product.create(data);
  return getProduct(product._id.toString());
}

export async function updateProduct(id: string, body: any) {
  if (!isObjectId(id)) throw new CustomError("Producto no encontrado", 404);
  const data = await parseInput(body, true);
  if (data.slug && (await Product.exists({ slug: data.slug, _id: { $ne: id } }))) {
    throw new CustomError("Ya existe un producto con ese enlace", 409);
  }
  const updated = await Product.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, runValidators: true },
  );
  if (!updated) throw new CustomError("Producto no encontrado", 404);
  return getProduct(id);
}

export async function deleteProduct(id: string): Promise<void> {
  if (!isObjectId(id)) throw new CustomError("Producto no encontrado", 404);
  const deleted = await Product.findByIdAndDelete(id);
  if (!deleted) throw new CustomError("Producto no encontrado", 404);
}
