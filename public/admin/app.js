const state = {
  selectedDeviceId: "",
  autoRefreshTimer: 0
};

const el = {
  refresh: document.querySelector("#refresh"),
  autoRefresh: document.querySelector("#auto-refresh"),
  lastRefresh: document.querySelector("#last-refresh"),
  error: document.querySelector("#error"),
  deviceStatus: document.querySelector("#device-status"),
  runStatus: document.querySelector("#run-status"),
  runProfile: document.querySelector("#run-profile"),
  healthConfig: document.querySelector("#health-config"),
  healthBody: document.querySelector("#health-body"),
  devicesBody: document.querySelector("#devices-body"),
  runsBody: document.querySelector("#runs-body"),
  detail: document.querySelector("#device-detail"),
  detailTitle: document.querySelector("#detail-title"),
  detailSummary: document.querySelector("#detail-summary"),
  detailRunsBody: document.querySelector("#detail-runs-body"),
  detailEventsBody: document.querySelector("#detail-events-body"),
  lifecycleReason: document.querySelector("#lifecycle-reason"),
  disableDevice: document.querySelector("#disable-device"),
  enableDevice: document.querySelector("#enable-device"),
  clearDevice: document.querySelector("#clear-device")
};

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
  await loadRuns();
}

async function refreshAll() {
  el.error.hidden = true;
  try {
    await Promise.all([loadOverview(), loadHealth(), loadDevices(), loadRuns()]);
    el.lastRefresh.textContent = `Last refreshed ${new Date().toLocaleString()}`;
  } catch (error) {
    el.error.textContent = error instanceof Error ? error.message : "Unable to load admin metadata.";
    el.error.hidden = false;
  }
}

el.refresh.addEventListener("click", refreshAll);
el.deviceStatus.addEventListener("change", refreshAll);
el.runStatus.addEventListener("change", loadRuns);
el.runProfile.addEventListener("change", loadRuns);
el.clearDevice.addEventListener("click", () => {
  state.selectedDeviceId = "";
  el.detail.hidden = true;
  loadRuns();
});
el.disableDevice.addEventListener("click", () => lifecycleAction("disable"));
el.enableDevice.addEventListener("click", () => lifecycleAction("enable"));
el.devicesBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-device-id]");
  if (row) loadDeviceDetail(row.dataset.deviceId);
});
el.healthBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-device-id]");
  if (row) loadDeviceDetail(row.dataset.deviceId);
});
el.autoRefresh.addEventListener("change", () => {
  if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
  state.autoRefreshTimer = el.autoRefresh.checked ? setInterval(refreshAll, 30000) : 0;
});

refreshAll();

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
