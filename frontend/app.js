const API_BASE = "/api";
const mockTableBody = document.querySelector("#mock-table-body");
const mockForm = document.querySelector("#mock-form");
const mockIdInput = document.querySelector("#mock-id");
const mockMethodInput = document.querySelector("#mock-method");
const mockPathInput = document.querySelector("#mock-path");
const mockStatusInput = document.querySelector("#mock-status");
const mockDelayInput = document.querySelector("#mock-delay");
const mockHeadersInput = document.querySelector("#mock-headers");
const mockBodyInput = document.querySelector("#mock-body");
const mockContentTypeInput = document.querySelector("#mock-content-type");
const editorTitle = document.querySelector("#editor-title");
const resetFormButton = document.querySelector("#reset-form");
const newMockButton = document.querySelector("#new-mock");
const logsBody = document.querySelector("#logs-body");
const proxyForm = document.querySelector("#proxy-form");
const proxyTargetInput = document.querySelector("#proxy-target");
const refreshLogsButton = document.querySelector("#refresh-logs");
const downloadLogsButton = document.querySelector("#download-logs");
const autoRefreshCheckbox = document.querySelector("#auto-refresh");
const shutdownButton = document.querySelector("#shutdown-button");
const logTemplate = document.querySelector("#log-row-template");

let autoRefreshInterval = null;

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function resetMockForm() {
  mockForm.reset();
  mockIdInput.value = "";
  mockStatusInput.value = 200;
  mockDelayInput.value = 0;
  editorTitle.textContent = "Create mock";
}

function serializeHeaders(value) {
  if (!value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.error("Invalid headers JSON", error);
  }
  throw new Error("Headers must be a JSON object");
}

function populateMockForm(mock) {
  mockIdInput.value = mock.id;
  mockMethodInput.value = mock.method;
  mockPathInput.value = mock.path;
  mockStatusInput.value = mock.status_code;
  mockDelayInput.value = mock.delay_ms ?? 0;
  mockContentTypeInput.value = mock.content_type ?? "";
  mockHeadersInput.value = JSON.stringify(mock.headers || {}, null, 2);
  mockBodyInput.value = mock.body ?? "";
  editorTitle.textContent = "Edit mock";
}

function getStatusBadgeClass(status) {
  if (status >= 200 && status < 300) {
    return "status-success";
  }
  if (status >= 300 && status < 400) {
    return "status-warning";
  }
  if (status >= 400) {
    return "status-error";
  }
  return "";
}

function getSourceBadgeClass(source) {
  const normalized = (source || "").toLowerCase();
  if (normalized.includes("mock")) {
    return "source-mock";
  }
  if (normalized.includes("proxy")) {
    return "source-proxy";
  }
  return "source-live";
}

function createMockRow(mock) {
  const tr = document.createElement("tr");

  const methodCell = document.createElement("td");
  const methodPill = document.createElement("span");
  const method = (mock.method || "").toUpperCase();
  methodPill.className = `method-pill ${method}`.trim();
  methodPill.textContent = method;
  methodCell.appendChild(methodPill);
  tr.appendChild(methodCell);

  const pathCell = document.createElement("td");
  const pathCode = document.createElement("code");
  pathCode.textContent = mock.path;
  pathCell.appendChild(pathCode);
  tr.appendChild(pathCell);

  const statusCell = document.createElement("td");
  const statusBadge = document.createElement("span");
  statusBadge.className = `badge ${getStatusBadgeClass(mock.status_code)}`.trim();
  statusBadge.textContent = mock.status_code;
  statusCell.appendChild(statusBadge);
  tr.appendChild(statusCell);

  const delayCell = document.createElement("td");
  delayCell.textContent = mock.delay_ms ?? 0;
  tr.appendChild(delayCell);

  const actionsCell = document.createElement("td");
  actionsCell.classList.add("table-actions");

  const editButton = document.createElement("button");
  editButton.dataset.action = "edit";
  editButton.textContent = "Edit";
  actionsCell.appendChild(editButton);

  const deleteButton = document.createElement("button");
  deleteButton.dataset.action = "delete";
  deleteButton.classList.add("secondary");
  deleteButton.textContent = "Delete";
  actionsCell.appendChild(deleteButton);

  tr.appendChild(actionsCell);

  editButton.addEventListener("click", () => {
    populateMockForm(mock);
    window.scrollTo({ top: mockForm.offsetTop - 20, behavior: "smooth" });
  });

  deleteButton.addEventListener("click", async () => {
    if (!confirm(`Delete mock ${mock.method} ${mock.path}?`)) {
      return;
    }
    try {
      await fetchJson(`/mocks/${encodeURIComponent(mock.id)}`, { method: "DELETE" });
      await loadMocks();
    } catch (error) {
      alert(error.message);
    }
  });

  return tr;
}

