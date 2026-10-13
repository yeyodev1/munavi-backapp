import { Types } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { PAYMENT_METHODS, PaymentMethod } from "../models/order.model";
import { IPrices, IProduct, Product } from "../models/product.model";
import { findValidCoupon, INVALID_COUPON_MESSAGE } from "./coupon.service";
import { getSettings } from "./settings.service";

export const MIN_QTY = 1;
export const MAX_QTY = 50;

export interface CartItemInput {
  productId: string;
  variantSlug: string;
  quantity: number;
}

export interface QuoteItem {
  productId: string;
  productName: string;
  variantSlug: string;
  variantName: string;
  image: string | null;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  volumeDiscountPercent: number;
  lineDiscount: number;
  lineTotal: number;
}

export interface VolumePromoStatus {
  isActive: boolean;
  /** Unidades del pedido que cuentan para la promo (productos participantes). */
  units: number;
  /** Porcentaje alcanzado con esas unidades (0 si todavía no llega al primer nivel). */
  percent: number;
  /** Siguiente nivel y cuántas unidades faltan; null si ya está en el más alto. */
  next: { minQty: number; percent: number; unitsMissing: number } | null;
}

export interface Quote {
  items: QuoteItem[];
  volumePromo: VolumePromoStatus;
  subtotal: number;
  volumeDiscount: number;
  couponDiscount: number;
  coupon: { code: string; percent: number } | null;
  shipping: number;
  total: number;
  freeShippingThreshold: number | null;
  amountToFreeShipping: number | null;
}

const PRICE_KEY: Record<PaymentMethod, keyof IPrices> = {
  card: "card",
  transfer: "transfer",
  cash_on_delivery: "cashOnDelivery",
};

export function parsePaymentMethod(value: unknown): PaymentMethod {
  if (typeof value !== "string" || !PAYMENT_METHODS.includes(value as PaymentMethod)) {
    throw new CustomError("Elige un método de pago válido", 400);
  }
  return value as PaymentMethod;
}

/**
 * Normaliza el carrito: valida forma y cantidades, y junta líneas repetidas
 * (mismo producto y sabor) para que el descuento por volumen y el stock se
 * evalúen sobre la cantidad real.
 */
export function parseCartItems(raw: unknown): CartItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new CustomError("Tu carrito está vacío", 400);
  }

  const merged = new Map<string, CartItemInput>();
  for (const item of raw) {
    const productId = String(item?.productId ?? "");
    const variantSlug = String(item?.variantSlug ?? "").trim();
    const quantity = Number(item?.quantity);

    if (!Types.ObjectId.isValid(productId) || !/^[a-f0-9]{24}$/i.test(productId)) {
      throw new CustomError("Uno de los productos del carrito no está disponible", 400);
    }
    if (!variantSlug) throw new CustomError("Elige el sabor de cada producto", 400);
    if (!Number.isInteger(quantity) || quantity < MIN_QTY || quantity > MAX_QTY) {
      throw new CustomError(
        `La cantidad de cada producto debe estar entre ${MIN_QTY} y ${MAX_QTY}`,
        400,
      );
    }

    const key = `${productId}:${variantSlug}`;
    const prev = merged.get(key);
    if (prev) {
      prev.quantity += quantity;
      if (prev.quantity > MAX_QTY) {
        throw new CustomError(
          `La cantidad de cada producto debe estar entre ${MIN_QTY} y ${MAX_QTY}`,
          400,
        );
      }
    } else {
      merged.set(key, { productId, variantSlug, quantity });
    }
  }
  return [...merged.values()];
}

type Tier = { minQty: number; percent: number };

function bestTier(tiers: Tier[] | undefined, quantity: number): Tier | null {
  let best: Tier | null = null;
  for (const tier of tiers ?? []) {
    if (tier.minQty <= quantity && (!best || tier.minQty > best.minQty)) best = tier;
  }
  return best;
}

/** Tramo con mayor minQty que no supere la cantidad. */
export function volumePercentFor(
  product: Pick<IProduct, "volumeDiscounts">,
  quantity: number,
): number {
  return bestTier(product.volumeDiscounts, quantity)?.percent ?? 0;
}

/**
 * "Compra más, ahorra más": cuenta las unidades de todo el pedido (combinando
 * productos participantes) y devuelve el nivel alcanzado y el siguiente.
 */
export function volumePromoStatus(
  promo: { isActive: boolean; tiers: Tier[] } | undefined,
  units: number,
): VolumePromoStatus {
  const tiers = [...(promo?.tiers ?? [])].sort((a, b) => a.minQty - b.minQty);
  const isActive = Boolean(promo?.isActive) && tiers.length > 0;
  if (!isActive) return { isActive: false, units, percent: 0, next: null };

  const reached = bestTier(tiers, units);
  const upcoming = tiers.find((t) => t.minQty > units && t.percent > (reached?.percent ?? 0));
  return {
    isActive,
    units,
    percent: reached?.percent ?? 0,
    next: upcoming
      ? {
          minQty: upcoming.minQty,
          percent: upcoming.percent,
          unitsMissing: upcoming.minQty - units,
        }
      : null,
  };
}

