import { Order } from "../models/order.model";
import { Product } from "../models/product.model";

// Ecuador continental no tiene horario de verano: UTC-5 fijo.
const ECUADOR_OFFSET_MS = 5 * 60 * 60 * 1000;

function startOfTodayEcuador(now = new Date()): Date {
  const local = new Date(now.getTime() - ECUADOR_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + ECUADOR_OFFSET_MS);
}

function startOfMonthEcuador(now = new Date()): Date {
  const local = new Date(now.getTime() - ECUADOR_OFFSET_MS);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return new Date(start + ECUADOR_OFFSET_MS);
}

// Solo cuenta como venta lo que ya está pagado o comprometido (contra entrega).
const REVENUE_STATUSES = ["paid", "confirmed", "shipped", "delivered"];
const NOT_AN_ORDER_YET = ["pending_payment", "payment_failed", "canceled"];

export async function getStats() {
  const [ordersToday, revenue, pendingTransfers, toShip, productsPublished] = await Promise.all([
    Order.countDocuments({
      createdAt: { $gte: startOfTodayEcuador() },
      status: { $nin: NOT_AN_ORDER_YET },
    }),
    Order.aggregate<{ total: number }>([
      { $match: { createdAt: { $gte: startOfMonthEcuador() }, status: { $in: REVENUE_STATUSES } } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    Order.countDocuments({ status: "awaiting_transfer" }),
    Order.countDocuments({ status: { $in: ["paid", "confirmed"] } }),
    Product.countDocuments({ isPublished: true }),
  ]);

  return {
    ordersToday,
    revenueMonth: revenue[0]?.total ?? 0,
    pendingTransfers,
    toShip,
    productsPublished,
  };
}
