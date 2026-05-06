import { auth } from "./firebase";

/**
 * Same as fetch, but attaches Firebase ID token for API routes that require req.ownerUid.
 * Waits for persisted auth to load so `currentUser` is set (avoids requests with no header).
 * Does not set Content-Type when body is FormData.
 */
export async function authFetch(input, init = {}) {
  await auth.authStateReady();

  const headers = new Headers(init.headers || {});
  const user = auth.currentUser;
  if (!user) {
    return new Response(
      JSON.stringify({
        message: "Not signed in. Sign in again, then retry.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const token = await user.getIdToken();
    headers.set("Authorization", `Bearer ${token}`);
  } catch {
    return new Response(
      JSON.stringify({
        message: "Could not refresh your session. Please sign in again.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (init.body != null && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