/**
 * Cálculo único del dinero de un pedido. La cotización del carrito y la
 * creación de la orden pasan por aquí, así que lo que el cliente ve es lo que
 * se cobra.
 */
export async function buildQuote(input: {
  items: unknown;
  paymentMethod: unknown;
  couponCode?: unknown;
}): Promise<Quote> {
  const method = parsePaymentMethod(input.paymentMethod);
  const cart = parseCartItems(input.items);

  const ids = [...new Set(cart.map((i) => i.productId))];
  const products = await Product.find({ _id: { $in: ids } }).lean<IProduct[]>();
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const settings = await getSettings();

  const lines = cart.map((line) => {
    const product = byId.get(line.productId);
    if (!product || !product.isPublished) {
      throw new CustomError("Uno de los productos del carrito ya no está disponible", 400);
    }
    const variant = product.variants.find((v) => v.slug === line.variantSlug);
    if (!variant || !variant.isActive) {
      throw new CustomError(`El sabor elegido de ${product.name} ya no está disponible`, 400);
    }
    if (variant.stock !== null && variant.stock !== undefined && variant.stock < line.quantity) {
      throw new CustomError(
        variant.stock > 0
          ? `Solo quedan ${variant.stock} unidades de ${product.name} (${variant.name})`
          : `${product.name} (${variant.name}) está agotado`,
        400,
      );
    }

    const unitPrice = product.prices[PRICE_KEY[method]];
    // Hay productos publicados antes de tener precio; sin este corte saldría una orden en $0.
    if (!unitPrice || unitPrice <= 0) {
      throw new CustomError(
        `«${product.name}» todavía no tiene precio. Escríbenos por WhatsApp y te ayudamos.`,
        400,
      );
    }
    return { line, product, variant, unitPrice };
  });

  const promoUnits = lines.reduce(
    (sum, l) => sum + (l.product.inVolumePromo !== false ? l.line.quantity : 0),
    0,
  );
  const volumePromo = volumePromoStatus(settings.volumePromo, promoUnits);

  const items: QuoteItem[] = lines.map(({ line, product, variant, unitPrice }) => {
    const lineSubtotal = unitPrice * line.quantity;
    // No se acumulan: gana el mayor entre el descuento propio del producto y el del pedido.
    const orderPercent = product.inVolumePromo !== false ? volumePromo.percent : 0;
    const volumeDiscountPercent = Math.max(volumePercentFor(product, line.quantity), orderPercent);
    const lineDiscount = Math.round((lineSubtotal * volumeDiscountPercent) / 100);

    return {
      productId: product._id.toString(),
      productName: product.name,
      variantSlug: variant.slug,
      variantName: variant.name,
      image: variant.image?.url || product.images[0]?.url || null,
      quantity: line.quantity,
      unitPrice,
      lineSubtotal,
      volumeDiscountPercent,
      lineDiscount,
      lineTotal: lineSubtotal - lineDiscount,
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.lineSubtotal, 0);
  const volumeDiscount = items.reduce((sum, i) => sum + i.lineDiscount, 0);

  let coupon: Quote["coupon"] = null;
  let couponDiscount = 0;
  const rawCode = String(input.couponCode ?? "").trim();
  if (rawCode) {
    const found = await findValidCoupon(rawCode);
    if (!found) throw new CustomError(INVALID_COUPON_MESSAGE, 404);
    coupon = { code: found.code, percent: found.percent };
    couponDiscount = Math.round(((subtotal - volumeDiscount) * found.percent) / 100);
  }

  const { flatRate, freeShippingThreshold } = settings.shipping;
  const base = subtotal - volumeDiscount - couponDiscount;

  let shipping = flatRate;
  if (flatRate <= 0) shipping = 0;
  else if (
    freeShippingThreshold !== null &&
    freeShippingThreshold !== undefined &&
    base >= freeShippingThreshold
  ) {
    shipping = 0;
  }

  let amountToFreeShipping: number | null = null;
  if (flatRate <= 0) amountToFreeShipping = 0;
  else if (freeShippingThreshold !== null && freeShippingThreshold !== undefined) {
    amountToFreeShipping = Math.max(0, freeShippingThreshold - base);
  }

  return {
    items,
    volumePromo,
    subtotal,
    volumeDiscount,
    couponDiscount,
    coupon,
    shipping,
    total: base + shipping,
    freeShippingThreshold: freeShippingThreshold ?? null,
    amountToFreeShipping,
  };
}
