import { presignDownload, publicUrlForKey, readPackageMetadata, shouldUsePublicBaseUrl } from "../lib/r2.js";

export default async function handler(request, response) {
  try {
    const url = new URL(request.url, `https://${request.headers.host}`);
    const requestedKey = url.searchParams.get("key");
    const metadata = requestedKey ? { objectKey: requestedKey } : await readPackageMetadata();
    if (!metadata.objectKey || !metadata.objectKey.startsWith("software/")) {
      response.status(404).json({ error: "No package has been published yet." });
      return;
    }

    const downloadUrl = shouldUsePublicBaseUrl() ? publicUrlForKey(metadata.objectKey) : presignDownload(metadata.objectKey);
    response.setHeader("Cache-Control", "no-store");
    response.writeHead(302, { Location: downloadUrl });
    response.end();
  } catch (error) {
    response.status(500).json({ error: error.message || "Unable to create download link." });
  }
}
