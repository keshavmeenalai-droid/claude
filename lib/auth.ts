// Shared by middleware (Edge runtime) and server code: Web Crypto only.

export const SESSION_COOKIE = "ng_session";
export const MEMBER_COOKIE = "ng_member";

function secret(): string {
  return process.env.SESSION_SECRET || process.env.APP_PASSWORD || "";
}

async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token stored in the session cookie. Changing APP_PASSWORD or SESSION_SECRET logs everyone out. */
export async function sessionToken(): Promise<string> {
  return hmacHex(secret(), `northgate-session-v1:${process.env.APP_PASSWORD ?? ""}`);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token || !secret()) return false;
  return constantTimeEqual(token, await sessionToken());
}

export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  // Compare HMACs so the comparison time does not depend on the password length.
  const [a, b] = await Promise.all([hmacHex("pw", input), hmacHex("pw", expected)]);
  return constantTimeEqual(a, b);
}
