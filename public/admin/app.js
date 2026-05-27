const packageViewStorageKey = "hive.inventory.view";
const packageViews = new Set(["package", "summary", "observations"]);
const pageSizes = new Set([10, 25, 50, 100]);
const pageSizeStorageKeys = {
  devicePageSize: "hive.devices.page.size",
  runPageSize: "hive.runs.page.size",
  inventoryPageSize: "hive.inventory.page.size",
  detailInventoryPageSize: "hive.detail.inventory.page.size"
};

const state = {
  selectedDeviceId: "",
  autoRefreshTimer: 0,
  packageView: storedPackageView(),
  devicePageSize: storedPageSize("devicePageSize"),
  runPageSize: storedPageSize("runPageSize"),
  inventoryPageSize: storedPageSize("inventoryPageSize"),
  detailInventoryPageSize: storedPageSize("detailInventoryPageSize"),
  devicePage: 1,
  runPage: 1,
  inventoryPage: 1,
  detailInventoryPage: 1
};

const el = {
  refresh: document.querySelector("#refresh"),
  autoRefresh: document.querySelector("#auto-refresh"),
  lastRefresh: document.querySelector("#last-refresh"),
  error: document.querySelector("#error"),
  devicePageSize: document.querySelector("#device-page-size"),
  deviceStatus: document.querySelector("#device-status"),
  runStatus: document.querySelector("#run-status"),
  runProfile: document.querySelector("#run-profile"),
  runPageSize: document.querySelector("#run-page-size"),
  packageQuery: document.querySelector("#package-query"),
  packageEcosystem: document.querySelector("#package-ecosystem"),
  packageProfile: document.querySelector("#package-profile"),
  inventoryPageSize: document.querySelector("#inventory-page-size"),
  packageView: document.querySelectorAll('input[name="package-view"]'),
  healthConfig: document.querySelector("#health-config"),
  healthBody: document.querySelector("#health-body"),
  devicesBody: document.querySelector("#devices-body"),
  devicesPagination: document.querySelector("#devices-pagination"),
  packagesBody: document.querySelector("#packages-body"),
  packagesPagination: document.querySelector("#packages-pagination"),
  runsBody: document.querySelector("#runs-body"),
  runsPagination: document.querySelector("#runs-pagination"),
  detail: document.querySelector("#device-detail"),
  detailTitle: document.querySelector("#detail-title"),
  detailSummary: document.querySelector("#detail-summary"),
  detailPackagesBody: document.querySelector("#detail-packages-body"),
  detailPackagesPagination: document.querySelector("#detail-packages-pagination"),
  detailInventoryPageSize: document.querySelector("#detail-inventory-page-size"),
  detailRunsBody: document.querySelector("#detail-runs-body"),
  detailEventsBody: document.querySelector("#detail-events-body"),
  lifecycleReason: document.querySelector("#lifecycle-reason"),
  disableDevice: document.querySelector("#disable-device"),
  enableDevice: document.querySelector("#enable-device"),
  clearDevice: document.querySelector("#clear-device")
};

function storedPackageView() {
  try {
    const value = localStorage.getItem(packageViewStorageKey);
    return packageViews.has(value) ? value : "package";
  } catch {
    return "package";
  }
}

function pageSizeFromValue(value, fallback = 10) {
  const size = Number.parseInt(String(value || ""), 10);
  return pageSizes.has(size) ? size : fallback;
}

function storedPageSize(stateKey) {
  try {
    return pageSizeFromValue(localStorage.getItem(pageSizeStorageKeys[stateKey]), 10);
  } catch {
    return 10;
  }
}

function syncPageSizeControls() {
  el.devicePageSize.value = String(state.devicePageSize);
  el.runPageSize.value = String(state.runPageSize);
  el.inventoryPageSize.value = String(state.inventoryPageSize);
  el.detailInventoryPageSize.value = String(state.detailInventoryPageSize);
}

function text(id, value) {
  document.querySelector(id).textContent = value;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatHours(value) {
  return value === null || value === undefined ? "-" : `${Number(value).toLocaleString()}h`;
}

function shortId(value) {
  if (!value) return "-";
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function statusBadge(value) {
  const status = value || "unknown";
  return `<span class="status ${classToken(status)}">${escapeHtml(status)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function classToken(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
}

async function getJSON(path) {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    credentials: "same-origin"
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with ${response.status}`);
  }
  return response.json();
}

