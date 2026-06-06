import crypto from "node:crypto";

const cookieName = "software_upload_session";
const maxAgeSeconds = 60 * 60 * 12;

function requireAuthSecret() {
  const secret = process.env.AUTH_SECRET || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!secret) {
    throw new Error("Missing AUTH_SECRET");
  }
  return secret;
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(value) {
  return crypto.createHmac("sha256", requireAuthSecret()).update(value).digest("base64url");
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        if (index === -1) {
          return [item, ""];
        }
        return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
      }),
  );
}

function sessionCookie(value) {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${cookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function verifyCredentials(username, password) {
  const expectedUsername = process.env.UPLOAD_USERNAME || "admin";
  const expectedPassword = process.env.UPLOAD_PASSWORD;
  if (!expectedPassword) {
    return false;
  }
  return safeCompare(username, expectedUsername) && safeCompare(password, expectedPassword);
}

export function createSessionCookie(username) {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const payload = Buffer.from(JSON.stringify({ username, expiresAt })).toString("base64url");
  return sessionCookie(`${payload}.${sign(payload)}`);
}

export function clearSessionCookie() {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function getUploadSession(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const token = cookies[cookieName];
  if (!token || !token.includes(".")) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!safeCompare(signature, sign(payload))) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.expiresAt || Date.now() > session.expiresAt) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function requireUploadSession(request, response) {
  const session = getUploadSession(request);
  if (!session) {
    response.status(401).json({ error: "请先登录上传管理页。" });
    return null;
  }
  return session;
}
