import mongoose, { Schema, Types } from "mongoose";

export interface ICoupon {
  _id: Types.ObjectId;
  code: string;
  percent: number;
  isActive: boolean;
  usageCount: number;
  expiresAt: Date | null;
  // BIENVENIDO20: solo la primera compra de cada correo.
  firstPurchaseOnly: boolean;
  // No se acumula: descuenta solo productos a precio regular (sin pack).
  regularPriceOnly: boolean;
  // Compra mínima en centavos; null = sin mínimo.
  minSubtotal: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
    percent: { type: Number, required: true, min: 1, max: 100 },
    isActive: { type: Boolean, default: true },
    usageCount: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    firstPurchaseOnly: { type: Boolean, default: false },
    regularPriceOnly: { type: Boolean, default: false },
    minSubtotal: { type: Number, default: null, min: 0 },
  },
  { timestamps: true },
);

export const Coupon =
  (mongoose.models.Coupon as mongoose.Model<ICoupon>) ||
  mongoose.model<ICoupon>("Coupon", couponSchema);
