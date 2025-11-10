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

function createMockRow(mock) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${mock.method}</td>
    <td><code>${mock.path}</code></td>
    <td>${mock.status_code}</td>
    <td>${mock.delay_ms}</td>
    <td class="table-actions">
      <button data-action="edit">Edit</button>
      <button data-action="delete" class="secondary">Delete</button>
    </td>
  `;

  tr.querySelector('[data-action="edit"]').addEventListener("click", () => {
    populateMockForm(mock);
    window.scrollTo({ top: mockForm.offsetTop - 20, behavior: "smooth" });
  });

  tr.querySelector('[data-action="delete"]').addEventListener("click", async () => {
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

function renderLog(entry) {
  const fragment = logTemplate.content.cloneNode(true);
  fragment.querySelector(".log-time").textContent = formatTimestamp(entry.timestamp);
  fragment.querySelector(".log-method").textContent = entry.method;
  fragment.querySelector(".log-path").textContent = entry.path;
  fragment.querySelector(".log-status").textContent = entry.status_code;
  fragment.querySelector(".log-source").textContent = entry.source;
  fragment.querySelector(".log-request-headers").textContent = JSON.stringify(entry.request_headers || {}, null, 2);
  fragment.querySelector(".log-request-body").textContent = entry.request_body || "";
  fragment.querySelector(".log-response-headers").textContent = JSON.stringify(entry.response_headers || {}, null, 2);
  fragment.querySelector(".log-response-body").textContent = entry.response_body || "";
  return fragment;
}

async function loadLogs() {
  try {
    const entries = await fetchJson("/logs");
    logsBody.innerHTML = "";
    entries.forEach((entry) => {
      logsBody.appendChild(renderLog(entry));
    });
  } catch (error) {
    console.error("Failed to load logs", error);
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
