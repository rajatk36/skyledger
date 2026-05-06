import mongoose from "mongoose";

const reportHeaderSchema = new mongoose.Schema(
  {
    agencyName: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    gstin: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const userSettingsSchema = new mongoose.Schema(
  {
    ownerUid: { type: String, required: true, trim: true, unique: true, index: true },
    reportHeader: { type: reportHeaderSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const UserSettings = mongoose.model("UserSettings", userSettingsSchema);
