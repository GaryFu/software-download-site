const elements = {
  status: document.querySelector("#package-status"),
  appName: document.querySelector("#app-name"),
  appVersion: document.querySelector("#app-version"),
  fileName: document.querySelector("#file-name"),
  fileSize: document.querySelector("#file-size"),
  releaseDate: document.querySelector("#release-date"),
  sha256: document.querySelector("#sha256"),
  form: document.querySelector("#upload-form"),
  progressBar: document.querySelector("#progress-bar"),
  uploadMessage: document.querySelector("#upload-message"),
  downloadButton: document.querySelector("#download-button"),
};

function formatBytes(bytes) {
  if (!bytes) {
    return "-";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function setProgress(percent, message) {
  elements.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  elements.uploadMessage.textContent = message;
}

function renderPackage(metadata) {
  elements.status.textContent = metadata.objectKey ? "可下载" : "未发布";
  elements.appName.textContent = metadata.appName || "Android 软件包";
  elements.appVersion.textContent = metadata.version ? `版本 ${metadata.version}` : "未提供版本号";
  elements.fileName.textContent = metadata.fileName || "-";
  elements.fileSize.textContent = formatBytes(metadata.size);
  elements.releaseDate.textContent = metadata.releaseDate || "-";
  elements.sha256.textContent = metadata.sha256 || "-";
  elements.downloadButton.toggleAttribute("aria-disabled", !metadata.objectKey);
}

async function loadPackage() {
  try {
    const response = await fetch("/api/package");
    if (!response.ok) {
      throw new Error("无法读取软件包信息");
    }
    const data = await response.json();
    renderPackage(data.package || {});
  } catch (error) {
    elements.status.textContent = "读取失败";
    elements.uploadMessage.textContent = error.message;
  }
}

async function sha256File(file) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadToSignedUrl(url, body, contentType) {
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "content-type": contentType,
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `上传失败：${response.status}`);
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = elements.form.querySelector("button");
  const formData = new FormData(elements.form);
  const file = formData.get("file");
  const token = String(formData.get("token") || "");

  if (!(file instanceof File) || file.size === 0) {
    setProgress(0, "请选择 APK 文件。");
    return;
  }

  submitButton.disabled = true;
  try {
    setProgress(10, "正在计算 SHA-256...");
    const sha256 = await sha256File(file);

    setProgress(28, "正在创建 R2 上传地址...");
    const presignResponse = await fetch("/api/presign-upload", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-upload-token": token,
      },
      body: JSON.stringify({
        appName: String(formData.get("appName") || "Android 软件包"),
        version: String(formData.get("version") || ""),
        fileName: file.name,
        contentType: file.type || "application/vnd.android.package-archive",
        size: file.size,
        sha256,
      }),
    });
    const presign = await presignResponse.json();
    if (!presignResponse.ok) {
      throw new Error(presign.error || "无法创建上传地址。");
    }

    setProgress(52, "正在上传 APK 到 R2...");
    await uploadToSignedUrl(
      presign.uploadUrl,
      file,
      file.type || "application/vnd.android.package-archive",
    );

    setProgress(86, "正在发布软件包信息...");
    await uploadToSignedUrl(presign.metadataUploadUrl, presign.metadataBody, "application/json");

    setProgress(100, "发布完成。");
    elements.form.reset();
    await loadPackage();
  } catch (error) {
    setProgress(0, error.message || "上传失败。");
  } finally {
    submitButton.disabled = false;
  }
});

loadPackage();
