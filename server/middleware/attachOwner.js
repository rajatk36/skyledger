import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let initialized = false;

const serverRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveCredentialPath(p) {
  const trimmed = p.trim();
  if (!trimmed) return "";
  const abs = path.isAbsolute(trimmed) ? trimmed : path.resolve(serverRoot, trimmed);
  return fs.existsSync(abs) ? abs : "";
}

function initAdmin() {
  if (initialized || admin.apps.length) return;

  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const pathRaw =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    "";

  try {
    if (jsonRaw) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(jsonRaw)) });
      initialized = true;
      return;
    }
    const credPath = pathRaw ? resolveCredentialPath(pathRaw) : "";
    if (credPath) {
      admin.initializeApp({ credential: admin.credential.cert(credPath) });
      initialized = true;
      return;
    }
    if (pathRaw) {
      console.error(
        "Firebase admin: credential file not found. Check FIREBASE_SERVICE_ACCOUNT_PATH / GOOGLE_APPLICATION_CREDENTIALS:",
        path.isAbsolute(pathRaw.trim()) ? pathRaw.trim() : path.resolve(serverRoot, pathRaw.trim())
      );
    }
  } catch (e) {
    console.error("Firebase admin init failed:", e.message);
  }
}

/**
 * Sets req.ownerUid from a verified Firebase ID token (Authorization: Bearer …).
 * Each signed-in user only accesses MongoDB rows scoped to their uid.
 */
export async function attachOwnerUid(req, res, next) {
  initAdmin();

  const authHeader = req.headers.authorization || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : "";

  if (!token) {
    return res.status(401).json({ message: "Missing or invalid Authorization header" });
  }

  if (!admin.apps.length) {
    return res.status(503).json({
      message:
        "Server authentication is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH to your downloaded service account .json file, or FIREBASE_SERVICE_ACCOUNT_JSON (full JSON string), in server/.env.",
    });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.ownerUid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session. Please sign in again." });
  }
}
