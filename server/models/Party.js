import mongoose from "mongoose";

const partySchema = new mongoose.Schema(
  {
    ownerUid: { type: String, required: true, trim: true, index: true },
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["agent", "corporate", "individual", "supplier"], default: "agent" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    city: { type: String, default: "" },
    gstin: { type: String, default: "" },
    creditLimit: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    createdAt: { type: String, default: () => new Date().toISOString().split("T")[0] },
  }
);

partySchema.index({ ownerUid: 1, id: 1 }, { unique: true });

export const Party = mongoose.model("Party", partySchema);