function showError(error) {
  el.error.textContent = error instanceof Error ? error.message : "Unable to load admin metadata.";
  el.error.hidden = false;
}

async function postJSON(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}

function decodedPathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function deviceIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/admin\/devices\/([^/]+)\/?$/);
  return match ? decodedPathSegment(match[1]) : "";
}

function setSelectValue(select, value, fallback) {
  const allowed = [...select.options].some((option) => option.value === value);
  select.value = allowed ? value : fallback;
}

function pageFromParams(params, name) {
  const page = Number.parseInt(params.get(name) || "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function offsetForPage(page, limit) {
  return (Math.max(1, page) - 1) * limit;
}

function resetPages() {
  state.devicePage = 1;
  state.runPage = 1;
  state.inventoryPage = 1;
  state.detailInventoryPage = 1;
}

function applyUrlStateFromLocation() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  state.selectedDeviceId = deviceIdFromPath(url.pathname);
  state.devicePageSize = pageSizeFromValue(params.get("device_page_size") || params.get("page_size"), storedPageSize("devicePageSize"));
  state.runPageSize = pageSizeFromValue(params.get("run_page_size") || params.get("page_size"), storedPageSize("runPageSize"));
  state.inventoryPageSize = pageSizeFromValue(params.get("inventory_page_size") || params.get("page_size"), storedPageSize("inventoryPageSize"));
  state.detailInventoryPageSize = pageSizeFromValue(params.get("detail_inventory_page_size") || params.get("page_size"), storedPageSize("detailInventoryPageSize"));
  syncPageSizeControls();
  state.devicePage = pageFromParams(params, "device_page");
  state.runPage = pageFromParams(params, "run_page");
  state.inventoryPage = pageFromParams(params, "inventory_page");
  state.detailInventoryPage = pageFromParams(params, "detail_inventory_page");
  setSelectValue(el.deviceStatus, params.get("device_status") || "active", "active");
  setSelectValue(el.runStatus, params.get("run_status") || "", "");
  el.runProfile.value = params.get("run_profile") || "";
  el.packageQuery.value = params.get("package_query") || "";
  el.packageEcosystem.value = params.get("ecosystem") || "";
  el.packageProfile.value = params.get("profile") || "";
  const urlPackageView = params.get("inventory_view") || "";
  state.packageView = packageViews.has(urlPackageView) ? urlPackageView : storedPackageView();
}

function setParamIfValue(params, name, value, defaultValue = "") {
  if (value && value !== defaultValue) {
    params.set(name, value);
  }
}

function setPageParam(params, name, value) {
  if (value > 1) {
    params.set(name, String(value));
  }
}

function setPageSizeParam(params, name, value) {
  if (value !== 10) {
    params.set(name, String(value));
  }
}

function currentAdminPath() {
  const url = new URL(window.location.href);
  url.pathname = state.selectedDeviceId ? `/admin/devices/${encodeURIComponent(state.selectedDeviceId)}` : "/admin/";
  url.search = "";
  const params = url.searchParams;
  setPageSizeParam(params, "device_page_size", state.devicePageSize);
  setParamIfValue(params, "device_status", el.deviceStatus.value, "active");
  setPageParam(params, "device_page", state.devicePage);
  params.set("inventory_view", state.packageView);
  setParamIfValue(params, "package_query", el.packageQuery.value.trim());
  setParamIfValue(params, "ecosystem", el.packageEcosystem.value.trim());
  setParamIfValue(params, "profile", el.packageProfile.value.trim());
  setPageSizeParam(params, "inventory_page_size", state.inventoryPageSize);
  setPageParam(params, "inventory_page", state.inventoryPage);
  setParamIfValue(params, "run_status", el.runStatus.value);
  setParamIfValue(params, "run_profile", el.runProfile.value.trim());
  setPageSizeParam(params, "run_page_size", state.runPageSize);
  setPageParam(params, "run_page", state.runPage);
  if (state.selectedDeviceId) {
    setPageSizeParam(params, "detail_inventory_page_size", state.detailInventoryPageSize);
    setPageParam(params, "detail_inventory_page", state.detailInventoryPage);
  }
  return `${url.pathname}${url.search}`;
}

