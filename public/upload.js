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
  managePanel: document.querySelector("#manage-panel"),
  manageMessage: document.querySelector("#manage-message"),
  manageList: document.querySelector("#manage-list"),
  refreshPackages: document.querySelector("#refresh-packages"),
  manageTemplate: document.querySelector("#manage-card-template"),
  editPanel: document.querySelector("#edit-panel"),
  editForm: document.querySelector("#edit-form"),
  editMessage: document.querySelector("#edit-message"),
  cancelEdit: document.querySelector("#cancel-edit"),
};

let selectedFile = null;
let catalogPackages = [];

function setAuthenticated(isAuthenticated) {
  elements.loginPanel.classList.toggle("hidden", isAuthenticated);
  elements.uploadPanel.classList.toggle("hidden", !isAuthenticated);
  elements.managePanel.classList.toggle("hidden", !isAuthenticated);
  elements.editPanel.classList.add("hidden");
  if (isAuthenticated) {
    loadManageList();
  }
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

function dedupePackages(packages) {
  const byKey = new Map();
  packages.forEach((item) => {
    const key = item.objectKey;
    if (!key) return;
    const current = byKey.get(key);
    if (!current || String(item.uploadedAt || "").localeCompare(String(current.uploadedAt || "")) > 0) {
      byKey.set(key, item);
    }
  });
  return [...byKey.values()];
}

function renderIcon(container, item) {
  container.replaceChildren();
  container.classList.toggle("has-image", Boolean(item?.iconUrl));
  container.classList.toggle("has-initial", !item?.iconUrl);
  if (item?.iconUrl) {
    const image = document.createElement("img");
    image.src = item.iconUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    container.append(image);
    return;
  }
  const initial = document.createElement("span");
  initial.className = "app-initial";
  initial.textContent = (item?.appName || item?.fileName || "A").trim().slice(0, 1).toUpperCase();
  container.append(initial);
}

function fallbackIconUrl(appName, fileName) {
  const text = `${appName || ""} ${fileName || ""}`.toLowerCase();
  if (text.includes("古诗") || text.includes("诗词") || text.includes("poetry")) {
    return "/icons/poetry-archive.png";
  }
  return "";
}

function splitList(value) {
  return String(value || "")
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value) {
  return (Array.isArray(value) ? value : splitList(value)).join("\n");
}

function metadataFromForm(formData) {
  return {
    appName: String(formData.get("appName") || "Android 软件包"),
    version: String(formData.get("version") || ""),
    iconUrl: String(formData.get("iconUrl") || "").trim(),
    shortDescription: String(formData.get("shortDescription") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    tags: splitList(formData.get("tags")),
    developerName: String(formData.get("developerName") || "").trim(),
    packageName: String(formData.get("packageName") || "").trim(),
    minAndroidVersion: String(formData.get("minAndroidVersion") || "").trim(),
    permissions: splitList(formData.get("permissions")),
    featureImageUrl: String(formData.get("featureImageUrl") || "").trim(),
    screenshots: splitList(formData.get("screenshots")),
    releaseNotes: String(formData.get("releaseNotes") || "").trim(),
    websiteUrl: String(formData.get("websiteUrl") || "").trim(),
    supportEmail: String(formData.get("supportEmail") || "").trim(),
    privacyPolicyUrl: String(formData.get("privacyPolicyUrl") || "").trim(),
  };
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

async function loadManageList() {
  elements.manageMessage.textContent = "正在读取软件包...";
  try {
    const response = await fetch(`/api/catalog?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error("无法读取软件包列表。");
    }
    const catalog = await response.json();
    catalogPackages = dedupePackages(Array.isArray(catalog.packages) ? catalog.packages : []);
    renderManageList();
  } catch (error) {
    elements.manageMessage.textContent = error.message || "读取失败。";
  }
}

function renderManageList() {
  elements.manageList.replaceChildren();
  elements.manageMessage.textContent = catalogPackages.length
    ? `共 ${catalogPackages.length} 个软件包。`
    : "还没有已发布的软件包。";
  const fragment = document.createDocumentFragment();
  catalogPackages.forEach((item) => {
    const row = elements.manageTemplate.content.cloneNode(true);
    const card = row.querySelector(".manage-card");
    card.dataset.objectKey = item.objectKey;
    renderIcon(card.querySelector(".software-icon"), item);
    card.querySelector("h3").textContent = item.appName || "Android 软件包";
    card.querySelector(".version-pill").textContent = item.version ? `v${item.version}` : "未标版本";
    card.querySelector(".muted").textContent = [
      item.fileName || "未命名文件",
      item.category || "",
      formatBytes(item.size),
      item.releaseDate || "",
    ].filter(Boolean).join(" · ");
    card.querySelector(".hash-text").textContent = item.sha256 ? `SHA-256 ${item.sha256}` : "未提供 SHA-256";
    card.querySelector(".edit-button").addEventListener("click", () => startEdit(item));
    card.querySelector(".delete-button").addEventListener("click", () => deletePackage(item));
    fragment.append(row);
  });
  elements.manageList.append(fragment);
}

function startEdit(item) {
  elements.editPanel.classList.remove("hidden");
  elements.editMessage.textContent = "";
  const form = elements.editForm;
  form.elements.objectKey.value = item.objectKey || "";
  form.elements.appName.value = item.appName || "";
  form.elements.version.value = item.version || "";
  form.elements.iconUrl.value = item.iconUrl || "";
  form.elements.shortDescription.value = item.shortDescription || "";
  form.elements.description.value = item.description || "";
  form.elements.category.value = item.category || "";
  form.elements.tags.value = joinList(item.tags);
  form.elements.developerName.value = item.developerName || "";
  form.elements.packageName.value = item.packageName || "";
  form.elements.minAndroidVersion.value = item.minAndroidVersion || "";
  form.elements.permissions.value = joinList(item.permissions);
  form.elements.featureImageUrl.value = item.featureImageUrl || "";
  form.elements.screenshots.value = joinList(item.screenshots);
  form.elements.releaseNotes.value = item.releaseNotes || "";
  form.elements.websiteUrl.value = item.websiteUrl || "";
  form.elements.supportEmail.value = item.supportEmail || "";
  form.elements.privacyPolicyUrl.value = item.privacyPolicyUrl || "";
  elements.editPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deletePackage(item) {
  const name = item.appName || item.fileName || "这个软件包";
  const confirmed = window.confirm(`确定删除“${name}”吗？这会从下载列表移除，并删除 R2 中的文件。`);
  if (!confirmed) {
    return;
  }
  elements.manageMessage.textContent = "正在删除...";
  try {
    const response = await fetch("/api/delete-package", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectKey: item.objectKey }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        setAuthenticated(false);
      }
      throw new Error(data.error || "删除失败。");
    }
    catalogPackages = dedupePackages(data.catalog?.packages || catalogPackages.filter((pkg) => pkg.objectKey !== item.objectKey));
    renderManageList();
    elements.manageMessage.textContent = `已删除“${name}”。`;
  } catch (error) {
    elements.manageMessage.textContent = error.message || "删除失败。";
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
    const metadata = metadataFromForm(formData);

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
        ...metadata,
        iconUrl: metadata.iconUrl || fallbackIconUrl(metadata.appName, file.name),
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
    await loadManageList();
  } catch (error) {
    setProgress(0, error.message || "上传失败。");
  } finally {
    submitButton.disabled = false;
  }
});

elements.refreshPackages.addEventListener("click", loadManageList);

elements.cancelEdit.addEventListener("click", () => {
  elements.editForm.reset();
  elements.editPanel.classList.add("hidden");
  elements.editMessage.textContent = "";
});

elements.editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = elements.editForm.querySelector("button[type='submit']");
  const formData = new FormData(elements.editForm);
  submitButton.disabled = true;
  elements.editMessage.textContent = "正在保存...";

  try {
    const response = await fetch("/api/update-package", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objectKey: String(formData.get("objectKey") || ""),
        patch: metadataFromForm(formData),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        setAuthenticated(false);
      }
      throw new Error(data.error || "保存失败。");
    }
    catalogPackages = dedupePackages(data.catalog?.packages || catalogPackages);
    renderManageList();
    elements.editMessage.textContent = "已保存修改。";
  } catch (error) {
    elements.editMessage.textContent = error.message || "保存失败。";
  } finally {
    submitButton.disabled = false;
  }
});

refreshSession();
