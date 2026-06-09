import { buildUploadObjectKey, presignUpload, publicUrlForKey } from "../lib/r2.js";
import { requireUploadSession } from "../lib/auth.js";

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) {
    return {};
  }
  return JSON.parse(body);
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
    const fileName = payload.fileName || "latest.apk";
    const contentType = payload.contentType || "application/vnd.android.package-archive";
    const objectKey = buildUploadObjectKey(fileName);
    const metadata = {
      appName: payload.appName || "Android 软件包",
      version: payload.version || "",
      fileName,
      objectKey,
      sha256: payload.sha256 || "",
      size: Number(payload.size || 0),
      releaseDate: payload.releaseDate || new Date().toISOString().slice(0, 10),
      uploadedAt: new Date().toISOString(),
      downloadUrl: publicUrlForKey(objectKey),
      iconUrl: payload.iconUrl || "",
      shortDescription: payload.shortDescription || "",
      description: payload.description || "",
      category: payload.category || "",
      tags: payload.tags || [],
      developerName: payload.developerName || "",
      packageName: payload.packageName || "",
      minAndroidVersion: payload.minAndroidVersion || "",
      permissions: payload.permissions || [],
      featureImageUrl: payload.featureImageUrl || "",
      screenshots: payload.screenshots || [],
      releaseNotes: payload.releaseNotes || "",
      websiteUrl: payload.websiteUrl || "",
      supportEmail: payload.supportEmail || "",
      privacyPolicyUrl: payload.privacyPolicyUrl || "",
    };
    response.status(200).json({
      objectKey,
      uploadUrl: presignUpload({ objectKey, contentType }),
      metadata,
    });
  } catch (error) {
    response.status(400).json({ error: error.message || "Unable to create upload URL." });
  }
}
