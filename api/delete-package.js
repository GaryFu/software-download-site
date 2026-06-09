import { requireUploadSession } from "../lib/auth.js";
import { deletePackage } from "../lib/r2.js";

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

  if (!requireUploadSession(request, response)) {
    return;
  }

  try {
    const payload = await readJson(request);
    if (!payload.objectKey) {
      response.status(400).json({ error: "Missing objectKey." });
      return;
    }
    const result = await deletePackage({
      objectKey: payload.objectKey,
      deleteFile: payload.deleteFile !== false,
    });
    response.status(200).json(result);
  } catch (error) {
    response.status(400).json({ error: error.message || "Unable to delete package." });
  }
}
