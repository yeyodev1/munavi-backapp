import { CustomError } from "../errors/customError.error";
import { Subscriber, SUBSCRIBER_SOURCES, SubscriberSource } from "../models/subscriber.model";
import { escapeRegex, paginated, parsePagination } from "../utils/pagination";
import { isObjectId, isValidEmail } from "../utils/validation";
import { findValidCoupon } from "./coupon.service";
import { getSettings } from "./settings.service";

/**
 * Idempotente: suscribirse dos veces responde lo mismo, así el formulario no
 * le dice a nadie si un correo ya estaba en la lista.
 */
export async function subscribe(body: any) {
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  if (!isValidEmail(email)) throw new CustomError("Escribe un correo válido", 400);

  const source: SubscriberSource = SUBSCRIBER_SOURCES.includes(body?.source) ? body.source : "home";

  await Subscriber.updateOne({ email }, { $setOnInsert: { email, source } }, { upsert: true });

  const settings = await getSettings();
  const coupon = await findValidCoupon(settings.subscribeCouponCode);

  return {
    message: coupon
      ? `¡Gracias por suscribirte! Usa el cupón ${coupon.code} y obtén ${coupon.percent}% de descuento.`
      : "¡Gracias por suscribirte!",
    couponCode: coupon?.code ?? null,
    percent: coupon?.percent ?? null,
  };
}

function buildFilter(query: any) {
  const filter: Record<string, unknown> = {};
  if (query?.q && String(query.q).trim()) {
    filter.email = { $regex: escapeRegex(String(query.q).trim()), $options: "i" };
  }
  if (SUBSCRIBER_SOURCES.includes(query?.source)) filter.source = query.source;
  return filter;
}

export async function listSubscribers(query: any) {
  const pagination = parsePagination(query, 50);
  const filter = buildFilter(query);
  const [items, total] = await Promise.all([
    Subscriber.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Subscriber.countDocuments(filter),
  ]);
  return paginated(items, total, pagination);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function subscribersCsv(query: any): Promise<string> {
  const subscribers = await Subscriber.find(buildFilter(query)).sort({ createdAt: -1 }).lean();
  const rows = subscribers.map((s) =>
    [s.email, s.source, s.createdAt ? new Date(s.createdAt).toISOString() : ""]
      .map(csvCell)
      .join(","),
  );
  return ["email,source,createdAt", ...rows].join("\n");
}

export async function deleteSubscriber(id: string): Promise<void> {
  if (!isObjectId(id)) throw new CustomError("Suscriptor no encontrado", 404);
  const deleted = await Subscriber.findByIdAndDelete(id);
  if (!deleted) throw new CustomError("Suscriptor no encontrado", 404);
}
