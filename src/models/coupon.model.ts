import mongoose, { Schema, Types } from "mongoose";

export interface ICoupon {
  _id: Types.ObjectId;
  code: string;
  percent: number;
  isActive: boolean;
  usageCount: number;
  expiresAt: Date | null;
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
  },
  { timestamps: true },
);

export const Coupon =
  (mongoose.models.Coupon as mongoose.Model<ICoupon>) ||
  mongoose.model<ICoupon>("Coupon", couponSchema);