function syncUrlState(mode = "replace") {
  const next = currentAdminPath();
  const current = `${window.location.pathname}${window.location.search}`;
  if (next === current) return;
  if (mode === "push") {
    window.history.pushState({}, "", next);
  } else {
    window.history.replaceState({}, "", next);
  }
}

function paginationPages(page, pageCount) {
  if (pageCount <= 0) return [];
  const pages = new Set([1, pageCount]);
  for (let candidate = page - 2; candidate <= page + 2; candidate++) {
    if (candidate >= 1 && candidate <= pageCount) {
      pages.add(candidate);
    }
  }
  return [...pages].sort((left, right) => left - right);
}

function renderPagination(container, data, pageKey) {
  if (!container) return;
  const page = Number(data.page || state[pageKey] || 1);
  const pageCount = Number(data.page_count || 0);
  const total = Number(data.total || 0);
  const pages = paginationPages(page, pageCount);
  const pageButtons = pages.map((candidate, index) => {
    const previous = pages[index - 1];
    const gap = previous && candidate - previous > 1 ? '<span class="page-gap">...</span>' : "";
    return `${gap}<button type="button" data-page="${candidate}" ${candidate === page ? 'aria-current="page"' : ""}>${candidate}</button>`;
  }).join("");
  container.innerHTML = `
    <span>${formatNumber(total)} total · Page ${formatNumber(page)}${pageCount ? ` of ${formatNumber(pageCount)}` : ""}</span>
    <div class="page-buttons">
      <button type="button" data-page="1" ${page <= 1 || pageCount <= 0 ? "disabled" : ""}>First</button>
      <button type="button" data-page="${Math.max(1, page - 1)}" ${page <= 1 || pageCount <= 0 ? "disabled" : ""}>Prev</button>
      ${pageButtons}
      <button type="button" data-page="${Math.min(pageCount || 1, page + 1)}" ${!data.has_more ? "disabled" : ""}>Next</button>
      <button type="button" data-page="${pageCount || 1}" ${!data.has_more ? "disabled" : ""}>Last</button>
    </div>
  `;
}

async function setPage(pageKey, page, loader) {
  state[pageKey] = Math.max(1, Number(page) || 1);
  syncUrlState("push");
  await loader();
}

async function setPageSize(stateKey, pageKey, select, loader) {
  state[stateKey] = pageSizeFromValue(select.value, 10);
  select.value = String(state[stateKey]);
  try {
    localStorage.setItem(pageSizeStorageKeys[stateKey], String(state[stateKey]));
  } catch {
    // Browser storage can be unavailable in restricted contexts.
  }
  state[pageKey] = 1;
  syncUrlState("replace");
  await loader();
}

async function loadOverview() {
  const overview = await getJSON("/v1/ui/admin/overview");
  text("#metric-devices", formatNumber(overview.devices.total));
  text("#metric-device-detail", `active ${formatNumber(overview.devices.active)} / disabled ${formatNumber(overview.devices.disabled)}`);
  text("#metric-runs", formatNumber(overview.runs.total));
  text("#metric-run-detail", `complete ${formatNumber(overview.runs.complete)}`);
  text("#metric-batches", formatNumber(overview.batches.total));
  text("#metric-records", `records ${formatNumber(overview.batches.records)}`);
  text("#metric-latest", formatTime(overview.runs.latest_received_at));
}

