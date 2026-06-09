const elements = {
  title: document.querySelector("#app-title"),
  hero: document.querySelector("#detail-hero"),
  short: document.querySelector("#detail-short"),
  category: document.querySelector("#detail-category"),
  icon: document.querySelector("#detail-icon"),
  feature: document.querySelector("#detail-feature"),
  tags: document.querySelector("#detail-tags"),
  download: document.querySelector("#detail-download"),
  description: document.querySelector("#detail-description"),
  links: document.querySelector("#detail-links"),
  version: document.querySelector("#detail-version"),
  size: document.querySelector("#detail-size"),
  releaseDate: document.querySelector("#detail-release-date"),
  fileName: document.querySelector("#detail-file-name"),
  sha: document.querySelector("#detail-sha"),
  developer: document.querySelector("#detail-developer"),
  packageName: document.querySelector("#detail-package-name"),
  minAndroid: document.querySelector("#detail-min-android"),
  permissions: document.querySelector("#detail-permissions"),
  releaseNotes: document.querySelector("#detail-release-notes"),
  screenshots: document.querySelector("#screenshot-list"),
  versions: document.querySelector("#version-list"),
};

function formatBytes(bytes) {
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function downloadHref(item) {
  return `/api/download?key=${encodeURIComponent(item.objectKey)}`;
}

function detailHref(item) {
  return `/app?key=${encodeURIComponent(item.objectKey)}`;
}

function appGroupKey(item) {
  return String(item.packageName || item.appName || item.objectKey || "")
    .trim()
    .toLowerCase();
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

function renderTags(tags) {
  elements.tags.replaceChildren();
  tags.forEach((tag) => {
    const pill = document.createElement("span");
    pill.textContent = tag;
    elements.tags.append(pill);
  });
}

function renderLinks(item) {
  elements.links.replaceChildren();
  [
    ["官网", item.websiteUrl],
    ["隐私政策", item.privacyPolicyUrl],
    ["支持邮箱", item.supportEmail ? `mailto:${item.supportEmail}` : ""],
  ].forEach(([label, href]) => {
    if (!href) return;
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    elements.links.append(link);
  });
}

function renderScreenshots(item) {
  const screenshots = normalizeList(item.screenshots);
  elements.screenshots.replaceChildren();
  if (!screenshots.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "暂无应用截图。";
    elements.screenshots.append(empty);
    return;
  }
  screenshots.forEach((url, index) => {
    const frame = document.createElement("figure");
    const image = document.createElement("img");
    image.src = url;
    image.alt = `${item.appName || "应用"} 截图 ${index + 1}`;
    image.loading = "lazy";
    image.decoding = "async";
    frame.append(image);
    elements.screenshots.append(frame);
  });
}

function renderVersions(current, packages) {
  elements.versions.replaceChildren();
  const versions = packages.filter((item) => appGroupKey(item) === appGroupKey(current));
  if (!versions.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "暂无版本历史。";
    elements.versions.append(empty);
    return;
  }
  versions.forEach((item) => {
    const row = document.createElement("article");
    row.className = "version-row";
    if (item.objectKey === current.objectKey) {
      row.classList.add("is-current");
    }
    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.version ? `版本 ${item.version}` : "未标版本";
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = [item.releaseDate || "", formatBytes(item.size), item.fileName || ""].filter(Boolean).join(" · ");
    const notes = document.createElement("p");
    notes.className = "version-notes";
    notes.textContent = item.releaseNotes || item.shortDescription || "暂无更新说明。";
    body.append(title, meta, notes);

    const actions = document.createElement("div");
    actions.className = "version-actions";
    const detail = document.createElement("a");
    detail.className = "button ghost";
    detail.href = detailHref(item);
    detail.textContent = item.objectKey === current.objectKey ? "当前版本" : "查看";
    const download = document.createElement("a");
    download.className = "button primary";
    download.href = downloadHref(item);
    download.textContent = "下载";
    actions.append(detail, download);
    row.append(body, actions);
    elements.versions.append(row);
  });
}

function renderDetail(item, packages) {
  document.title = `${item.appName || "应用详情"} - 软件下载中心`;
  elements.title.textContent = item.appName || "Android 软件包";
  elements.short.textContent = item.shortDescription || item.description || "暂无简介。";
  elements.category.textContent = item.category || item.platform || "Android";
  elements.download.href = downloadHref(item);
  elements.description.textContent = item.description || "暂无详细介绍。";
  elements.version.textContent = item.version || "未标版本";
  elements.size.textContent = formatBytes(item.size);
  elements.releaseDate.textContent = item.releaseDate || "-";
  elements.fileName.textContent = item.fileName || "-";
  elements.sha.textContent = item.sha256 || "未提供 SHA-256";
  elements.developer.textContent = item.developerName || "-";
  elements.packageName.textContent = item.packageName || "-";
  elements.minAndroid.textContent = item.minAndroidVersion || "-";
  elements.permissions.textContent = normalizeList(item.permissions).join("、") || "-";
  elements.releaseNotes.textContent = item.releaseNotes || "暂无更新日志。";
  renderIcon(elements.icon, item);
  renderTags(normalizeList(item.tags));
  renderLinks(item);
  renderScreenshots(item);
  renderVersions(item, packages);

  elements.feature.replaceChildren();
  elements.hero.classList.toggle("has-feature", Boolean(item.featureImageUrl));
  elements.feature.classList.toggle("has-feature-image", Boolean(item.featureImageUrl));
  if (item.featureImageUrl) {
    const image = document.createElement("img");
    image.src = item.featureImageUrl;
    image.alt = "";
    elements.feature.append(image);
  }
}

function renderError(message) {
  elements.title.textContent = "未找到应用";
  elements.short.textContent = message;
  elements.download.setAttribute("aria-disabled", "true");
  elements.download.removeAttribute("href");
}

async function loadDetail() {
  try {
    const requestedKey = new URLSearchParams(window.location.search).get("key");
    const response = await fetch(`/api/catalog?t=${Date.now()}`);
    if (!response.ok) throw new Error("无法读取应用目录。");
    const catalog = await response.json();
    const packages = Array.isArray(catalog.packages) ? catalog.packages : [];
    const item = requestedKey
      ? packages.find((packageItem) => packageItem.objectKey === requestedKey)
      : packages[0];
    if (!item) {
      renderError("这个应用可能已经下架，或链接不完整。");
      return;
    }
    renderDetail(item, packages);
  } catch (error) {
    renderError(error.message || "读取失败。");
  }
}

loadDetail();
