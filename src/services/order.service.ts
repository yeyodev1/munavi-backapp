import { CustomError } from "../errors/customError.error";
import { Counter } from "../models/counter.model";
import { IOrder, Order, ORDER_STATUSES, OrderStatus, PAYMENT_METHODS } from "../models/order.model";
import { escapeRegex, paginated, parsePagination } from "../utils/pagination";
import {
  isObjectId,
  isValidEmail,
  normalizeDocumentId,
  normalizeEcuadorPhone,
} from "../utils/validation";
import { incrementUsage } from "./coupon.service";
import { applyStock, restoreStock } from "./inventory.service";
import * as orderEmails from "./orderEmails.service";
import {
  assertPayphoneConfigured,
  buildPayphoneBox,
  confirmTransaction,
  newClientTransactionId,
  PAYPHONE_APPROVED,
  PAYPHONE_CANCELED,
} from "./payphone.service";
import { buildQuote, parsePaymentMethod } from "./pricing.service";
import { getSettings } from "./settings.service";

const INITIAL_STATUS: Record<IOrder["paymentMethod"], OrderStatus> = {
  card: "pending_payment",
  transfer: "awaiting_transfer",
  cash_on_delivery: "confirmed",
};

// Estados en los que la mercadería ya está comprometida con el cliente.
const STOCK_HOLDING_STATUSES: OrderStatus[] = [
  "paid",
  "awaiting_transfer",
  "confirmed",
  "shipped",
  "delivered",
];
const RETRYABLE_STATUSES: OrderStatus[] = ["pending_payment", "payment_failed"];

/** Lo que puede ver el cliente: sin notas internas ni la respuesta cruda de Payphone. */
export function toPublic(order: IOrder) {
  const { adminNotes, payphone, ...rest } = order;
  return {
    ...rest,
    payphone: {
      transactionId: payphone?.transactionId ?? null,
      statusCode: payphone?.statusCode ?? null,
      authorizationCode: payphone?.authorizationCode ?? null,
    },
  };
}