async function loadMocks() {
  try {
    const mocks = await fetchJson("/mocks");
    mockTableBody.innerHTML = "";
    mocks.forEach((mock) => {
      mockTableBody.appendChild(createMockRow(mock));
    });
  } catch (error) {
    console.error("Failed to load mocks", error);
  }
}

function formatTimestamp(value) {
  const date = new Date(value);
  return date.toISOString().replace("T", " ").replace("Z", "");
}

async function loadLogs() {
  try {
    const entries = await fetchJson("/logs");
    const existingRows = new Map(
      Array.from(logsBody.querySelectorAll("tr[data-log-id]")).map((row) => [row.dataset.logId, row]),
    );
    const fragment = document.createDocumentFragment();

    entries.forEach((entry) => {
      const id = String(entry.id);
      let row = existingRows.get(id);
      if (row) {
        existingRows.delete(id);
      } else {
        const clone = logTemplate.content.cloneNode(true);
        row = clone.querySelector("tr");
      }
      updateLogRow(row, entry);
      fragment.appendChild(row);
    });

    logsBody.innerHTML = "";
    logsBody.appendChild(fragment);
  } catch (error) {
    console.error("Failed to load logs", error);
  }
}

function updateLogRow(row, entry) {
  const details = row.querySelector("details");
  const wasOpen = details?.open ?? false;

  row.dataset.logId = String(entry.id);
  row.querySelector(".log-time").textContent = formatTimestamp(entry.timestamp);

  const methodPill = row.querySelector(".log-method .method-pill");
  const method = (entry.method || "").toUpperCase();
  methodPill.className = "method-pill";
  if (method) {
    methodPill.classList.add(method);
  }
  methodPill.textContent = method;

  row.querySelector(".log-path code").textContent = entry.path;

  const statusBadge = row.querySelector(".log-status .badge");
  statusBadge.className = "badge";
  statusBadge.textContent = entry.status_code;
  const statusClass = getStatusBadgeClass(entry.status_code);
  if (statusClass) {
    statusBadge.classList.add(statusClass);
  }

  const sourceBadge = row.querySelector(".log-source .badge");
  sourceBadge.className = "badge";
  sourceBadge.textContent = entry.source;
  const sourceClass = getSourceBadgeClass(entry.source);
  if (sourceClass) {
    sourceBadge.classList.add(sourceClass);
  }

  row.querySelector(".log-request-headers").textContent = JSON.stringify(entry.request_headers || {}, null, 2);
  row.querySelector(".log-request-body").textContent = entry.request_body ?? "";
  row.querySelector(".log-response-headers").textContent = JSON.stringify(entry.response_headers || {}, null, 2);
  row.querySelector(".log-response-body").textContent = entry.response_body ?? "";

  if (details) {
    details.open = wasOpen;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(loadLogs, 5000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

async function loadProxySettings() {
  try {
    const settings = await fetchJson("/settings/proxy");
    proxyTargetInput.value = settings.target_url ?? "";
  } catch (error) {
    console.error("Failed to load proxy settings", error);
  }
}

mockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const headers = serializeHeaders(mockHeadersInput.value || "{}");
    const payload = {
      method: mockMethodInput.value,
      path: mockPathInput.value,
      status_code: Number(mockStatusInput.value),
      delay_ms: Number(mockDelayInput.value || 0),
      headers,
      body: mockBodyInput.value,
      content_type: mockContentTypeInput.value || null,
    };

    const id = mockIdInput.value;
    if (id) {
      await fetchJson(`/mocks/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await fetchJson("/mocks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    resetMockForm();
    await loadMocks();
  } catch (error) {
    alert(error.message);
  }
});

resetFormButton.addEventListener("click", () => {
  resetMockForm();
});

newMockButton.addEventListener("click", () => {
  resetMockForm();
  window.scrollTo({ top: mockForm.offsetTop - 20, behavior: "smooth" });
});

proxyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await fetchJson("/settings/proxy", {
      method: "POST",
      body: JSON.stringify({ target_url: proxyTargetInput.value || null }),
    });
    alert("Proxy settings saved");
  } catch (error) {
    alert(error.message);
  }
});

refreshLogsButton.addEventListener("click", loadLogs);

downloadLogsButton.addEventListener("click", async () => {
  try {
    const entries = await fetchJson("/logs");
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.download = `mock-server-logs-${timestamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  }
});

autoRefreshCheckbox.addEventListener("change", () => {
  if (autoRefreshCheckbox.checked) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

shutdownButton.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to stop the server?")) {
    return;
  }
  try {
    await fetchJson("/server/shutdown", { method: "POST" });
    alert("Shutdown signal sent. The server will stop shortly.");
  } catch (error) {
    alert(error.message);
  }
});

loadProxySettings();
loadMocks();
loadLogs();
startAutoRefresh();

window.addEventListener("beforeunload", stopAutoRefresh);
