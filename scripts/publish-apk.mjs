import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { defaultObjectKey, publicUrlForKey, putObject, putPackageMetadata, safeFileName } from "../lib/r2.js";

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function hashSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

const filePath = arg("file");
if (!filePath) {
  console.error("Usage: npm run publish:apk -- --file=/path/to/app.apk [--name=Android 软件包] [--version=1.0.0] [--key=software/latest.apk]");
  process.exit(1);
}

const body = await fs.readFile(filePath);
const objectKey = arg("key", defaultObjectKey());
const fileName = safeFileName(arg("file-name", path.basename(filePath)));
const metadata = {
  appName: arg("name", "Android 软件包"),
  version: arg("version", ""),
  fileName,
  objectKey,
  sha256: hashSha256(body),
  size: body.byteLength,
  releaseDate: arg("date", new Date().toISOString().slice(0, 10)),
  uploadedAt: new Date().toISOString(),
  downloadUrl: publicUrlForKey(objectKey),
};

await putObject({
  key: objectKey,
  body,
  contentType: "application/vnd.android.package-archive",
});
await putPackageMetadata(metadata);

console.log(JSON.stringify(metadata, null, 2));
