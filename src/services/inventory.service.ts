import { IOrder, Order } from "../models/order.model";
import { Product } from "../models/product.model";

type StockLine = Pick<IOrder["items"][number], "product" | "variantSlug" | "quantity">;

async function adjust(items: StockLine[], sign: 1 | -1): Promise<void> {
  await Promise.all(
    items.map((item) =>
      Product.updateOne(
        { _id: item.product },
        { $inc: { "variants.$[v].stock": sign * item.quantity } },
        // stock null = sin control de inventario: no se toca.
        { arrayFilters: [{ "v.slug": item.variantSlug, "v.stock": { $ne: null } }] },
      ),
    ),
  );
}

/**
 * Descuenta el inventario de la orden una sola vez. La marca stockApplied se
 * cambia de forma atómica, así dos confirmaciones simultáneas no descuentan
 * dos veces.
 */
export async function applyStock(orderId: IOrder["_id"]): Promise<void> {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, stockApplied: false },
    { $set: { stockApplied: true } },
    { new: true },
  ).lean<IOrder>();
  if (!order) return;
  await adjust(order.items, -1);
}

/** Repone el inventario si la orden lo había descontado. */
export async function restoreStock(orderId: IOrder["_id"]): Promise<void> {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, stockApplied: true },
    { $set: { stockApplied: false } },
    { new: true },
  ).lean<IOrder>();
  if (!order) return;
  await adjust(order.items, 1);
}
