import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    ownerUid: { type: String, required: true, trim: true, index: true },
    pnr: { type: String, required: true, trim: true, uppercase: true },
    bookingDate: { type: String, required: true },
    travelDate: { type: String, required: true },
    passengerName: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    airline: { type: String, required: true },
    flightNo: { type: String, default: "" },
    from: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    to: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    departure: { type: String, default: "" },
    arrival: { type: String, default: "" },
    baseFare: { type: Number, required: true },
    taxes: { type: Number, default: 0 },
    agencyFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["confirmed", "cancelled", "refunded", "pending"], default: "confirmed" },
    partyId: { type: String, default: "" },
    tags: { type: [String], default: [] },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

bookingSchema.index({ ownerUid: 1, pnr: 1 }, { unique: true });

export const Booking = mongoose.model("Booking", bookingSchema);
