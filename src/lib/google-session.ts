import { getToken } from "next-auth/jwt";
import { HttpError } from "@/lib/http";

const EXPIRY_SAFETY_MARGIN_SECONDS = 30;

// Returns the signed-in user's Google access token for Gemini. Throws a 401 when the user is not signed in.
export async function requireGoogleAccessToken(request: Request): Promise<string> {
  const secureCookie = (request.headers.get("cookie") ?? "").includes("__Secure-authjs.session-token");
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET, secureCookie });
  const accessToken = token?.googleAccessToken;
  const expiresAt = token?.googleAccessTokenExpiresAt;
  if (typeof accessToken !== "string" || typeof expiresAt !== "number") {
    throw new HttpError("Sign in with Google to upload and read receipts.", 401);
  }
  if (Date.now() / 1000 >= expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS) {
    throw new HttpError("Your Google sign-in has expired. Sign in again to continue.", 401);
  }
  return accessToken;
}
