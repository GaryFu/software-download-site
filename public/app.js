const elements = {
  status: document.querySelector("#package-status"),
  appName: document.querySelector("#app-name"),
  appVersion: document.querySelector("#app-version"),
  fileName: document.querySelector("#file-name"),
  fileSize: document.querySelector("#file-size"),
  releaseDate: document.querySelector("#release-date"),
  sha256: document.querySelector("#sha256"),
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
    elements.appVersion.textContent = error.message;
  }
}

loadPackage();
