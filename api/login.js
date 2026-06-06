import { createSessionCookie, verifyCredentials } from "../lib/auth.js";

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const payload = await readJson(request);
    const username = String(payload.username || "");
    const password = String(payload.password || "");
    if (!verifyCredentials(username, password)) {
      response.status(401).json({ error: "用户名或密码不正确。" });
      return;
    }

    response.setHeader("Set-Cookie", createSessionCookie(username));
    response.status(200).json({ ok: true, username });
  } catch (error) {
    response.status(400).json({ error: error.message || "登录失败。" });
  }
}
