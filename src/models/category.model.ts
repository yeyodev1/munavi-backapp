import mongoose, { Schema, Types } from "mongoose";
import { IImage, imageSchema } from "./image.schema";

export interface ICategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  image: IImage | null;
  order: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    description: { type: String, default: "" },
    image: { type: imageSchema, default: null },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Category =
  (mongoose.models.Category as mongoose.Model<ICategory>) ||
  mongoose.model<ICategory>("Category", categorySchema);
