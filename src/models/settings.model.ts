import mongoose, { Schema, Types } from "mongoose";
import { IImage, imageSchema } from "./image.schema";

export interface IHeroSlide {
  title: string;
  subtitle: string;
  image: IImage | null;
  ctaLabel: string;
  ctaTo: string;
}

export interface ISettings {
  _id: Types.ObjectId;
  // Clave fija con índice único: garantiza un solo documento aunque dos
  // peticiones lo creen a la vez.
  key: string;
  shipping: {
    flatRate: number;
    freeShippingThreshold: number | null;
    note: string;
  };
  whatsapp: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  announcement: string;
  subscribeCouponCode: string;
  bankTransferInfo: string;
  heroSlides: IHeroSlide[];
  notifyEmail: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const heroSlideSchema = new Schema<IHeroSlide>(
  {
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    image: { type: imageSchema, default: null },
    ctaLabel: { type: String, default: "" },
    ctaTo: { type: String, default: "" },
  },
  { _id: false },
);

const settingsSchema = new Schema<ISettings>(
  {
    key: { type: String, required: true, unique: true, default: "main" },
    shipping: {
      flatRate: { type: Number, default: 400 },
      freeShippingThreshold: { type: Number, default: 5000 },
      note: { type: String, default: "Envíos a todo Ecuador con Servientrega" },
    },
    whatsapp: { type: String, default: "" },
    instagram: { type: String, default: "" },
    facebook: { type: String, default: "" },
    tiktok: { type: String, default: "" },
    announcement: { type: String, default: "Envío gratis desde $50" },
    subscribeCouponCode: { type: String, default: "TEQUIEROVIDA20" },
    bankTransferInfo: { type: String, default: "" },
    heroSlides: { type: [heroSlideSchema], default: [] },
    notifyEmail: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Settings =
  (mongoose.models.Settings as mongoose.Model<ISettings>) ||
  mongoose.model<ISettings>("Settings", settingsSchema);