async function loadHealth() {
  const data = await getJSON("/v1/ui/admin/health");
  text("#health-healthy", formatNumber(data.counts.healthy));
  text("#health-stale", formatNumber(data.counts.stale));
  text("#health-attention", formatNumber(data.counts.attention));
  text("#health-unknown", formatNumber(data.counts.unknown));
  el.healthConfig.textContent = `${data.config.profile} every ${data.config.expected_cadence_hours}h / stale after ${data.config.stale_hours}h / weekend grace ${data.config.weekend_grace_hours}h`;
  if (data.devices.length === 0) {
    el.healthBody.innerHTML = '<tr><td colspan="6">No active devices found.</td></tr>';
    return;
  }
  el.healthBody.innerHTML = data.devices.map((device) => `
    <tr data-device-id="${escapeHtml(device.device_id)}">
      <td>${statusBadge(device.health)}</td>
      <td title="${escapeHtml(device.device_id)}">${escapeHtml(shortId(device.device_id))}</td>
      <td>${device.last_run ? `${escapeHtml(device.last_run.status || "-")}<br>${escapeHtml(formatTime(device.last_run.received_at))}` : "-"}</td>
      <td>${escapeHtml(formatHours(device.age_hours))}</td>
      <td>${escapeHtml(formatHours(device.stale_after_hours))}</td>
      <td>${escapeHtml(reasonLabel(device.reason))}</td>
    </tr>
  `).join("");
}

async function loadDevices() {
  const status = encodeURIComponent(el.deviceStatus.value);
  const data = await getJSON(`/v1/ui/admin/devices?status=${status}&limit=${state.devicePageSize}&offset=${offsetForPage(state.devicePage, state.devicePageSize)}`);
  state.devicePage = data.page || state.devicePage;
  renderPagination(el.devicesPagination, data, "devicePage");
  if (data.devices.length === 0) {
    el.devicesBody.innerHTML = '<tr><td colspan="6">No devices found.</td></tr>';
    return;
  }
  el.devicesBody.innerHTML = data.devices.map((device) => `
    <tr data-device-id="${escapeHtml(device.device_id)}">
      <td title="${escapeHtml(device.device_id)}">${escapeHtml(shortId(device.device_id))}</td>
      <td>${statusBadge(device.status)}</td>
      <td>${formatNumber(device.run_count)}</td>
      <td>${formatNumber(device.batch_count)}</td>
      <td>${formatNumber(device.record_count)}</td>
      <td>${device.last_run ? `${escapeHtml(device.last_run.profile || "-")} / ${escapeHtml(device.last_run.status || "-")}<br>${escapeHtml(formatTime(device.last_run.received_at))}` : "-"}</td>
    </tr>
  `).join("");
}

async function loadRuns() {
  const params = new URLSearchParams({ limit: String(state.runPageSize), offset: String(offsetForPage(state.runPage, state.runPageSize)) });
  if (state.selectedDeviceId) params.set("device_id", state.selectedDeviceId);
  if (el.runStatus.value) params.set("status", el.runStatus.value);
  if (el.runProfile.value.trim()) params.set("profile", el.runProfile.value.trim());
  const data = await getJSON(`/v1/ui/admin/runs?${params.toString()}`);
  state.runPage = data.page || state.runPage;
  renderPagination(el.runsPagination, data, "runPage");
  if (data.runs.length === 0) {
    el.runsBody.innerHTML = '<tr><td colspan="7">No runs found.</td></tr>';
    return;
  }
  el.runsBody.innerHTML = data.runs.map((run) => `
    <tr>
      <td title="${escapeHtml(run.run_id)}">${escapeHtml(shortId(run.run_id))}</td>
      <td title="${escapeHtml(run.device_id)}">${escapeHtml(shortId(run.device_id))}</td>
      <td>${escapeHtml(run.profile || "-")}</td>
      <td>${statusBadge(run.status)}</td>
      <td>${formatNumber(run.batch_count)}</td>
      <td>${formatNumber(run.record_count)}</td>
      <td>${escapeHtml(formatTime(run.received_at))}</td>
    </tr>
  `).join("");
}

function listLabel(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "";
}

function packageSourceLabel(pkg) {
  const summary = [
    listLabel(pkg.package_managers),
    listLabel(pkg.source_types),
    listLabel(pkg.root_kinds)
  ].filter(Boolean).join(" / ");
  return summary || [pkg.package_manager, pkg.source_type, pkg.root_kind].filter(Boolean).join(" / ") || "-";
}

function packageOccurrenceCount(pkg) {
  return formatNumber(pkg.total_occurrence_count || pkg.occurrence_count || 1);
}