async function nextOrderNumber(): Promise<string> {
  const counter = await Counter.findOneAndUpdate(
    { _id: "order" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  ).lean();
  return `MUN-${String(counter!.seq).padStart(6, "0")}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseCustomer(raw: any): IOrder["customer"] {
  const name = text(raw?.name);
  const email = text(raw?.email).toLowerCase();
  if (name.length < 3) throw new CustomError("Escribe tu nombre completo", 400);
  if (!isValidEmail(email)) throw new CustomError("Escribe un correo válido", 400);
  const phone = normalizeEcuadorPhone(text(raw?.phone));
  if (!phone) throw new CustomError("Escribe un teléfono válido de 10 dígitos", 400);
  const documentId = normalizeDocumentId(text(raw?.documentId));
  if (!documentId)
    throw new CustomError("Escribe una cédula (10 dígitos) o RUC (13 dígitos) válido", 400);
  return { name, email, phone, documentId };
}

function parseAddress(raw: any): IOrder["shippingAddress"] {
  const province = text(raw?.province);
  const city = text(raw?.city);
  const address = text(raw?.address);
  if (!province) throw new CustomError("Elige tu provincia", 400);
  if (!city) throw new CustomError("Escribe tu ciudad", 400);
  if (address.length < 5) throw new CustomError("Escribe tu dirección de entrega", 400);
  return { province, city, address, reference: text(raw?.reference) };
}

export async function quote(body: any) {
  return buildQuote({
    items: body?.items,
    paymentMethod: body?.paymentMethod,
    couponCode: body?.couponCode,
  });
}

export async function createOrder(body: any) {
  const paymentMethod = parsePaymentMethod(body?.paymentMethod);
  // Antes de validar nada: si la tarjeta no está lista, no tiene sentido seguir.
  if (paymentMethod === "card") assertPayphoneConfigured();

  const customer = parseCustomer(body?.customer);
  const shippingAddress = parseAddress(body?.shippingAddress);
  const q = await buildQuote({ items: body?.items, paymentMethod, couponCode: body?.couponCode });

  const orderNumber = await nextOrderNumber();
  const created = await Order.create({
    orderNumber,
    customer,
    shippingAddress,
    items: q.items.map(({ productId, ...rest }) => ({ product: productId, ...rest })),
    paymentMethod,
    couponCode: q.coupon?.code ?? null,
    subtotal: q.subtotal,
    volumeDiscount: q.volumeDiscount,
    couponDiscount: q.couponDiscount,
    shipping: q.shipping,
    total: q.total,
    status: INITIAL_STATUS[paymentMethod],
    clientTransactionId: newClientTransactionId(orderNumber),
  });

  // La tarjeta descuenta stock recién cuando Payphone aprueba el pago.
  if (paymentMethod !== "card") await applyStock(created._id);
  if (q.coupon) await incrementUsage(q.coupon.code);

  const order = (await Order.findById(created._id).lean<IOrder>())!;
  const settings = await getSettings();

  if (paymentMethod !== "card") {
    await Promise.all([
      orderEmails.sendOrderReceived(order, settings),
      orderEmails.sendAdminNewOrder(order, settings),
    ]);
  }

  return {
    order: toPublic(order),
    payphone: paymentMethod === "card" ? buildPayphoneBox(order) : null,
    bankTransferInfo: paymentMethod === "transfer" ? settings.bankTransferInfo : null,
  };
}

/**
 * Confirma el pago con Payphone. Idempotente: la página de respuesta puede
 * recargarse o llamarse dos veces y el stock y los correos salen una sola vez,
 * porque el cambio de estado se hace con una condición atómica.
 */
export async function confirmPayment(body: any) {
  const id = Number(body?.id);
  const clientTransactionId = text(body?.clientTransactionId);
  if (!Number.isInteger(id) || id <= 0 || !clientTransactionId) {
    throw new CustomError("Faltan los datos de la transacción", 400);
  }

  const order = await Order.findOne({ clientTransactionId }).lean<IOrder>();
  if (!order) throw new CustomError("Pedido no encontrado", 404);

  const alreadyProcessed =
    !RETRYABLE_STATUSES.includes(order.status) ||
    (order.status === "payment_failed" && order.payphone?.transactionId === id);
  if (alreadyProcessed) return { order: toPublic(order) };

  const data = await confirmTransaction(id, clientTransactionId);
  const payphone = {
    transactionId: typeof data.transactionId === "number" ? data.transactionId : id,
    statusCode: typeof data.statusCode === "number" ? data.statusCode : null,
    authorizationCode: data.authorizationCode ? String(data.authorizationCode) : null,
    response: data,
  };

  const approved = data.statusCode === PAYPHONE_APPROVED;
  const amountMatches = data.amount === order.total;
  const pending = { _id: order._id, clientTransactionId, status: { $in: RETRYABLE_STATUSES } };

  if (approved && amountMatches) {
    const updated = await Order.findOneAndUpdate(
      pending,
      { $set: { status: "paid", payphone } },
      { new: true },
    ).lean<IOrder>();
    if (updated) {
      await applyStock(updated._id);
      const settings = await getSettings();
      await Promise.all([
        orderEmails.sendPaymentApproved(updated),
        orderEmails.sendAdminNewOrder(updated, settings),
      ]);
    }
  } else if (approved) {
    // Payphone cobró otro monto: no se despacha, se avisa a la tienda para revisarlo a mano.
    const note = `Payphone aprobó ${data.amount} centavos pero el pedido es de ${order.total}. Revisar antes de despachar.`;
    const updated = await Order.findOneAndUpdate(
      pending,
      {
        $set: {
          status: "payment_failed",
          payphone,
          adminNotes: [order.adminNotes, note].filter(Boolean).join("\n"),
        },
      },
      { new: true },
    ).lean<IOrder>();
    if (updated) await orderEmails.sendAdminNewOrder(updated, await getSettings(), note);
  } else if (data.statusCode === PAYPHONE_CANCELED) {
    const updated = await Order.findOneAndUpdate(
      pending,
      { $set: { status: "payment_failed", payphone } },
      { new: true },
    ).lean<IOrder>();
    if (updated) await orderEmails.sendPaymentFailed(updated);
  } else {
    await Order.updateOne(pending, { $set: { payphone } });
  }

  const fresh = (await Order.findById(order._id).lean<IOrder>())!;
  return { order: toPublic(fresh) };
}

async function findByNumberAndEmail(orderNumber: unknown, email: unknown): Promise<IOrder> {
  const number = text(orderNumber).toUpperCase();
  const mail = text(email).toLowerCase();
  if (!number || !mail) throw new CustomError("Escribe tu número de pedido y tu correo", 400);
  const order = await Order.findOne({ orderNumber: number, "customer.email": mail }).lean<IOrder>();
  // Mismo mensaje exista o no el número: no sirve para adivinar pedidos ajenos.
  if (!order) throw new CustomError("No encontramos un pedido con esos datos", 404);
  return order;
}

export async function lookupOrder(query: any) {
  return toPublic(await findByNumberAndEmail(query?.orderNumber, query?.email));
}

/** Nuevo intento de pago con tarjeta: un clientTransactionId nuevo por intento. */
export async function retryPayment(orderNumber: string, body: any) {
  const order = await findByNumberAndEmail(orderNumber, body?.email);
  if (order.paymentMethod !== "card" || !RETRYABLE_STATUSES.includes(order.status)) {
    throw new CustomError("Este pedido ya no admite reintentos de pago", 409);
  }
  assertPayphoneConfigured();

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: { $in: RETRYABLE_STATUSES } },
    {
      $set: {
        status: "pending_payment",
        clientTransactionId: newClientTransactionId(order.orderNumber),
        payphone: {
          transactionId: null,
          statusCode: null,
          authorizationCode: null,
          response: null,
        },
      },
    },
    { new: true },
  ).lean<IOrder>();
  if (!updated) throw new CustomError("Este pedido ya no admite reintentos de pago", 409);

  return { order: toPublic(updated), payphone: buildPayphoneBox(updated) };
}

// --- Administración ---

export async function listOrders(query: any) {
  const pagination = parsePagination(query, 20);
  const filter: Record<string, unknown> = {};

  if (ORDER_STATUSES.includes(query?.status)) filter.status = query.status;
  if (PAYMENT_METHODS.includes(query?.paymentMethod)) filter.paymentMethod = query.paymentMethod;
  if (query?.q && String(query.q).trim()) {
    const rx = { $regex: escapeRegex(String(query.q).trim()), $options: "i" };
    filter.$or = [
      { orderNumber: rx },
      { "customer.name": rx },
      { "customer.email": rx },
      { "customer.phone": rx },
    ];
  }

  const [items, total] = await Promise.all([
    Order.find(filter)
      .select("-payphone.response")
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  return paginated(items, total, pagination);
}

export async function getOrder(id: string) {
  if (!isObjectId(id)) throw new CustomError("Pedido no encontrado", 404);
  const order = await Order.findById(id).lean<IOrder>();
  if (!order) throw new CustomError("Pedido no encontrado", 404);
  return order;
}

export async function updateOrder(id: string, body: any) {
  const order = await getOrder(id);
  const update: Record<string, unknown> = {};

  if (body?.status !== undefined) {
    if (!ORDER_STATUSES.includes(body.status))
      throw new CustomError("Estado de pedido no válido", 400);
    update.status = body.status;
  }
  if (body?.trackingUrl !== undefined) {
    const url = text(body.trackingUrl);
    if (url && !/^https?:\/\//i.test(url))
      throw new CustomError("El enlace de rastreo debe empezar con http:// o https://", 400);
    update.trackingUrl = url || null;
  }
  if (body?.adminNotes !== undefined) update.adminNotes = String(body.adminNotes ?? "");

  const updated = (await Order.findByIdAndUpdate(
    id,
    { $set: update },
    { new: true },
  ).lean<IOrder>())!;

  // El inventario sigue al estado: se repone al cancelar y se descuenta si una
  // orden vuelve (o llega a mano) a un estado comprometido.
  if (updated.status === "canceled") await restoreStock(updated._id);
  else if (STOCK_HOLDING_STATUSES.includes(updated.status)) await applyStock(updated._id);

  if (updated.status === "shipped" && order.status !== "shipped") {
    await orderEmails.sendOrderShipped(updated);
  }

  return getOrder(id);
}
