import { Router } from "express";
import { UserSettings } from "../models/UserSettings.js";

const router = Router();

function normalizeReportHeader(body) {
  const src = body && typeof body === "object" ? body : {};
  return {
    agencyName: String(src.agencyName || "").trim(),
    address: String(src.address || "").trim(),
    phone: String(src.phone || "").trim(),
    email: String(src.email || "").trim(),
    gstin: String(src.gstin || "").trim(),
  };
}

router.get("/report-header", async (req, res) => {
  const settings = await UserSettings.findOne({ ownerUid: req.ownerUid }).lean();
  res.json({ data: normalizeReportHeader(settings?.reportHeader) });
});

router.put("/report-header", async (req, res) => {
  try {
    const reportHeader = normalizeReportHeader(req.body);
    const updated = await UserSettings.findOneAndUpdate(
      { ownerUid: req.ownerUid },
      { ownerUid: req.ownerUid, reportHeader },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    res.json({ data: normalizeReportHeader(updated?.reportHeader) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
