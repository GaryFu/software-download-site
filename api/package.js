import { readCatalog, readPackageMetadata } from "../lib/r2.js";

export default async function handler(_request, response) {
  try {
    const metadata = await readPackageMetadata();
    const catalog = await readCatalog();
    response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    response.status(200).json({ package: metadata, catalog });
  } catch (error) {
    response.status(500).json({ error: error.message || "Unable to read package metadata." });
  }
}