function packageObservedAt(pkg) {
  return pkg.latest_observed_at || pkg.observed_at;
}

function packageName(pkg) {
  const name = pkg.normalized_name || pkg.package_name || "-";
  return pkg.requested_spec ? `${escapeHtml(name)}<br><small>${escapeHtml(pkg.requested_spec)}</small>` : escapeHtml(name);
}

function packageVersionCell(pkg) {
  if (Array.isArray(pkg.versions)) {
    const versions = pkg.versions;
    if (versions.length === 0) {
      return "-";
    }
    const detail = versions.map((version) => `
      <div class="version-line">
        <strong>${escapeHtml(version.version || "-")}</strong>
        <span>${formatNumber(version.occurrence_count)}x</span>
        <small>${escapeHtml(packageSourceLabel(version))}</small>
      </div>
    `).join("");
    return `<details class="version-details">
      <summary>${formatNumber(pkg.version_count || versions.length)} versions</summary>
      ${detail}
    </details>`;
  }
  return escapeHtml(pkg.version || "-");
}

function syncPackageViewControls() {
  el.packageView.forEach((input) => {
    input.checked = input.value === state.packageView;
  });
}

async function loadPackages() {
  const params = new URLSearchParams({ limit: String(state.inventoryPageSize), offset: String(offsetForPage(state.inventoryPage, state.inventoryPageSize)) });
  params.set("view", state.packageView);
  if (state.selectedDeviceId) params.set("device_id", state.selectedDeviceId);
  if (el.packageQuery.value.trim()) params.set("query", el.packageQuery.value.trim());
  if (el.packageEcosystem.value.trim()) params.set("ecosystem", el.packageEcosystem.value.trim());
  if (el.packageProfile.value.trim()) params.set("profile", el.packageProfile.value.trim());
  const data = await getJSON(`/v1/ui/admin/packages?${params.toString()}`);
  state.inventoryPage = data.page || state.inventoryPage;
  renderPagination(el.packagesPagination, data, "inventoryPage");
  if (data.packages.length === 0) {
    el.packagesBody.innerHTML = '<tr><td colspan="8">No current packages found.</td></tr>';
    return;
  }
  el.packagesBody.innerHTML = data.packages.map((pkg) => `
    <tr data-device-id="${escapeHtml(pkg.device_id)}">
      <td>${packageName(pkg)}</td>
      <td>${escapeHtml(pkg.ecosystem || "-")}</td>
      <td>${packageVersionCell(pkg)}</td>
      <td title="${escapeHtml(pkg.device_id)}">${escapeHtml(shortId(pkg.device_id))}</td>
      <td>${escapeHtml(pkg.profile || "-")}</td>
      <td>${packageOccurrenceCount(pkg)}</td>
      <td>${escapeHtml(packageSourceLabel(pkg))}</td>
      <td>${escapeHtml(formatTime(packageObservedAt(pkg)))}</td>
    </tr>
  `).join("");
}

