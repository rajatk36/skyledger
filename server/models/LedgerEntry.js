import mongoose from "mongoose";

const ledgerEntrySchema = new mongoose.Schema(
  {
    ownerUid: { type: String, required: true, trim: true, index: true },
    id: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    partyId: { type: String, required: true, trim: true },
    type: { type: String, enum: ["invoice", "receipt"], required: true },
    refId: { type: String, default: "" },
    description: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    mode: { type: String, default: "" },
    notes: { type: String, default: "" },
    senderAccount: { type: String, default: "" },
    receiverAccount: { type: String, default: "" },
    referenceNo: { type: String, default: "" },
    transactionTime: { type: String, default: "" },
  },
  { timestamps: true }
);

ledgerEntrySchema.index({ ownerUid: 1, id: 1 }, { unique: true });

export const LedgerEntry = mongoose.model("LedgerEntry", ledgerEntrySchema);
