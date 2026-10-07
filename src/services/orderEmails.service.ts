import { env } from "../config/env";
import { IOrder } from "../models/order.model";
import { ISettings } from "../models/settings.model";
import { layout, sendEmail } from "./email.service";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2br(value: string): string {
  return esc(value).replace(/\n/g, "<br>");
}

const PAYMENT_LABEL: Record<IOrder["paymentMethod"], string> = {
  card: "Tarjeta",
  transfer: "Transferencia bancaria",
  cash_on_delivery: "Pago contra entrega",
};

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#518936;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(label)}</a></p>`;
}

function orderLink(order: IOrder): string {
  return `${env.FRONTEND_URL}/pedido/${encodeURIComponent(order.orderNumber)}?email=${encodeURIComponent(order.customer.email)}`;
}

function retryLink(order: IOrder): string {
  return `${env.FRONTEND_URL}/pago/reintentar?pedido=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(order.customer.email)}`;
}

function summary(order: IOrder): string {
  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:6px 0">${esc(i.productName)} — ${esc(i.variantName)} × ${i.quantity}</td>
        <td style="padding:6px 0;text-align:right">${money(i.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  const line = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 0;${bold ? "font-weight:bold" : ""}">${label}</td><td style="padding:4px 0;text-align:right;${bold ? "font-weight:bold" : ""}">${value}</td></tr>`;

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;margin:16px 0;font-size:14px">
    ${rows}
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
    ${line("Subtotal", money(order.subtotal))}
    ${order.volumeDiscount ? line("Descuento por volumen", `−${money(order.volumeDiscount)}`) : ""}
    ${order.couponDiscount ? line(`Cupón ${esc(order.couponCode)}`, `−${money(order.couponDiscount)}`) : ""}
    ${line("Envío", order.shipping ? money(order.shipping) : "Gratis")}
    ${line("Total", money(order.total), true)}
  </table>
  <p style="font-size:14px;color:#52525b">
    <strong>Envío a:</strong> ${esc(order.shippingAddress.address)}, ${esc(order.shippingAddress.city)}, ${esc(order.shippingAddress.province)}<br>
    <strong>Pago:</strong> ${PAYMENT_LABEL[order.paymentMethod]}
  </p>`;
}

function whatsappLink(settings: ISettings, order: IOrder): string | null {
  const phone = settings.whatsapp.replace(/\D/g, "");
  if (!phone) return null;
  const text = `Hola, envío el comprobante de mi pedido ${order.orderNumber}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** Pedido recibido: transferencia (con datos bancarios) o contra entrega. */
export async function sendOrderReceived(order: IOrder, settings: ISettings): Promise<void> {
  const hello = `<p>Hola ${esc(order.customer.name)}, recibimos tu pedido <strong>${order.orderNumber}</strong>.</p>`;
  let body: string;

  if (order.paymentMethod === "transfer") {
    const wa = whatsappLink(settings, order);
    body = `${hello}
      <p>Para confirmarlo, transfiere <strong>${money(order.total)}</strong> a esta cuenta:</p>
      <p style="background:#f3faf0;border-radius:12px;padding:16px">${nl2br(settings.bankTransferInfo || "Te enviaremos los datos bancarios en breve.")}</p>
      <p>Luego envíanos el comprobante por WhatsApp indicando tu número de pedido.</p>
      ${wa ? button(wa, "Enviar comprobante por WhatsApp") : ""}
      ${summary(order)}`;
  } else {
    body = `${hello}
      <p>Tu pedido está confirmado. Pagarás <strong>${money(order.total)}</strong> al recibirlo.</p>
      ${summary(order)}`;
  }

  await sendEmail(
    order.customer.email,
    `Recibimos tu pedido ${order.orderNumber}`,
    layout("¡Gracias por tu compra!", body + button(orderLink(order), "Ver mi pedido")),
  );
}

export async function sendPaymentApproved(order: IOrder): Promise<void> {
  const body = `<p>Hola ${esc(order.customer.name)}, tu pago de <strong>${money(order.total)}</strong> fue aprobado.</p>
    <p>Ya estamos preparando tu pedido <strong>${order.orderNumber}</strong>. Te avisaremos cuando salga.</p>
    ${summary(order)}
    ${button(orderLink(order), "Ver mi pedido")}`;
  await sendEmail(
    order.customer.email,
    `Pago aprobado — pedido ${order.orderNumber}`,
    layout("¡Pago aprobado!", body),
  );
}

export async function sendPaymentFailed(order: IOrder): Promise<void> {
  const body = `<p>Hola ${esc(order.customer.name)}, el pago de tu pedido <strong>${order.orderNumber}</strong> no se completó.</p>
    <p>No se hizo ningún cobro. Puedes intentarlo otra vez cuando quieras:</p>
    ${button(retryLink(order), "Reintentar el pago")}
    ${summary(order)}`;
  await sendEmail(
    order.customer.email,
    `No se completó el pago del pedido ${order.orderNumber}`,
    layout("Tu pago no se completó", body),
  );
}

export async function sendOrderShipped(order: IOrder): Promise<void> {
  const body = `<p>Hola ${esc(order.customer.name)}, tu pedido <strong>${order.orderNumber}</strong> ya está en camino.</p>
    ${order.trackingUrl ? `<p>Puedes seguir el envío aquí:</p>${button(order.trackingUrl, "Rastrear mi pedido")}` : ""}
    ${summary(order)}`;
  await sendEmail(
    order.customer.email,
    `Tu pedido ${order.orderNumber} va en camino`,
    layout("¡Tu pedido va en camino!", body),
  );
}

/** Aviso interno a la tienda. */
export async function sendAdminNewOrder(
  order: IOrder,
  settings: ISettings,
  note = "",
): Promise<void> {
  const to = settings.notifyEmail || env.ADMIN_NOTIFY_EMAIL;
  if (!to) return;
  const body = `<p>Nuevo pedido <strong>${order.orderNumber}</strong> por <strong>${money(order.total)}</strong>.</p>
    ${note ? `<p style="color:#b91c1c"><strong>${esc(note)}</strong></p>` : ""}
    <p>
      <strong>Cliente:</strong> ${esc(order.customer.name)}<br>
      <strong>Correo:</strong> ${esc(order.customer.email)}<br>
      <strong>Teléfono:</strong> ${esc(order.customer.phone)}<br>
      <strong>Cédula/RUC:</strong> ${esc(order.customer.documentId)}<br>
      <strong>Referencia:</strong> ${esc(order.shippingAddress.reference)}
    </p>
    ${summary(order)}
    ${button(`${env.FRONTEND_URL}/admin/pedidos/${order._id}`, "Ver en el panel")}`;
  await sendEmail(
    to,
    `Nuevo pedido ${order.orderNumber} — ${money(order.total)}`,
    layout("Nuevo pedido", body),
  );
}
