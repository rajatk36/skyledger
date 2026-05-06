import { Router } from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const apiKey = process.env.GEMINI_API_KEY ;
const model = process.env.GEMINI_MODEL ;

function parseGeminiJson(responseText) {
  const raw = responseText?.trim() || "{}";
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function isQuotaError(error) {
  const statusCode = error?.status || error?.code;
  return (
    statusCode === 429 ||
    error?.message?.includes("RESOURCE_EXHAUSTED") ||
    error?.message?.includes("quota")
  );
}

router.post("/", upload.single("ticket"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Please upload a ticket image." });
  }

  if (!apiKey) {
    return res.status(500).json({ message: "Gemini API key missing on server." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString("base64"),
        mimeType: req.file.mimetype || "image/jpeg",
      },
    };

    const prompt = `Extract flight booking details from this ticket image.
Return only strict JSON with keys:
pnr, passengerName, airline, flightNo, from, to, travelDate, departure, arrival, baseFare, taxes, total.
Use IATA code for from/to, YYYY-MM-DD for date, HH:MM for times, numbers for fares.
Missing values should be empty string or 0.`;

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
    });

    let parsed;
    try {
      parsed = parseGeminiJson(response.text);
    } catch {
      return res.status(502).json({
        message: "Gemini returned non-JSON output. Please retry with a clearer ticket image.",
      });
    }
    res.json({ data: parsed });
  } catch (error) {
    if (isQuotaError(error)) {
      return res.status(429).json({
        message:
          "Gemini quota exceeded for this API key/project. Check billing/quota or switch to a key/project with available quota.",
      });
    }

    res.status(500).json({ message: `Ticket scan failed: ${error.message}` });
  }
});

router.post("/payment", upload.single("payment"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Please upload a payment screenshot." });
  }

  if (!apiKey) {
    return res.status(500).json({ message: "Gemini API key missing on server." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString("base64"),
        mimeType: req.file.mimetype || "image/jpeg",
      },
    };

    const prompt = `Extract payment/transaction details from this screenshot.
Return only strict JSON with keys:
amount, senderAccount, receiverAccount, referenceNo, mode, date, transactionTime, description.
Rules:
- amount must be number (no commas)
- mode must be one of Cash, IMPS, NEFT, RTGS, UPI, Cheque, Card
- date in YYYY-MM-DD
- transactionTime in HH:MM
- missing values should be empty string or 0`;

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
    });

    let parsed;
    try {
      parsed = parseGeminiJson(response.text);
    } catch {
      return res.status(502).json({
        message: "Gemini returned non-JSON output. Please retry with a clearer screenshot.",
      });
    }

    res.json({ data: parsed });
  } catch (error) {
    if (isQuotaError(error)) {
      return res.status(429).json({
        message:
          "Gemini quota exceeded for this API key/project. Check billing/quota or switch to a key/project with available quota.",
      });
    }

    res.status(500).json({ message: `Payment scan failed: ${error.message}` });
  }
});

export default router;
