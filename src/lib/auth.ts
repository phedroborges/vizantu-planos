import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "vizantu-planos-session";
const SESSION_DAYS = 30;

function authConfig() {
  const isDev = process.env.NODE_ENV !== "production";
  const password = process.env.ADMIN_PASSWORD || (isDev ? "vizantu-dev" : "");
  const secret =
    process.env.SESSION_SECRET ||
    (password ? createHash("sha256").update(`vizantu-planos:${password}`).digest("hex") : "");

  if (!password || !secret) {
    throw new Error("ADMIN_PASSWORD precisa estar configurada na hospedagem.");
  }

  return { password, secret };
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function sign(expiresAt: number, secret: string) {
  return createHmac("sha256", secret).update(String(expiresAt)).digest("base64url");
}

export function passwordMatches(candidate: string) {
  const { password } = authConfig();
  return timingSafeEqual(digest(candidate), digest(password));
}

export function createSessionValue() {
  const { secret } = authConfig();
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expiresAt}.${sign(expiresAt, secret)}`;
}

export function verifySessionValue(value?: string) {
  if (!value) return false;
  const [expiresRaw, signature] = value.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;

  const { secret } = authConfig();
  const expected = sign(expiresAt, secret);
  return timingSafeEqual(digest(signature), digest(expected));
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  return verifySessionValue(cookieStore.get(COOKIE_NAME)?.value);
}

export async function setSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}
