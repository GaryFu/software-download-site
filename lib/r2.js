import crypto from "node:crypto";

const encoder = new TextEncoder();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function sha256(value, encoding = "hex") {
  const input = typeof value === "string" ? value : Buffer.from(value);
  return crypto.createHash("sha256").update(input).digest(encoding);
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeKeyPath(key) {
  return key.split("/").map(encodePathSegment).join("/");
}

function getR2Config() {
  const accountId = requiredEnv("CLOUDFLARE_R2_ACCOUNT_ID");
  const bucket = requiredEnv("CLOUDFLARE_R2_BUCKET");
  return {
    accountId,
    bucket,
    accessKeyId: requiredEnv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function signingKey(secretAccessKey, dateStamp) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function amzDates(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function canonicalQuery(params) {
  return [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function signPresignedUrl({ method, key, expires = 900, headers = {}, now = new Date() }) {
  const config = getR2Config();
  const { amzDate, dateStamp } = amzDates(now);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodePathSegment(config.bucket)}/${encodeKeyPath(key)}`;
  const signedHeaderNames = ["host", ...Object.keys(headers).map((item) => item.toLowerCase())].sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => {
      const value = name === "host" ? host : headers[name] ?? headers[name.toLowerCase()] ?? "";
      return `${name}:${String(value).trim()}\n`;
    })
    .join("");

  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": signedHeaderNames.join(";"),
  });

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaderNames.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const signature = hmac(signingKey(config.secretAccessKey, dateStamp), stringToSign, "hex");
  query.set("X-Amz-Signature", signature);
  return `${config.endpoint}${canonicalUri}?${canonicalQuery(query)}`;
}

function queryStringFromEntries(entries) {
  return entries
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

async function signedFetch({ method = "GET", key, query = "", body, contentType = "application/json" }) {
  const config = getR2Config();
  const { amzDate, dateStamp } = amzDates();
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = `/${encodePathSegment(config.bucket)}/${encodeKeyPath(key)}`;
  const payloadHash = sha256(body ?? "");
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  if (body !== undefined) {
    headers["content-type"] = contentType;
  }

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${hmac(signingKey(config.secretAccessKey, dateStamp), stringToSign, "hex")}`,
  ].join(", ");

  const response = await fetch(`${config.endpoint}${path}${query ? `?${query}` : ""}`, {
    method,
    body,
    headers: {
      ...headers,
      authorization,
    },
  });
  return response;
}

async function signedBucketFetch({ method = "GET", query = "", body, contentType = "application/xml" }) {
  const config = getR2Config();
  const { amzDate, dateStamp } = amzDates();
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = `/${encodePathSegment(config.bucket)}`;
  const payloadHash = sha256(body ?? "");
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  if (body !== undefined) {
    headers["content-type"] = contentType;
  }

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${hmac(signingKey(config.secretAccessKey, dateStamp), stringToSign, "hex")}`,
  ].join(", ");

  return fetch(`${config.endpoint}${path}${query ? `?${query}` : ""}`, {
    method,
    body,
    headers: {
      ...headers,
      authorization,
    },
  });
}

export function defaultObjectKey() {
  return process.env.DEFAULT_OBJECT_KEY || "software/latest.apk";
}

export function metadataKey() {
  return process.env.METADATA_OBJECT_KEY || "software/latest.json";
}

export function publicUrlForKey(key) {
  const baseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;
  if (!baseUrl) {
    return "";
  }
  return `${baseUrl.replace(/\/$/, "")}/${encodeKeyPath(key)}`;
}

export function shouldUsePublicBaseUrl() {
  const baseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL || "";
  return Boolean(baseUrl && !baseUrl.includes("r2.cloudflarestorage.com"));
}

export async function readPackageMetadata() {
  try {
    const response = await signedFetch({ method: "GET", key: metadataKey() });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Fall through to env defaults.
  }

  const objectKey = defaultObjectKey();
  return {
    appName: process.env.DEFAULT_APP_NAME || "Android 软件包",
    version: process.env.DEFAULT_APP_VERSION || "",
    fileName: objectKey.split("/").pop() || "latest.apk",
    objectKey,
    sha256: process.env.DEFAULT_SHA256 || "",
    size: Number(process.env.DEFAULT_SIZE || 0),
    releaseDate: process.env.DEFAULT_RELEASE_DATE || "",
    uploadedAt: "",
    downloadUrl: publicUrlForKey(objectKey),
  };
}

export function presignUpload({ objectKey, contentType }) {
  return signPresignedUrl({
    method: "PUT",
    key: objectKey,
    expires: 900,
    headers: {
      "content-type": contentType || "application/octet-stream",
    },
  });
}

export function presignMetadataUpload() {
  return signPresignedUrl({
    method: "PUT",
    key: metadataKey(),
    expires: 900,
    headers: {
      "content-type": "application/json",
    },
  });
}

export function presignDownload(objectKey) {
  return signPresignedUrl({
    method: "GET",
    key: objectKey,
    expires: 600,
  });
}

export async function putObject({ key, body, contentType }) {
  const response = await signedFetch({
    method: "PUT",
    key,
    body,
    contentType: contentType || "application/octet-stream",
  });
  if (!response.ok) {
    throw new Error(`R2 upload failed with ${response.status}: ${await response.text()}`);
  }
}

export async function putPackageMetadata(metadata) {
  await putObject({
    key: metadataKey(),
    body: JSON.stringify(metadata, null, 2),
    contentType: "application/json",
  });
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlValue(xml, tagName) {
  return xml.match(new RegExp(`<${tagName}>([^<]+)</${tagName}>`))?.[1] || "";
}

export async function createMultipartUpload({ key, contentType }) {
  const response = await signedFetch({
    method: "POST",
    key,
    query: "uploads=",
    contentType: contentType || "application/octet-stream",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`R2 multipart create failed with ${response.status}: ${text}`);
  }
  const uploadId = xmlValue(text, "UploadId");
  if (!uploadId) {
    throw new Error("R2 multipart create did not return an upload id.");
  }
  return uploadId;
}

export async function uploadMultipartPart({ key, uploadId, partNumber, body }) {
  const response = await signedFetch({
    method: "PUT",
    key,
    query: queryStringFromEntries([
      ["partNumber", partNumber],
      ["uploadId", uploadId],
    ]),
    body,
    contentType: "application/octet-stream",
  });
  if (!response.ok) {
    throw new Error(`R2 multipart part ${partNumber} failed with ${response.status}: ${await response.text()}`);
  }
  const etag = response.headers.get("etag");
  if (!etag) {
    throw new Error(`R2 multipart part ${partNumber} did not return an ETag.`);
  }
  return etag;
}

export async function completeMultipartUpload({ key, uploadId, parts }) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUpload>
${parts
  .sort((left, right) => Number(left.partNumber) - Number(right.partNumber))
  .map(
    (part) => `  <Part>
    <PartNumber>${Number(part.partNumber)}</PartNumber>
    <ETag>${xmlEscape(part.etag)}</ETag>
  </Part>`,
  )
  .join("\n")}
</CompleteMultipartUpload>`;
  const response = await signedFetch({
    method: "POST",
    key,
    query: queryStringFromEntries([["uploadId", uploadId]]),
    body,
    contentType: "application/xml",
  });
  if (!response.ok) {
    throw new Error(`R2 multipart complete failed with ${response.status}: ${await response.text()}`);
  }
}

export async function abortMultipartUpload({ key, uploadId }) {
  const response = await signedFetch({
    method: "DELETE",
    key,
    query: queryStringFromEntries([["uploadId", uploadId]]),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 multipart abort failed with ${response.status}: ${await response.text()}`);
  }
}

export async function putBucketCors({ allowedOrigins = ["*"] } = {}) {
  const originXml = allowedOrigins.map((origin) => `<AllowedOrigin>${origin}</AllowedOrigin>`).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
    ${originXml}
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;
  const response = await signedBucketFetch({
    method: "PUT",
    query: "cors=",
    body,
    contentType: "application/xml",
  });
  if (!response.ok) {
    throw new Error(`R2 CORS update failed with ${response.status}: ${await response.text()}`);
  }
}

export function safeFileName(fileName) {
  return String(fileName || "latest.apk")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "latest.apk";
}

export function buildUploadObjectKey(fileName) {
  const cleanName = safeFileName(fileName);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `software/uploads/${stamp}-${cleanName}`;
}

export function byteLength(value) {
  return encoder.encode(value).byteLength;
}
