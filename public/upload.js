const elements = {
  loginPanel: document.querySelector("#login-panel"),
  uploadPanel: document.querySelector("#upload-panel"),
  loginForm: document.querySelector("#login-form"),
  loginMessage: document.querySelector("#login-message"),
  logoutButton: document.querySelector("#logout-button"),
  uploadForm: document.querySelector("#upload-form"),
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  selectedFile: document.querySelector("#selected-file"),
  progressBar: document.querySelector("#progress-bar"),
  uploadMessage: document.querySelector("#upload-message"),
};

let selectedFile = null;

function setAuthenticated(isAuthenticated) {
  elements.loginPanel.classList.toggle("hidden", isAuthenticated);
  elements.uploadPanel.classList.toggle("hidden", !isAuthenticated);
}

function setProgress(percent, message) {
  elements.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  elements.uploadMessage.textContent = message;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function setSelectedFile(file, source = "已选择") {
  if (!file) {
    selectedFile = null;
    elements.selectedFile.textContent = "尚未选择文件";
    return;
  }
  selectedFile = file;
  elements.selectedFile.textContent = `${source}：${file.name} · ${formatBytes(file.size)}`;
  setProgress(0, "文件已就绪，可以上传。");
}

function firstFileFromList(files) {
  return [...files].find((file) => file.name.toLowerCase().endsWith(".apk")) || null;
}

async function refreshSession() {
  const response = await fetch("/api/session");
  const data = await response.json();
  setAuthenticated(Boolean(data.authenticated));
}

async function sha256File(file) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadJson(payload) {
  const response = await fetch("/api/multipart-upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      setAuthenticated(false);
    }
    throw new Error(data.error || `上传失败：${response.status}`);
  }
  return data;
}

async function uploadChunk({ objectKey, uploadId, partNumber, chunk }) {
  const params = new URLSearchParams({
    objectKey,
    uploadId,
    partNumber: String(partNumber),
  });
  const response = await fetch(`/api/multipart-upload?${params.toString()}`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: chunk,
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      setAuthenticated(false);
    }
    throw new Error(data.error || `分片 ${partNumber} 上传失败。`);
  }
  return data;
}

async function uploadFileInChunks({ file, metadata }) {
  const chunkSize = 3 * 1024 * 1024;
  const created = await uploadJson({
    action: "create",
    fileName: file.name,
    contentType: file.type || "application/vnd.android.package-archive",
  });
  const parts = [];
  let partNumber = 1;
  let uploadedBytes = 0;

  try {
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const result = await uploadChunk({
        objectKey: created.objectKey,
        uploadId: created.uploadId,
        partNumber,
        chunk,
      });
      parts.push({ partNumber: result.partNumber, etag: result.etag });
      uploadedBytes += chunk.size;
      setProgress(32 + (uploadedBytes / file.size) * 54, `正在上传第 ${partNumber} 个分片...`);
      partNumber += 1;
    }

    setProgress(90, "正在合并分片并发布软件包信息...");
    return await uploadJson({
      action: "complete",
      objectKey: created.objectKey,
      uploadId: created.uploadId,
      parts,
      ...metadata,
    });
  } catch (error) {
    await uploadJson({
      action: "abort",
      objectKey: created.objectKey,
      uploadId: created.uploadId,
    }).catch(() => {});
    throw error;
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = elements.loginForm.querySelector("button");
  const formData = new FormData(elements.loginForm);
  submitButton.disabled = true;
  elements.loginMessage.textContent = "正在登录...";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: String(formData.get("username") || ""),
        password: String(formData.get("password") || ""),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "登录失败。");
    }
    elements.loginForm.reset();
    elements.loginMessage.textContent = "";
    setAuthenticated(true);
  } catch (error) {
    elements.loginMessage.textContent = error.message || "登录失败。";
  } finally {
    submitButton.disabled = false;
  }
});

elements.logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  setAuthenticated(false);
});

elements.dropZone.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.fileInput.click();
  }
});

elements.fileInput.addEventListener("change", () => {
  const file = firstFileFromList(elements.fileInput.files);
  if (!file) {
    setProgress(0, "请选择 APK 文件。");
    return;
  }
  setSelectedFile(file, "已选择");
});

["dragenter", "dragover"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  });
});

elements.dropZone.addEventListener("drop", (event) => {
  const file = firstFileFromList(event.dataTransfer.files);
  if (!file) {
    setProgress(0, "拖入的文件不是 APK。");
    return;
  }
  setSelectedFile(file, "已拖入");
});

window.addEventListener("paste", (event) => {
  const file = firstFileFromList(event.clipboardData?.files || []);
  if (file) {
    setSelectedFile(file, "已粘贴");
  } else if (event.clipboardData?.files?.length) {
    setProgress(0, "粘贴的文件不是 APK。");
  }
});

elements.uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = elements.uploadForm.querySelector("button");
  const formData = new FormData(elements.uploadForm);
  const file = selectedFile || firstFileFromList(elements.fileInput.files);

  if (!(file instanceof File) || file.size === 0) {
    setProgress(0, "请选择、拖入或粘贴 APK 文件。");
    return;
  }

  submitButton.disabled = true;
  try {
    setProgress(10, "正在计算 SHA-256...");
    const sha256 = await sha256File(file);

    setProgress(28, "正在创建分片上传任务...");
    await uploadFileInChunks({
      file,
      metadata: {
        appName: String(formData.get("appName") || "Android 软件包"),
        version: String(formData.get("version") || ""),
        fileName: file.name,
        size: file.size,
        sha256,
      },
    });

    setProgress(100, "发布完成。下载页已指向新软件包。");
    elements.uploadForm.reset();
    setSelectedFile(null);
  } catch (error) {
    setProgress(0, error.message || "上传失败。");
  } finally {
    submitButton.disabled = false;
  }
});

refreshSession();
