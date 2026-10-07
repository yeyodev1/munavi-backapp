import { CustomError } from "../errors/customError.error";
import { Category, ICategory } from "../models/category.model";
import { Product } from "../models/product.model";
import { slugify } from "../utils/slugify";
import { isObjectId } from "../utils/validation";

function image(value: any) {
  if (!value || typeof value !== "object" || !value.url) return null;
  return { url: String(value.url), publicId: String(value.publicId ?? "") };
}

function parseInput(body: any, partial: boolean): Partial<ICategory> {
  const data: Partial<ICategory> = {};

  if (!partial || body?.name !== undefined) {
    const name = String(body?.name ?? "").trim();
    if (!name) throw new CustomError("Escribe el nombre de la categoría", 400);
    data.name = name;
  }
  if (body?.slug !== undefined && String(body.slug).trim()) data.slug = slugify(String(body.slug));
  if (body?.description !== undefined) data.description = String(body.description ?? "").trim();
  if (body?.image !== undefined) data.image = image(body.image);
  if (body?.order !== undefined) data.order = Number(body.order) || 0;
  if (body?.isActive !== undefined) data.isActive = Boolean(body.isActive);

  return data;
}

export async function listCategories() {
  const categories = await Category.find().sort({ order: 1, name: 1 }).lean();
  const counts = await Product.aggregate<{ _id: unknown; count: number }>([
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map((c) => ({ ...c, productCount: byId.get(c._id.toString()) ?? 0 }));
}

export async function createCategory(body: any) {
  const data = parseInput(body, false);
  data.slug = data.slug || slugify(data.name!);
  if (!data.slug)
    throw new CustomError("El nombre de la categoría no genera un enlace válido", 400);
  if (await Category.exists({ slug: data.slug })) {
    throw new CustomError("Ya existe una categoría con ese enlace", 409);
  }
  const category = await Category.create(data);
  return category.toObject();
}

export async function updateCategory(id: string, body: any) {
  if (!isObjectId(id)) throw new CustomError("Categoría no encontrada", 404);
  const data = parseInput(body, true);
  if (data.slug && (await Category.exists({ slug: data.slug, _id: { $ne: id } }))) {
    throw new CustomError("Ya existe una categoría con ese enlace", 409);
  }
  const category = await Category.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
  if (!category) throw new CustomError("Categoría no encontrada", 404);
  return category;
}

export async function deleteCategory(id: string): Promise<void> {
  if (!isObjectId(id)) throw new CustomError("Categoría no encontrada", 404);
  if (await Product.exists({ category: id })) {
    throw new CustomError("No se puede eliminar una categoría que tiene productos", 409);
  }
  const deleted = await Category.findByIdAndDelete(id);
  if (!deleted) throw new CustomError("Categoría no encontrada", 404);
}
