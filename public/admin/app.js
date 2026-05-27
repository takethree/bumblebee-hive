const packageViewStorageKey = "hive.inventory.view";
const packageViews = new Set(["package", "summary", "observations"]);

const state = {
  selectedDeviceId: "",
  autoRefreshTimer: 0,
  packageView: storedPackageView()
};

const el = {
  refresh: document.querySelector("#refresh"),
  autoRefresh: document.querySelector("#auto-refresh"),
  lastRefresh: document.querySelector("#last-refresh"),
  error: document.querySelector("#error"),
  deviceStatus: document.querySelector("#device-status"),
  runStatus: document.querySelector("#run-status"),
  runProfile: document.querySelector("#run-profile"),
  packageQuery: document.querySelector("#package-query"),
  packageEcosystem: document.querySelector("#package-ecosystem"),
  packageProfile: document.querySelector("#package-profile"),
  packageView: document.querySelectorAll('input[name="package-view"]'),
  healthConfig: document.querySelector("#health-config"),
  healthBody: document.querySelector("#health-body"),
  devicesBody: document.querySelector("#devices-body"),
  packagesBody: document.querySelector("#packages-body"),
  runsBody: document.querySelector("#runs-body"),
  detail: document.querySelector("#device-detail"),
  detailTitle: document.querySelector("#detail-title"),
  detailSummary: document.querySelector("#detail-summary"),
  detailPackagesBody: document.querySelector("#detail-packages-body"),
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

function applyUrlStateFromLocation() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  state.selectedDeviceId = deviceIdFromPath(url.pathname);
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

function currentAdminPath() {
  const url = new URL(window.location.href);
  url.pathname = state.selectedDeviceId ? `/admin/devices/${encodeURIComponent(state.selectedDeviceId)}` : "/admin/";
  url.search = "";
  const params = url.searchParams;
  setParamIfValue(params, "device_status", el.deviceStatus.value, "active");
  params.set("inventory_view", state.packageView);
  setParamIfValue(params, "package_query", el.packageQuery.value.trim());
  setParamIfValue(params, "ecosystem", el.packageEcosystem.value.trim());
  setParamIfValue(params, "profile", el.packageProfile.value.trim());
  setParamIfValue(params, "run_status", el.runStatus.value);
  setParamIfValue(params, "run_profile", el.runProfile.value.trim());
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
  const data = await getJSON(`/v1/ui/admin/devices?status=${status}&limit=50&offset=0`);
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
  const params = new URLSearchParams({ limit: "50", offset: "0" });
  if (state.selectedDeviceId) params.set("device_id", state.selectedDeviceId);
  if (el.runStatus.value) params.set("status", el.runStatus.value);
  if (el.runProfile.value.trim()) params.set("profile", el.runProfile.value.trim());
  const data = await getJSON(`/v1/ui/admin/runs?${params.toString()}`);
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
  const params = new URLSearchParams({ limit: "50", offset: "0" });
  params.set("view", state.packageView);
  if (state.selectedDeviceId) params.set("device_id", state.selectedDeviceId);
  if (el.packageQuery.value.trim()) params.set("query", el.packageQuery.value.trim());
  if (el.packageEcosystem.value.trim()) params.set("ecosystem", el.packageEcosystem.value.trim());
  if (el.packageProfile.value.trim()) params.set("profile", el.packageProfile.value.trim());
  const data = await getJSON(`/v1/ui/admin/packages?${params.toString()}`);
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
  const packageParams = new URLSearchParams({ limit: "50", offset: "0", view: state.packageView });
  const packages = await getJSON(`/v1/ui/admin/devices/${encodeURIComponent(deviceId)}/packages?${packageParams.toString()}`);
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
  syncUrlState("push");
  await loadDeviceDetail(deviceId);
}

el.refresh.addEventListener("click", refreshAll);
el.deviceStatus.addEventListener("change", () => {
  syncUrlState("replace");
  refreshAll();
});
el.runStatus.addEventListener("change", () => {
  syncUrlState("replace");
  loadRuns();
});
el.runProfile.addEventListener("change", () => {
  syncUrlState("replace");
  loadRuns();
});
el.packageQuery.addEventListener("input", () => {
  syncUrlState("replace");
  loadPackages();
});
el.packageEcosystem.addEventListener("change", () => {
  syncUrlState("replace");
  loadPackages();
});
el.packageProfile.addEventListener("change", () => {
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
  el.detail.hidden = true;
  syncUrlState("push");
  loadPackages();
  loadRuns();
});
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