async function loadDeviceDetail(deviceId) {
  state.selectedDeviceId = deviceId;
  const data = await getJSON(`/v1/ui/admin/devices/${encodeURIComponent(deviceId)}`);
  el.detail.hidden = false;
  el.detailTitle.textContent = `Device ${shortId(data.device.device_id)}`;
  el.detailSummary.innerHTML = [
    ["Status", data.device.status],
    ["Runs", formatNumber(data.device.run_count)],
    ["Batches", formatNumber(data.device.batch_count)],
    ["Records", formatNumber(data.device.record_count)]
  ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  el.disableDevice.hidden = data.device.status !== "active";
  el.enableDevice.hidden = data.device.status !== "disabled";
  el.detailEventsBody.innerHTML = (data.lifecycle_events || []).length === 0
    ? '<tr><td colspan="4">No lifecycle events.</td></tr>'
    : data.lifecycle_events.map((event) => `
      <tr>
        <td>${statusBadge(event.action)}</td>
        <td>${escapeHtml(event.actor_id || event.actor_type || "-")}</td>
        <td>${escapeHtml(event.reason || "-")}</td>
        <td>${escapeHtml(formatTime(event.created_at))}</td>
      </tr>
    `).join("");
  await loadDevicePackages(deviceId);
  el.detailRunsBody.innerHTML = data.recent_runs.length === 0
    ? '<tr><td colspan="6">No recent runs.</td></tr>'
    : data.recent_runs.map((run) => `
      <tr>
        <td title="${escapeHtml(run.run_id)}">${escapeHtml(shortId(run.run_id))}</td>
        <td>${escapeHtml(run.profile || "-")}</td>
        <td>${statusBadge(run.status)}</td>
        <td>${formatNumber(run.batch_count)}</td>
        <td>${formatNumber(run.record_count)}</td>
        <td>${escapeHtml(formatTime(run.received_at))}</td>
      </tr>
  `).join("");
  await Promise.all([loadPackages(), loadRuns()]);
}

async function loadDevicePackages(deviceId = state.selectedDeviceId) {
  if (!deviceId) return;
  const packageParams = new URLSearchParams({
    limit: String(state.detailInventoryPageSize),
    offset: String(offsetForPage(state.detailInventoryPage, state.detailInventoryPageSize)),
    view: state.packageView
  });
  const packages = await getJSON(`/v1/ui/admin/devices/${encodeURIComponent(deviceId)}/packages?${packageParams.toString()}`);
  state.detailInventoryPage = packages.page || state.detailInventoryPage;
  renderPagination(el.detailPackagesPagination, packages, "detailInventoryPage");
  el.detailPackagesBody.innerHTML = packages.packages.length === 0
    ? '<tr><td colspan="7">No current packages.</td></tr>'
    : packages.packages.map((pkg) => `
      <tr>
        <td>${packageName(pkg)}</td>
        <td>${escapeHtml(pkg.ecosystem || "-")}</td>
        <td>${packageVersionCell(pkg)}</td>
        <td>${escapeHtml(pkg.profile || "-")}</td>
        <td>${packageOccurrenceCount(pkg)}</td>
        <td>${escapeHtml(packageSourceLabel(pkg))}</td>
        <td>${escapeHtml(formatTime(packageObservedAt(pkg)))}</td>
      </tr>
    `).join("");
}

async function refreshAll() {
  el.error.hidden = true;
  try {
    await Promise.all([loadOverview(), loadHealth(), loadDevices(), loadPackages(), loadRuns()]);
    el.lastRefresh.textContent = `Last refreshed ${new Date().toLocaleString()}`;
  } catch (error) {
    showError(error);
  }
}

async function restoreFromLocation() {
  el.error.hidden = true;
  try {
    applyUrlStateFromLocation();
    syncPackageViewControls();
    if (!state.selectedDeviceId) {
      el.detail.hidden = true;
    }
    await refreshAll();
    if (state.selectedDeviceId) {
      await loadDeviceDetail(state.selectedDeviceId);
    }
  } catch (error) {
    showError(error);
  }
}

async function selectDevice(deviceId) {
  state.selectedDeviceId = deviceId;
  resetPages();
  state.devicePage = pageFromParams(new URL(window.location.href).searchParams, "device_page");
  syncUrlState("push");
  await loadDeviceDetail(deviceId);
}

el.refresh.addEventListener("click", refreshAll);
el.devicePageSize.addEventListener("change", () => setPageSize("devicePageSize", "devicePage", el.devicePageSize, loadDevices));
el.deviceStatus.addEventListener("change", () => {
  state.devicePage = 1;
  syncUrlState("replace");
  refreshAll();
});
el.runPageSize.addEventListener("change", () => setPageSize("runPageSize", "runPage", el.runPageSize, loadRuns));
el.runStatus.addEventListener("change", () => {
  state.runPage = 1;
  syncUrlState("replace");
  loadRuns();
});
el.runProfile.addEventListener("change", () => {
  state.runPage = 1;
  syncUrlState("replace");
  loadRuns();
});
el.inventoryPageSize.addEventListener("change", () => setPageSize("inventoryPageSize", "inventoryPage", el.inventoryPageSize, loadPackages));
el.packageQuery.addEventListener("input", () => {
  state.inventoryPage = 1;
  syncUrlState("replace");
  loadPackages();
});
el.packageEcosystem.addEventListener("change", () => {
  state.inventoryPage = 1;
  syncUrlState("replace");
  loadPackages();
});
el.packageProfile.addEventListener("change", () => {
  state.inventoryPage = 1;
  syncUrlState("replace");
  loadPackages();
});
el.packageView.forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked || !packageViews.has(input.value)) return;
    state.packageView = input.value;
    try {
      localStorage.setItem(packageViewStorageKey, state.packageView);
    } catch {
      // Browser storage can be unavailable in restricted contexts.
    }
    state.inventoryPage = 1;
    state.detailInventoryPage = 1;
    syncUrlState("replace");
    if (state.selectedDeviceId && !el.detail.hidden) {
      loadDeviceDetail(state.selectedDeviceId);
    } else {
      loadPackages();
    }
  });
});
el.clearDevice.addEventListener("click", () => {
  state.selectedDeviceId = "";
  resetPages();
  el.detail.hidden = true;
  syncUrlState("push");
    loadPackages();
    loadRuns();
});
el.detailInventoryPageSize.addEventListener("change", () => setPageSize("detailInventoryPageSize", "detailInventoryPage", el.detailInventoryPageSize, () => loadDevicePackages()));
el.disableDevice.addEventListener("click", () => lifecycleAction("disable"));
el.enableDevice.addEventListener("click", () => lifecycleAction("enable"));
el.devicesBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-device-id]");
  if (row) selectDevice(row.dataset.deviceId);
});
el.healthBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-device-id]");
  if (row) selectDevice(row.dataset.deviceId);
});
el.packagesBody.addEventListener("click", (event) => {
  if (event.target.closest("details, summary, button, input, select, a")) return;
  const row = event.target.closest("tr[data-device-id]");
  if (row) selectDevice(row.dataset.deviceId);
});
el.devicesPagination.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");
  if (button) setPage("devicePage", button.dataset.page, loadDevices);
});
el.packagesPagination.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");
  if (button) setPage("inventoryPage", button.dataset.page, loadPackages);
});
el.runsPagination.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");
  if (button) setPage("runPage", button.dataset.page, loadRuns);
});
el.detailPackagesPagination.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");
  if (button) setPage("detailInventoryPage", button.dataset.page, () => loadDevicePackages());
});
el.autoRefresh.addEventListener("change", () => {
  if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
  state.autoRefreshTimer = el.autoRefresh.checked ? setInterval(refreshAll, 30000) : 0;
});
window.addEventListener("popstate", restoreFromLocation);

