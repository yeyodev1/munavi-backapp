import { CustomError } from "../errors/customError.error";
import { Coupon, ICoupon } from "../models/coupon.model";
import { escapeRegex, paginated, parsePagination } from "../utils/pagination";
import { isObjectId } from "../utils/validation";

export const INVALID_COUPON_MESSAGE = "El cupón no existe o ya no está vigente";

function normalizeCode(code: unknown): string {
  return String(code ?? "")
    .trim()
    .toUpperCase();
}

/** Cupón activo y sin vencer, o null. */
export async function findValidCoupon(code: unknown): Promise<ICoupon | null> {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const coupon = await Coupon.findOne({ code: normalized, isActive: true }).lean<ICoupon>();
  if (!coupon) return null;
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= Date.now()) return null;
  return coupon;
}

export async function validateCoupon(code: unknown): Promise<{ code: string; percent: number }> {
  const coupon = await findValidCoupon(code);
  if (!coupon) throw new CustomError(INVALID_COUPON_MESSAGE, 404);
  return { code: coupon.code, percent: coupon.percent };
}

export async function incrementUsage(code: string): Promise<void> {
  await Coupon.updateOne({ code }, { $inc: { usageCount: 1 } });
}

// --- Administración ---

function parseInput(body: any, partial: boolean) {
  const data: Partial<ICoupon> = {};

  if (!partial || body?.code !== undefined) {
    const code = normalizeCode(body?.code);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
      throw new CustomError("El código debe tener de 3 a 40 letras, números o guiones", 400);
    }
    data.code = code;
  }

  if (!partial || body?.percent !== undefined) {
    const percent = Number(body?.percent);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      throw new CustomError("El porcentaje debe ser un número entero entre 1 y 100", 400);
    }
    data.percent = percent;
  }

  if (body?.isActive !== undefined) data.isActive = Boolean(body.isActive);

  if (body?.expiresAt !== undefined) {
    if (body.expiresAt === null || body.expiresAt === "") {
      data.expiresAt = null;
    } else {
      const date = new Date(body.expiresAt);
      if (Number.isNaN(date.getTime()))
        throw new CustomError("La fecha de vencimiento no es válida", 400);
      data.expiresAt = date;
    }
  }

  return data;
}

export async function listCoupons(query: any) {
  const pagination = parsePagination(query, 50);
  const filter: Record<string, unknown> = {};
  if (query?.q) filter.code = { $regex: escapeRegex(String(query.q).trim()), $options: "i" };

  const [items, total] = await Promise.all([
    Coupon.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Coupon.countDocuments(filter),
  ]);
  return paginated(items, total, pagination);
}

export async function createCoupon(body: any) {
  const data = parseInput(body, false);
  const exists = await Coupon.exists({ code: data.code });
  if (exists) throw new CustomError("Ya existe un cupón con ese código", 409);
  const coupon = await Coupon.create(data);
  return coupon.toObject();
}

export async function updateCoupon(id: string, body: any) {
  if (!isObjectId(id)) throw new CustomError("Cupón no encontrado", 404);
  const data = parseInput(body, true);
  if (data.code) {
    const exists = await Coupon.exists({ code: data.code, _id: { $ne: id } });
    if (exists) throw new CustomError("Ya existe un cupón con ese código", 409);
  }
  const coupon = await Coupon.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
  if (!coupon) throw new CustomError("Cupón no encontrado", 404);
  return coupon;
}

export async function deleteCoupon(id: string): Promise<void> {
  if (!isObjectId(id)) throw new CustomError("Cupón no encontrado", 404);
  const deleted = await Coupon.findByIdAndDelete(id);
  if (!deleted) throw new CustomError("Cupón no encontrado", 404);
}
