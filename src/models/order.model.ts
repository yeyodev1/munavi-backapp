import mongoose, { Schema, Types } from "mongoose";

export const PAYMENT_METHODS = ["card", "transfer", "cash_on_delivery"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "awaiting_transfer",
  "confirmed",
  "shipped",
  "delivered",
  "canceled",
  "payment_failed",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface IOrderItem {
  product: Types.ObjectId;
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

export interface IOrder {
  _id: Types.ObjectId;
  orderNumber: string;
  customer: { name: string; email: string; phone: string; documentId: string };
  shippingAddress: { province: string; city: string; address: string; reference: string };
  items: IOrderItem[];
  paymentMethod: PaymentMethod;
  couponCode: string | null;
  subtotal: number;
  volumeDiscount: number;
  couponDiscount: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  clientTransactionId: string;
  payphone: {
    transactionId: number | null;
    statusCode: number | null;
    authorizationCode: string | null;
    response: unknown;
  };
  trackingUrl: string | null;
  adminNotes: string;
  stockApplied: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    variantSlug: { type: String, required: true },
    variantName: { type: String, required: true },
    image: { type: String, default: null },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    lineSubtotal: { type: Number, required: true },
    volumeDiscountPercent: { type: Number, default: 0 },
    lineDiscount: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true, lowercase: true, trim: true, index: true },
      phone: { type: String, required: true },
      documentId: { type: String, required: true },
    },
    shippingAddress: {
      province: { type: String, required: true },
      city: { type: String, required: true },
      address: { type: String, required: true },
      reference: { type: String, default: "" },
    },
    items: { type: [orderItemSchema], default: [] },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    couponCode: { type: String, default: null },
    subtotal: { type: Number, required: true },
    volumeDiscount: { type: Number, default: 0 },
    couponDiscount: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true, index: true },
    clientTransactionId: { type: String, required: true, unique: true, index: true },
    payphone: {
      transactionId: { type: Number, default: null },
      statusCode: { type: Number, default: null },
      authorizationCode: { type: String, default: null },
      response: { type: Schema.Types.Mixed, default: null },
    },
    trackingUrl: { type: String, default: null },
    adminNotes: { type: String, default: "" },
    stockApplied: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Order =
  (mongoose.models.Order as mongoose.Model<IOrder>) || mongoose.model<IOrder>("Order", orderSchema);
