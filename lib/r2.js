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

async function signedFetch({ method = "GET", key, body, contentType = "application/json" }) {
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
  const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${hmac(signingKey(config.secretAccessKey, dateStamp), stringToSign, "hex")}`,
  ].join(", ");

  const response = await fetch(`${config.endpoint}${path}`, {
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

export function catalogKey() {
  return process.env.CATALOG_OBJECT_KEY || "software/catalog.json";
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

export async function readCatalog() {
  try {
    const response = await signedFetch({ method: "GET", key: catalogKey() });
    if (response.ok) {
      const catalog = await response.json();
      return {
        updatedAt: catalog.updatedAt || "",
        packages: normalizeCatalogPackages(Array.isArray(catalog.packages) ? catalog.packages : []),
      };
    }
  } catch {
    // Fall through to latest metadata.
  }

  const latest = await readPackageMetadata();
  return {
    updatedAt: latest.uploadedAt || "",
    packages: latest.objectKey ? [normalizePackage(latest)] : [],
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

export async function deleteObject(key) {
  const response = await signedFetch({
    method: "DELETE",
    key,
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 delete failed with ${response.status}: ${await response.text()}`);
  }
}

export async function putPackageMetadata(metadata) {
  await putObject({
    key: metadataKey(),
    body: JSON.stringify(metadata, null, 2),
    contentType: "application/json",
  });
}

export async function putCatalog(catalog) {
  await putObject({
    key: catalogKey(),
    body: JSON.stringify(catalog, null, 2),
    contentType: "application/json",
  });
}

export async function registerPackage(metadata) {
  const current = await readCatalog();
  const normalized = normalizePackage(metadata);
  const packages = normalizeCatalogPackages([
    normalized,
    ...current.packages.filter((item) => item.objectKey !== normalized.objectKey),
  ]);
  const catalog = {
    updatedAt: new Date().toISOString(),
    packages,
  };
  await putPackageMetadata(normalized);
  await putCatalog(catalog);
  return { catalog, package: normalized };
}

export async function updatePackageMetadata({ objectKey, patch }) {
  if (!objectKey) {
    throw new Error("Missing objectKey.");
  }
  const current = await readCatalog();
  const targetIndex = current.packages.findIndex((item) => item.objectKey === objectKey);
  if (targetIndex === -1) {
    throw new Error("Package not found.");
  }

  const updatedPackage = normalizePackage({
    ...current.packages[targetIndex],
    ...pickEditableMetadata(patch || {}),
    objectKey,
  });
  const packages = normalizeCatalogPackages(
    current.packages.map((item, index) => (index === targetIndex ? updatedPackage : item)),
  );
  const catalog = {
    updatedAt: new Date().toISOString(),
    packages,
  };
  await putCatalog(catalog);
  if (current.packages[0]?.objectKey === objectKey) {
    await putPackageMetadata(updatedPackage);
  }
  return { catalog, package: updatedPackage };
}

export async function deletePackage({ objectKey, deleteFile = true }) {
  if (!objectKey) {
    throw new Error("Missing objectKey.");
  }
  const current = await readCatalog();
  const target = current.packages.find((item) => item.objectKey === objectKey);
  const packages = current.packages.filter((item) => item.objectKey !== objectKey);
  const catalog = {
    updatedAt: new Date().toISOString(),
    packages,
  };
  await putCatalog(catalog);
  let fileDeleted = false;
  let deleteError = "";
  if (deleteFile && target?.objectKey) {
    try {
      await deleteObject(target.objectKey);
      fileDeleted = true;
    } catch (error) {
      deleteError = error.message || "Unable to delete object.";
    }
  }
  return { catalog, deleted: target || { objectKey }, fileDeleted, deleteError };
}

function normalizePackage(metadata) {
  return {
    id: metadata.id || metadata.objectKey,
    appName: metadata.appName || "Android 软件包",
    version: metadata.version || "",
    fileName: metadata.fileName || metadata.objectKey?.split("/").pop() || "latest.apk",
    objectKey: metadata.objectKey,
    sha256: metadata.sha256 || "",
    size: Number(metadata.size || 0),
    releaseDate: metadata.releaseDate || new Date().toISOString().slice(0, 10),
    uploadedAt: metadata.uploadedAt || new Date().toISOString(),
    downloadUrl: metadata.downloadUrl || publicUrlForKey(metadata.objectKey),
    platform: metadata.platform || "Android",
    fileType: metadata.fileType || "APK",
    iconUrl: metadata.iconUrl || "",
    shortDescription: metadata.shortDescription || "",
    description: metadata.description || "",
    category: metadata.category || "",
    tags: normalizeTextList(metadata.tags),
    developerName: metadata.developerName || "",
    packageName: metadata.packageName || "",
    minAndroidVersion: metadata.minAndroidVersion || "",
    permissions: normalizeTextList(metadata.permissions),
    featureImageUrl: metadata.featureImageUrl || "",
    screenshots: normalizeTextList(metadata.screenshots),
    releaseNotes: metadata.releaseNotes || "",
    websiteUrl: metadata.websiteUrl || "",
    supportEmail: metadata.supportEmail || "",
    privacyPolicyUrl: metadata.privacyPolicyUrl || "",
  };
}

function normalizeTextList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickEditableMetadata(patch) {
  const editableFields = [
    "appName",
    "version",
    "iconUrl",
    "shortDescription",
    "description",
    "category",
    "tags",
    "developerName",
    "packageName",
    "minAndroidVersion",
    "permissions",
    "featureImageUrl",
    "screenshots",
    "releaseNotes",
    "websiteUrl",
    "supportEmail",
    "privacyPolicyUrl",
  ];
  return Object.fromEntries(
    editableFields
      .filter((field) => Object.hasOwn(patch, field))
      .map((field) => [field, patch[field]]),
  );
}

function normalizeCatalogPackages(packages) {
  const byObjectKey = new Map();
  packages.map(normalizePackage).forEach((item) => {
    if (!item.objectKey) {
      return;
    }
    const current = byObjectKey.get(item.objectKey);
    if (!current || String(item.uploadedAt || "").localeCompare(String(current.uploadedAt || "")) > 0) {
      byObjectKey.set(item.objectKey, item);
    }
  });
  return [...byObjectKey.values()].sort((left, right) =>
    String(right.uploadedAt || "").localeCompare(String(left.uploadedAt || "")),
  );
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
