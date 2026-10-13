import mongoose, { Schema, Types } from "mongoose";
import { IImage, imageSchema } from "./image.schema";

export interface IHeroSlide {
  title: string;
  subtitle: string;
  image: IImage | null;
  // Versión vertical para celular; sin ella el celular recorta la imagen de escritorio.
  mobileImage: IImage | null;
  ctaLabel: string;
  ctaTo: string;
}

export interface IVolumeTier {
  minQty: number;
  percent: number;
}

export interface ICommunityPhoto {
  image: IImage | null;
  link: string;
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
  // "Compra más, ahorra más": tramos por unidades de todo el pedido, combinando productos.
  volumePromo: {
    isActive: boolean;
    tiers: IVolumeTier[];
  };
  communityPhotos: ICommunityPhoto[];
  notifyEmail: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const heroSlideSchema = new Schema<IHeroSlide>(
  {
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    image: { type: imageSchema, default: null },
    mobileImage: { type: imageSchema, default: null },
    ctaLabel: { type: String, default: "" },
    ctaTo: { type: String, default: "" },
  },
  { _id: false },
);

const volumeTierSchema = new Schema<IVolumeTier>(
  {
    minQty: { type: Number, required: true, min: 1 },
    percent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false },
);

const communityPhotoSchema = new Schema<ICommunityPhoto>(
  {
    image: { type: imageSchema, default: null },
    link: { type: String, default: "" },
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
    volumePromo: {
      // Apagado hasta que Munavi defina los porcentajes.
      isActive: { type: Boolean, default: false },
      tiers: { type: [volumeTierSchema], default: [] },
    },
    communityPhotos: { type: [communityPhotoSchema], default: [] },
    notifyEmail: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Settings =
  (mongoose.models.Settings as mongoose.Model<ISettings>) ||
  mongoose.model<ISettings>("Settings", settingsSchema);
