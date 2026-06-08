import { readCatalog } from "../lib/r2.js";

export default async function handler(_request, response) {
  try {
    const catalog = await readCatalog();
    response.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    response.status(200).json(catalog);
  } catch (error) {
    response.status(500).json({ error: error.message || "Unable to read package catalog." });
  }
}
