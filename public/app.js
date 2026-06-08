const elements = {
  status: document.querySelector("#site-status"),
  packageCount: document.querySelector("#package-count"),
  latestDate: document.querySelector("#latest-date"),
  featuredTitle: document.querySelector("#featured-title"),
  featuredVersion: document.querySelector("#featured-version"),
  featuredDownload: document.querySelector("#featured-download"),
  catalogNote: document.querySelector("#catalog-note"),
  packageList: document.querySelector("#package-list"),
  packageSearch: document.querySelector("#package-search"),
  template: document.querySelector("#package-card-template"),
};

let allPackages = [];

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

function downloadHref(item) {
  return `/api/download?key=${encodeURIComponent(item.objectKey)}`;
}

function renderFeatured(item) {
  if (!item) {
    elements.featuredTitle.textContent = "暂无软件包";
    elements.featuredVersion.textContent = "上传后会显示在这里";
    elements.featuredDownload.setAttribute("aria-disabled", "true");
    return;
  }
  elements.featuredTitle.textContent = item.appName || "Android 软件包";
  elements.featuredVersion.textContent = [
    item.version ? `版本 ${item.version}` : "",
    formatBytes(item.size),
    item.releaseDate || "",
  ].filter(Boolean).join(" · ");
  elements.featuredDownload.href = downloadHref(item);
  elements.featuredDownload.removeAttribute("aria-disabled");
}

function renderCard(item) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".software-card");
  card.querySelector("h3").textContent = item.appName || "Android 软件包";
  card.querySelector(".version-pill").textContent = item.version ? `v${item.version}` : "未标版本";
  card.querySelector('[data-field="fileName"]').textContent = item.fileName || "-";
  card.querySelector('[data-field="size"]').textContent = formatBytes(item.size);
  card.querySelector('[data-field="releaseDate"]').textContent = item.releaseDate || "-";
  card.querySelector(".hash-text").textContent = item.sha256 ? `SHA-256 ${item.sha256}` : "未提供 SHA-256";
  card.querySelector(".card-download").href = downloadHref(item);
  return fragment;
}

function renderPackageList(packages) {
  elements.packageList.replaceChildren();
  if (!packages.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = allPackages.length ? "没有匹配的软件包。" : "上传管理页发布软件包后，会自动出现在这里。";
    elements.packageList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  packages.forEach((item) => fragment.append(renderCard(item)));
  elements.packageList.append(fragment);
}

function applySearch() {
  const query = elements.packageSearch.value.trim().toLowerCase();
  const visiblePackages = query
    ? allPackages.filter((item) =>
        [item.appName, item.version, item.fileName, item.sha256]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : allPackages;
  elements.catalogNote.textContent = query
    ? `找到 ${visiblePackages.length} 个匹配项`
    : allPackages.length
      ? "选择需要的软件包下载。"
      : "还没有发布任何软件包。";
  renderPackageList(visiblePackages);
}

function renderCatalog(catalog) {
  allPackages = Array.isArray(catalog.packages) ? catalog.packages : [];
  elements.status.textContent = allPackages.length ? "可下载" : "暂无发布";
  elements.packageCount.textContent = String(allPackages.length);
  elements.latestDate.textContent = allPackages[0]?.releaseDate || "-";
  renderFeatured(allPackages[0]);
  applySearch();
}

async function loadCatalog() {
  try {
    const response = await fetch("/api/catalog");
    if (!response.ok) throw new Error("无法读取软件列表");
    renderCatalog(await response.json());
  } catch (error) {
    elements.status.textContent = "读取失败";
    elements.catalogNote.textContent = error.message || "读取失败";
  }
}

elements.packageSearch.addEventListener("input", applySearch);

loadCatalog();
