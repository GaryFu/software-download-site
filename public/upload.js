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

    setProgress(28, "正在创建 R2 上传地址...");
    const presignResponse = await fetch("/api/presign-upload", {
      method: "POST",
      headers: {
        "content-type": "application/json",
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
      if (presignResponse.status === 401) {
        setAuthenticated(false);
      }
      throw new Error(presign.error || "无法创建上传地址。");
    }

    setProgress(52, "正在直传 APK 到 R2...");
    await uploadToSignedUrl(
      presign.uploadUrl,
      file,
      file.type || "application/vnd.android.package-archive",
    );

    setProgress(86, "正在登记软件包目录...");
    const registerResponse = await fetch("/api/register-package", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(presign.metadata),
    });
    const registerResult = await registerResponse.json();
    if (!registerResponse.ok) {
      throw new Error(registerResult.error || "软件包已上传，但目录登记失败。");
    }

    setProgress(100, "发布完成。软件包已加入下载列表。");
    elements.uploadForm.reset();
    setSelectedFile(null);
  } catch (error) {
    setProgress(0, error.message || "上传失败。");
  } finally {
    submitButton.disabled = false;
  }
});

refreshSession();
