import mongoose, { Schema, Types } from "mongoose";

export const SUBSCRIBER_SOURCES = ["home", "footer", "checkout"] as const;
export type SubscriberSource = (typeof SUBSCRIBER_SOURCES)[number];

export interface ISubscriber {
  _id: Types.ObjectId;
  email: string;
  source: SubscriberSource;
  createdAt?: Date;
  updatedAt?: Date;
}

const subscriberSchema = new Schema<ISubscriber>(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    source: { type: String, enum: SUBSCRIBER_SOURCES, default: "home" },
  },
  { timestamps: true },
);

export const Subscriber =
  (mongoose.models.Subscriber as mongoose.Model<ISubscriber>) ||
  mongoose.model<ISubscriber>("Subscriber", subscriberSchema);