restoreFromLocation();

if (globalThis.__hiveAdminTesting) {
  globalThis.__hiveAdminTest = {
    applyUrlStateFromLocation,
    currentAdminPath,
    deviceIdFromPath,
    restoreFromLocation,
    selectDevice,
    setPage,
    setPageSize,
    state,
    syncUrlState
  };
}

async function lifecycleAction(action) {
  if (!state.selectedDeviceId) return;
  const reason = el.lifecycleReason.value.trim();
  if (!reason) {
    el.error.textContent = "Reason is required.";
    el.error.hidden = false;
    el.lifecycleReason.focus();
    return;
  }
  if (!confirm(`${action === "disable" ? "Disable" : "Enable"} this device?`)) {
    return;
  }
  el.error.hidden = true;
  try {
    await postJSON(`/v1/ui/admin/devices/${encodeURIComponent(state.selectedDeviceId)}/${action}`, { reason });
    el.lifecycleReason.value = "";
    await Promise.all([loadOverview(), loadHealth(), loadDevices(), loadDeviceDetail(state.selectedDeviceId)]);
    el.lastRefresh.textContent = `Last refreshed ${new Date().toLocaleString()}`;
  } catch (error) {
    el.error.textContent = error instanceof Error ? error.message : "Unable to update device.";
    el.error.hidden = false;
  }
}

function reasonLabel(value) {
  return {
    latest_complete_run_recent: "recent complete run",
    latest_complete_run_within_weekend_grace: "within weekend grace",
    latest_complete_run_too_old: "latest complete run is stale",
    latest_run_not_complete: "latest run needs attention",
    no_monitored_profile_run: "no monitored run yet"
  }[value] || value || "-";
}
