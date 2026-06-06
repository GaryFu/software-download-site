import { getUploadSession } from "../lib/auth.js";

export default async function handler(request, response) {
  const session = getUploadSession(request);
  response.status(200).json({
    authenticated: Boolean(session),
    username: session?.username || "",
  });
}
