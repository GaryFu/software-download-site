import { clearSessionCookie } from "../lib/auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  response.setHeader("Set-Cookie", clearSessionCookie());
  response.status(200).json({ ok: true });
}
