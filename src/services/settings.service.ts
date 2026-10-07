import { CustomError } from "../errors/customError.error";
import { Coupon } from "../models/coupon.model";
import { ISettings, Settings } from "../models/settings.model";

const SETTINGS_KEY = "main";
const DEFAULT_SUBSCRIBE_COUPON = "TEQUIEROVIDA20";
const DEFAULT_SUBSCRIBE_PERCENT = 20;

/**
 * Devuelve el documento único de ajustes; lo crea con los valores por defecto
 * la primera vez. En esa primera vez también siembra el cupón de suscripción
 * para que el formulario del home funcione desde el primer día.
 */
export async function getSettings(): Promise<ISettings> {
  const existing = await Settings.findOne({ key: SETTINGS_KEY }).lean<ISettings>();
  if (existing) return existing;

  try {
    await Settings.create({ key: SETTINGS_KEY });
  } catch (error: any) {
    // Otra petición lo creó en paralelo: basta con leerlo.
    if (error?.code !== 11000) throw error;
  }

  await Coupon.updateOne(
    { code: DEFAULT_SUBSCRIBE_COUPON },
    {
      $setOnInsert: {
        code: DEFAULT_SUBSCRIBE_COUPON,
        percent: DEFAULT_SUBSCRIBE_PERCENT,
        isActive: true,
      },
    },
    { upsert: true },
  );

  const created = await Settings.findOne({ key: SETTINGS_KEY }).lean<ISettings>();
  if (!created) throw new CustomError("No se pudieron cargar los ajustes de la tienda", 500);
  return created;
}

/** Lo que ve la tienda: sin el correo interno ni el código del cupón de suscripción. */
export async function getPublicSettings() {
  const { notifyEmail, subscribeCouponCode, key, ...rest } = await getSettings();
  return rest;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new CustomError(`El valor de ${field} no es válido`, 400);
  }
  return Math.round(n);
}

function image(value: any) {
  if (!value || typeof value !== "object" || !value.url) return null;
  return { url: String(value.url), publicId: String(value.publicId ?? "") };
}

/** Reemplaza solo los campos que llegan en el body. */
export async function updateSettings(body: any): Promise<ISettings> {
  const current = await getSettings();
  const update: Record<string, unknown> = {};

  if (body?.shipping !== undefined) {
    const s = body.shipping ?? {};
    const shipping = { ...current.shipping };
    if (s.flatRate !== undefined) shipping.flatRate = money(s.flatRate, "la tarifa de envío");
    if (s.freeShippingThreshold !== undefined) {
      shipping.freeShippingThreshold =
        s.freeShippingThreshold === null || s.freeShippingThreshold === ""
          ? null
          : money(s.freeShippingThreshold, "el monto para envío gratis");
    }
    if (s.note !== undefined) shipping.note = str(s.note);
    update.shipping = shipping;
  }

  for (const field of [
    "whatsapp",
    "instagram",
    "facebook",
    "tiktok",
    "announcement",
    "bankTransferInfo",
  ] as const) {
    if (body?.[field] !== undefined) update[field] = str(body[field]);
  }

  if (body?.subscribeCouponCode !== undefined) {
    update.subscribeCouponCode = str(body.subscribeCouponCode).toUpperCase();
  }

  if (body?.notifyEmail !== undefined) {
    const email = str(body.notifyEmail).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new CustomError("El correo de avisos no es válido", 400);
    }
    update.notifyEmail = email;
  }

  if (body?.heroSlides !== undefined) {
    if (!Array.isArray(body.heroSlides)) {
      throw new CustomError("Los banners del inicio deben ser una lista", 400);
    }
    update.heroSlides = body.heroSlides.map((slide: any) => ({
      title: str(slide?.title),
      subtitle: str(slide?.subtitle),
      image: image(slide?.image),
      ctaLabel: str(slide?.ctaLabel),
      ctaTo: str(slide?.ctaTo),
    }));
  }

  const updated = await Settings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: update },
    { new: true },
  ).lean<ISettings>();
  if (!updated) throw new CustomError("No se pudieron guardar los ajustes", 500);
  return updated;
}
