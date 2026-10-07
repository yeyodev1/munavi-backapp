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

export interface Quote {
  items: QuoteItem[];
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

/** Tramo con mayor minQty que no supere la cantidad. */
export function volumePercentFor(
  product: Pick<IProduct, "volumeDiscounts">,
  quantity: number,
): number {
  let best: { minQty: number; percent: number } | null = null;
  for (const tier of product.volumeDiscounts ?? []) {
    if (tier.minQty <= quantity && (!best || tier.minQty > best.minQty)) best = tier;
  }
  return best ? best.percent : 0;
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

  const items: QuoteItem[] = cart.map((line) => {
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
    const lineSubtotal = unitPrice * line.quantity;
    const volumeDiscountPercent = volumePercentFor(product, line.quantity);
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

  const settings = await getSettings();
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
