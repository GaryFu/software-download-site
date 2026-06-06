import { requireUploadSession } from "../lib/auth.js";
import {
  abortMultipartUpload,
  buildUploadObjectKey,
  completeMultipartUpload,
  createMultipartUpload,
  putPackageMetadata,
  publicUrlForKey,
  safeFileName,
  uploadMultipartPart,
} from "../lib/r2.js";

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = await readBody(request);
  return body.byteLength ? JSON.parse(body.toString("utf8")) : {};
}

function metadataFromPayload(payload, objectKey) {
  return {
    appName: payload.appName || "Android 软件包",
    version: payload.version || "",
    fileName: safeFileName(payload.fileName || "latest.apk"),
    objectKey,
    sha256: payload.sha256 || "",
    size: Number(payload.size || 0),
    releaseDate: payload.releaseDate || new Date().toISOString().slice(0, 10),
    uploadedAt: new Date().toISOString(),
    downloadUrl: publicUrlForKey(objectKey),
  };
}

export default async function handler(request, response) {
  if (!requireUploadSession(request, response)) {
    return;
  }

  try {
    if (request.method === "POST") {
      const payload = await readJson(request);
      if (payload.action === "create") {
        const fileName = safeFileName(payload.fileName || "latest.apk");
        const objectKey = buildUploadObjectKey(fileName);
        const uploadId = await createMultipartUpload({
          key: objectKey,
          contentType: payload.contentType || "application/vnd.android.package-archive",
        });
        response.status(200).json({ uploadId, objectKey });
        return;
      }

      if (payload.action === "complete") {
        const objectKey = String(payload.objectKey || "");
        const uploadId = String(payload.uploadId || "");
        const parts = Array.isArray(payload.parts) ? payload.parts : [];
        if (!objectKey || !uploadId || parts.length === 0) {
          response.status(400).json({ error: "Missing multipart completion data." });
          return;
        }
        await completeMultipartUpload({ key: objectKey, uploadId, parts });
        const metadata = metadataFromPayload(payload, objectKey);
        await putPackageMetadata(metadata);
        response.status(200).json({ metadata });
        return;
      }

      if (payload.action === "abort") {
        await abortMultipartUpload({
          key: String(payload.objectKey || ""),
          uploadId: String(payload.uploadId || ""),
        });
        response.status(200).json({ ok: true });
        return;
      }
    }

    if (request.method === "PUT") {
      const url = new URL(request.url, `https://${request.headers.host}`);
      const objectKey = url.searchParams.get("objectKey") || "";
      const uploadId = url.searchParams.get("uploadId") || "";
      const partNumber = Number(url.searchParams.get("partNumber") || 0);
      if (!objectKey || !uploadId || !partNumber) {
        response.status(400).json({ error: "Missing multipart part data." });
        return;
      }
      const etag = await uploadMultipartPart({
        key: objectKey,
        uploadId,
        partNumber,
        body: await readBody(request),
      });
      response.status(200).json({ etag, partNumber });
      return;
    }

    response.setHeader("Allow", "POST, PUT");
    response.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    response.status(500).json({ error: error.message || "Multipart upload failed." });
  }
}
