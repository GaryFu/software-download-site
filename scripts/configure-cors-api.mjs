import fs from "node:fs/promises";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

const accountId = requiredEnv("CLOUDFLARE_R2_ACCOUNT_ID");
const bucketName = requiredEnv("CLOUDFLARE_R2_BUCKET");
const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;

if (!token) {
  throw new Error("Missing CLOUDFLARE_API_TOKEN or CF_API_TOKEN");
}

const body = await fs.readFile(new URL("../r2-cors.json", import.meta.url), "utf8");
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/cors`,
  {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body,
  },
);

const text = await response.text();
if (!response.ok) {
  throw new Error(`Cloudflare CORS API failed with ${response.status}: ${text}`);
}

console.log(text || "Configured R2 CORS via Cloudflare API.");
