import { Router } from "express";
import { Booking } from "../models/Booking.js";

const router = Router();

function stripOwner(body) {
  if (!body || typeof body !== "object") return {};
  const { ownerUid: _o, ...rest } = body;
  return rest;
}

router.get("/", async (req, res) => {
  const bookings = await Booking.find({ ownerUid: req.ownerUid }).sort({ bookingDate: -1, createdAt: -1 });
  res.json({ data: bookings });
});

router.post("/", async (req, res) => {
  try {
    const booking = await Booking.create({ ...stripOwner(req.body), ownerUid: req.ownerUid });
    res.status(201).json({ data: booking });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await Booking.findOneAndUpdate(
      { _id: req.params.id, ownerUid: req.ownerUid },
      { ...stripOwner(req.body), ownerUid: req.ownerUid },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.json({ data: updated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  const deleted = await Booking.findOneAndDelete({ _id: req.params.id, ownerUid: req.ownerUid });
  if (!deleted) {
    return res.status(404).json({ message: "Booking not found" });
  }
  res.json({ message: "Deleted" });
});

router.post("/seed", async (req, res) => {
  const incoming = Array.isArray(req.body?.data) ? req.body.data : [];
  if (incoming.length === 0) {
    return res.status(400).json({ message: "Seed data missing" });
  }
  const existing = await Booking.countDocuments({ ownerUid: req.ownerUid });
  if (existing > 0) {
    const bookings = await Booking.find({ ownerUid: req.ownerUid }).sort({ bookingDate: -1 });
    return res.json({ data: bookings });
  }
  const cleaned = incoming.map(({ id, _id, ownerUid, ...booking }) => ({
    ...booking,
    ownerUid: req.ownerUid,
  }));
  const seeded = await Booking.insertMany(cleaned);
  res.status(201).json({ data: seeded });
});

export default router;
