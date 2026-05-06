import { Router } from "express";
import { LedgerEntry } from "../models/LedgerEntry.js";

const router = Router();

function stripOwner(body) {
  if (!body || typeof body !== "object") return {};
  const { ownerUid: _o, ...rest } = body;
  return rest;
}

router.get("/", async (req, res) => {
  const entries = await LedgerEntry.find({ ownerUid: req.ownerUid }).sort({ date: -1, _id: -1 });
  res.json({ data: entries });
});

router.post("/", async (req, res) => {
  try {
    const entry = await LedgerEntry.create({ ...stripOwner(req.body), ownerUid: req.ownerUid });
    res.status(201).json({ data: entry });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await LedgerEntry.findOneAndUpdate(
      { id: req.params.id, ownerUid: req.ownerUid },
      { ...stripOwner(req.body), ownerUid: req.ownerUid },
      {
        returnDocument: "after",
        runValidators: true,
      }
    );
    if (!updated) {
      return res.status(404).json({ message: "Ledger entry not found" });
    }
    res.json({ data: updated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  const deleted = await LedgerEntry.findOneAndDelete({ id: req.params.id, ownerUid: req.ownerUid });
  if (!deleted) {
    return res.status(404).json({ message: "Ledger entry not found" });
  }
  res.json({ message: "Deleted" });
});

router.post("/seed", async (req, res) => {
  const incoming = Array.isArray(req.body?.data) ? req.body.data : [];
  if (incoming.length === 0) {
    return res.status(400).json({ message: "Seed data missing" });
  }
  const existing = await LedgerEntry.countDocuments({ ownerUid: req.ownerUid });
  if (existing > 0) {
    const entries = await LedgerEntry.find({ ownerUid: req.ownerUid }).sort({ date: -1, _id: -1 });
    return res.json({ data: entries });
  }
  const cleaned = incoming.map(({ _id, ownerUid, ...entry }) => ({
    ...entry,
    ownerUid: req.ownerUid,
  }));
  const seeded = await LedgerEntry.insertMany(cleaned);
  res.status(201).json({ data: seeded });
});

export default router;
