import { presignDownload, publicUrlForKey, readPackageMetadata, shouldUsePublicBaseUrl } from "../lib/r2.js";

export default async function handler(_request, response) {
  try {
    const metadata = await readPackageMetadata();
    if (!metadata.objectKey) {
      response.status(404).json({ error: "No package has been published yet." });
      return;
    }

    const url = shouldUsePublicBaseUrl() ? publicUrlForKey(metadata.objectKey) : presignDownload(metadata.objectKey);
    response.setHeader("Cache-Control", "no-store");
    response.writeHead(302, { Location: url });
    response.end();
  } catch (error) {
    response.status(500).json({ error: error.message || "Unable to create download link." });
  }
}
