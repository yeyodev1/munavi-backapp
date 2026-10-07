import mongoose, { Schema, Types } from "mongoose";
import { IImage, imageSchema } from "./image.schema";

export interface IVariant {
  name: string;
  slug: string;
  image: IImage | null;
  // null = sin control de inventario.
  stock: number | null;
  isActive: boolean;
}

export interface IPrices {
  card: number;
  transfer: number;
  cashOnDelivery: number;
}

export interface IVolumeDiscount {
  minQty: number;
  percent: number;
}

export interface IProduct {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  category: Types.ObjectId;
  shortDescription: string;
  description: string;
  presentation: string;
  usage: string;
  ingredients: string;
  nutritionInfo: string;
  warnings: string;
  benefits: string[];
  images: IImage[];
  variants: IVariant[];
  prices: IPrices;
  compareAtPrice: number | null;
  volumeDiscounts: IVolumeDiscount[];
  isFeatured: boolean;
  isBestSeller: boolean;
  isPublished: boolean;
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const variantSchema = new Schema<IVariant>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    image: { type: imageSchema, default: null },
    stock: { type: Number, default: null },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const pricesSchema = new Schema<IPrices>(
  {
    card: { type: Number, required: true, min: 0 },
    transfer: { type: Number, required: true, min: 0 },
    cashOnDelivery: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const volumeDiscountSchema = new Schema<IVolumeDiscount>(
  {
    minQty: { type: Number, required: true, min: 1 },
    percent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false },
);

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    shortDescription: { type: String, default: "" },
    description: { type: String, default: "" },
    presentation: { type: String, default: "" },
    usage: { type: String, default: "" },
    ingredients: { type: String, default: "" },
    nutritionInfo: { type: String, default: "" },
    warnings: { type: String, default: "" },
    benefits: { type: [String], default: [] },
    images: { type: [imageSchema], default: [] },
    variants: { type: [variantSchema], default: [] },
    prices: { type: pricesSchema, required: true },
    compareAtPrice: { type: Number, default: null },
    volumeDiscounts: { type: [volumeDiscountSchema], default: [] },
    isFeatured: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false, index: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Product =
  (mongoose.models.Product as mongoose.Model<IProduct>) ||
  mongoose.model<IProduct>("Product", productSchema);
