import { COUNTRY_IDS, CountryId, isCountryId } from "./shared-bases";

export type UserRole = "Administrador" | "Campo";
export type SessionUser = { username: string; role: UserRole; country: CountryId | null; exp: number };

const SESSION_COOKIE = "dn_route_session";
const SESSION_SECONDS = 60 * 60 * 12;
const textEncoder = new TextEncoder();

type AuthEnvironment = {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  FIELD_RD_USERNAME?: string;
  FIELD_RD_PASSWORD?: string;
  FIELD_GT_EMBOCEN_USERNAME?: string;
  FIELD_GT_EMBOCEN_PASSWORD?: string;
  FIELD_GT_ABVO_USERNAME?: string;
  FIELD_GT_ABVO_PASSWORD?: string;
  FIELD_CR_USERNAME?: string;
  FIELD_CR_PASSWORD?: string;
  FIELD_CL_USERNAME?: string;
  FIELD_CL_PASSWORD?: string;
  FIELD_EC_USERNAME?: string;
  FIELD_EC_PASSWORD?: string;
  FIELD_PA_USERNAME?: string;
  FIELD_PA_PASSWORD?: string;
  FIELD_SV_USERNAME?: string;
  FIELD_SV_PASSWORD?: string;
  FIELD_NI_USERNAME?: string;
  FIELD_NI_PASSWORD?: string;
  FIELD_HN_USERNAME?: string;
  FIELD_HN_PASSWORD?: string;
  SESSION_SECRET?: string;
};

const getEnv = (): AuthEnvironment => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cf = require("cloudflare:workers");
    return (cf?.env ?? process.env) as AuthEnvironment;
  } catch {
    return (process.env as unknown as AuthEnvironment) ?? {};
  }
};

const authEnvironment = () => getEnv();

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const fromBase64Url = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const constantTimeEqual = (left: string, right: string) => {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return difference === 0;
};

const signingKey = async () => {
  const secret = authEnvironment().SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET no está configurado.");
  return crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
};

const sign = async (payload: string) => {
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), textEncoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
};

export function authenticate(username: string, password: string): Omit<SessionUser, "exp"> | null {
  const config = authEnvironment();
  if (
    config.ADMIN_USERNAME &&
    config.ADMIN_PASSWORD &&
    constantTimeEqual(username, config.ADMIN_USERNAME) &&
    constantTimeEqual(password, config.ADMIN_PASSWORD)
  ) return { username: config.ADMIN_USERNAME, role: "Administrador", country: null };

  const fieldUsers: Array<{ country: CountryId; username?: string; password?: string }> = [
    { country: "rd", username: config.FIELD_RD_USERNAME, password: config.FIELD_RD_PASSWORD },
    { country: "gt-embocen", username: config.FIELD_GT_EMBOCEN_USERNAME, password: config.FIELD_GT_EMBOCEN_PASSWORD },
    { country: "gt-abvo", username: config.FIELD_GT_ABVO_USERNAME, password: config.FIELD_GT_ABVO_PASSWORD },
    { country: "cr", username: config.FIELD_CR_USERNAME, password: config.FIELD_CR_PASSWORD },
    { country: "cl", username: config.FIELD_CL_USERNAME, password: config.FIELD_CL_PASSWORD },
    { country: "ec", username: config.FIELD_EC_USERNAME, password: config.FIELD_EC_PASSWORD },
    { country: "pa", username: config.FIELD_PA_USERNAME, password: config.FIELD_PA_PASSWORD },
    { country: "sv", username: config.FIELD_SV_USERNAME, password: config.FIELD_SV_PASSWORD },
    { country: "ni", username: config.FIELD_NI_USERNAME, password: config.FIELD_NI_PASSWORD },
    { country: "hn", username: config.FIELD_HN_USERNAME, password: config.FIELD_HN_PASSWORD },
  ];
  const matchingUser = fieldUsers.find((candidate) =>
    candidate.username &&
    candidate.password &&
    constantTimeEqual(username, candidate.username) &&
    constantTimeEqual(password, candidate.password));
  if (matchingUser) return { username: matchingUser.username!, role: "Campo", country: matchingUser.country };
  return null;
}

export async function createSessionToken(user: Omit<SessionUser, "exp">) {
  const session: SessionUser = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
  const payload = toBase64Url(textEncoder.encode(JSON.stringify(session)));
  return `${payload}.${await sign(payload)}`;
}

export async function readSession(request: Request): Promise<SessionUser | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !constantTimeEqual(signature, await sign(payload))) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as SessionUser;
    const validCountry = session.country === null || (typeof session.country === "string" && isCountryId(session.country));
    const validScope = session.role === "Administrador"
      ? session.country === null
      : session.role === "Campo" && validCountry && session.country !== null && (COUNTRY_IDS as readonly string[]).includes(session.country);
    if (!session.username || !validScope || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export const sessionCookie = (token: string, request: Request) => {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
};

export const clearSessionCookie = (request: Request) => {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
};
