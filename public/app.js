const elements = {
  status: document.querySelector("#site-status"),
  packageCount: document.querySelector("#package-count"),
  latestDate: document.querySelector("#latest-date"),
  featuredTitle: document.querySelector("#featured-title"),
  featuredVersion: document.querySelector("#featured-version"),
  featuredDownload: document.querySelector("#featured-download"),
  featuredIcon: document.querySelector("#featured-icon"),
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

function detailHref(item) {
  return `/app?key=${encodeURIComponent(item.objectKey)}`;
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

function renderFeatured(item) {
  if (!item) {
    elements.featuredTitle.textContent = "暂无软件包";
    elements.featuredVersion.textContent = "上传后会显示在这里";
    elements.featuredDownload.setAttribute("aria-disabled", "true");
    renderIcon(elements.featuredIcon, null);
    return;
  }
  elements.featuredTitle.textContent = item.appName || "Android 软件包";
  elements.featuredVersion.textContent = [
    item.version ? `版本 ${item.version}` : "",
    formatBytes(item.size),
    item.releaseDate || "",
  ].filter(Boolean).join(" · ");
  elements.featuredDownload.href = downloadHref(item);
  elements.featuredTitle.closest(".featured-package").onclick = (event) => {
    if (event.target.closest("a")) return;
    window.location.href = detailHref(item);
  };
  elements.featuredDownload.removeAttribute("aria-disabled");
  renderIcon(elements.featuredIcon, item);
}

function renderCard(item) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".software-card");
  card.querySelector("h3").textContent = item.appName || "Android 软件包";
  renderIcon(card.querySelector(".software-icon"), item);
  card.querySelector(".version-pill").textContent = item.version ? `v${item.version}` : "未标版本";
  card.querySelector('[data-field="category"]').textContent = item.category || "-";
  card.querySelector('[data-field="size"]').textContent = formatBytes(item.size);
  card.querySelector('[data-field="releaseDate"]').textContent = item.releaseDate || "-";
  const summary = card.querySelector(".software-summary");
  summary.textContent = item.shortDescription || item.description || item.fileName || "暂无简介";
  const tagList = card.querySelector(".tag-list");
  (Array.isArray(item.tags) ? item.tags : []).slice(0, 4).forEach((tag) => {
    const pill = document.createElement("span");
    pill.textContent = tag;
    tagList.append(pill);
  });
  card.querySelector(".hash-text").textContent = item.sha256 ? `SHA-256 ${item.sha256}` : "未提供 SHA-256";
  card.querySelector(".card-detail").href = detailHref(item);
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
        [
          item.appName,
          item.version,
          item.fileName,
          item.sha256,
          item.shortDescription,
          item.description,
          item.category,
          item.developerName,
          item.packageName,
          ...(Array.isArray(item.tags) ? item.tags : []),
        ]
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
  allPackages = dedupePackages(Array.isArray(catalog.packages) ? catalog.packages : []);
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
