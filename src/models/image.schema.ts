import { Schema } from "mongoose";

export interface IImage {
  url: string;
  publicId: string;
}

// Subdocumento sin _id: las imágenes se reemplazan enteras, nunca se editan por id.
export const imageSchema = new Schema<IImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
  },
  { _id: false },
);
