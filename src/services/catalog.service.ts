import { CustomError } from "../errors/customError.error";
import { Category, ICategory } from "../models/category.model";
import { IProduct, Product } from "../models/product.model";
import { escapeRegex, paginated, parsePagination } from "../utils/pagination";

export async function listActiveCategories() {
  return Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
}

type PopulatedProduct = Omit<IProduct, "category"> & {
  category: Pick<ICategory, "name" | "slug"> | null;
};

/** Forma liviana para grillas: sin textos largos ni stock exacto. */
function toCard(p: PopulatedProduct) {
  return {
    _id: p._id,
    name: p.name,
    slug: p.slug,
    shortDescription: p.shortDescription,
    presentation: p.presentation,
    category: p.category ? { name: p.category.name, slug: p.category.slug } : null,
    image: p.images[0]?.url ?? null,
    variants: p.variants.map((v) => ({
      name: v.name,
      slug: v.slug,
      image: v.image,
      isActive: v.isActive,
      inStock: v.stock === null || v.stock === undefined || v.stock > 0,
    })),
    prices: p.prices,
    compareAtPrice: p.compareAtPrice,
    volumeDiscounts: p.volumeDiscounts,
    isFeatured: p.isFeatured,
    isBestSeller: p.isBestSeller,
  };
}

export async function listPublishedProducts(query: any) {
  const pagination = parsePagination(query, 24);
  const filter: Record<string, unknown> = { isPublished: true };

  if (query?.category) {
    const category = await Category.findOne({ slug: String(query.category) })
      .select("_id")
      .lean();
    if (!category) return paginated([], 0, pagination);
    filter.category = category._id;
  }
  if (query?.featured === "1" || query?.featured === "true") filter.isFeatured = true;
  if (query?.bestSeller === "1" || query?.bestSeller === "true") filter.isBestSeller = true;
  if (query?.q && String(query.q).trim()) {
    const rx = { $regex: escapeRegex(String(query.q).trim()), $options: "i" };
    filter.$or = [{ name: rx }, { shortDescription: rx }];
  }

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ order: 1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate("category", "name slug")
      .lean<PopulatedProduct[]>(),
    Product.countDocuments(filter),
  ]);

  return paginated(items.map(toCard), total, pagination);
}

export async function getPublishedProduct(slug: string) {
  const product = await Product.findOne({ slug, isPublished: true })
    .populate("category", "name slug")
    .lean();
  if (!product) throw new CustomError("Producto no encontrado", 404);
  return product;
}
