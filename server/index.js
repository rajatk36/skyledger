import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { attachOwnerUid } from "./middleware/attachOwner.js";
import bookingsRouter from "./routes/bookings.js";
import ledgerRouter from "./routes/ledger.js";
import partiesRouter from "./routes/parties.js";
import scanRouter from "./routes/scan.js";
import settingsRouter from "./routes/settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load server/.env even when `node ../server/index.js` is run from the client folder (cwd ≠ server).
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.local"), override: true });

const hasFirebaseCreds =
  Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) ||
  Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()) ||
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
if (!hasFirebaseCreds) {
  console.warn(
    "[server] No Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_PATH to your downloaded .json key file (or FIREBASE_SERVICE_ACCOUNT_JSON) in server/.env. Signed-in API routes return 503 until this is set."
  );
}

const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/bookings", attachOwnerUid, bookingsRouter);
app.use("/api/ledger", attachOwnerUid, ledgerRouter);
app.use("/api/parties", attachOwnerUid, partiesRouter);
app.use("/api/scan-ticket", attachOwnerUid, scanRouter);
app.use("/api/settings", attachOwnerUid, settingsRouter);

async function startServer() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in environment.");
  }
  await mongoose.connect(mongoUri);
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Unable to start server", error);
  process.exit(1);
});
