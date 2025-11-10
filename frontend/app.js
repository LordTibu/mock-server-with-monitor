const API_BASE = "/api";
const mockTableBody = document.querySelector("#mock-table-body");
const mockForm = document.querySelector("#mock-form");
const mockIdInput = document.querySelector("#mock-id");
const mockMethodInput = document.querySelector("#mock-method");
const mockPathInput = document.querySelector("#mock-path");
const mockStatusInput = document.querySelector("#mock-status");
const mockDelayInput = document.querySelector("#mock-delay");
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
const headersList = document.querySelector("#mock-headers-list");
const headersEmpty = document.querySelector("#headers-empty");
const addHeaderButton = document.querySelector("#add-header");
const mockBodyJsonToggle = document.querySelector("#mock-body-json");
const formatBodyButton = document.querySelector("#format-body");

let autoRefreshInterval = null;
const openLogDetails = new Set();

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
  headersList.innerHTML = "";
  addHeaderRow();
  mockBodyJsonToggle.checked = false;
  delete mockContentTypeInput.dataset.autofill;
  applyBodyJsonMode(false);
  updateHeadersEmptyState();
}

function updateHeadersEmptyState() {
  const hasRows = headersList.querySelectorAll(".key-value-row").length > 0;
  headersEmpty.hidden = hasRows;
}

function addHeaderRow(name = "", value = "") {
  const row = document.createElement("div");
  row.className = "key-value-row";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.placeholder = "Header name";
  keyInput.className = "header-key";
  keyInput.value = name;

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.placeholder = "Header value";
  valueInput.className = "header-value";
  valueInput.value = value;

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = "Remove";
  removeButton.className = "secondary small";
  removeButton.addEventListener("click", () => {
    row.remove();
    if (!headersList.querySelector(".key-value-row")) {
      addHeaderRow();
    }
    updateHeadersEmptyState();
  });

  row.append(keyInput, valueInput, removeButton);
  headersList.append(row);
  updateHeadersEmptyState();
  return row;
}

function collectHeaders() {
  const headers = {};
  headersList.querySelectorAll(".key-value-row").forEach((row) => {
    const key = row.querySelector(".header-key").value.trim();
    const value = row.querySelector(".header-value").value;
    if (key) {
      headers[key] = value;
    }
  });
  return headers;
}

function shouldTreatBodyAsJson(contentType, body) {
  if (contentType && contentType.toLowerCase().includes("json")) {
    return true;
  }
  if (!body) {
    return false;
  }
  try {
    JSON.parse(body);
    return true;
  } catch (error) {
    return false;
  }
}

function formatBodyAsJson({ silent = false } = {}) {
  const bodyValue = mockBodyInput.value.trim();
  if (!bodyValue) {
    return true;
  }
  try {
    const parsed = JSON.parse(bodyValue);
    mockBodyInput.value = JSON.stringify(parsed, null, 2);
    return true;
  } catch (error) {
    if (!silent) {
      alert("Body is not valid JSON");
    }
    return false;
  }
}

function applyBodyJsonMode(enabled) {
  if (enabled) {
    if (!mockContentTypeInput.value.trim()) {
      mockContentTypeInput.value = "application/json";
      mockContentTypeInput.dataset.autofill = "1";
    }
    const isValid = formatBodyAsJson({ silent: true });
    mockBodyInput.setCustomValidity(
      isValid ? "" : "Body must be valid JSON when the JSON option is enabled."
    );
  } else if (mockContentTypeInput.dataset.autofill === "1") {
    mockContentTypeInput.value = "";
    delete mockContentTypeInput.dataset.autofill;
    mockBodyInput.setCustomValidity("");
  } else {
    mockBodyInput.setCustomValidity("");
  }
}

function populateMockForm(mock) {
  mockIdInput.value = mock.id;
  mockMethodInput.value = mock.method;
  mockPathInput.value = mock.path;
  mockStatusInput.value = mock.status_code;
  mockDelayInput.value = mock.delay_ms ?? 0;
  mockContentTypeInput.value = mock.content_type ?? "";
  delete mockContentTypeInput.dataset.autofill;
  headersList.innerHTML = "";
  const entries = Object.entries(mock.headers || {});
  if (entries.length) {
    entries.forEach(([key, value]) => {
      addHeaderRow(key, value);
    });
  } else {
    addHeaderRow();
  }
  const shouldFormatJson = shouldTreatBodyAsJson(mock.content_type, mock.body);
  mockBodyInput.value = mock.body ?? "";
  mockBodyJsonToggle.checked = shouldFormatJson;
  applyBodyJsonMode(shouldFormatJson);
  updateHeadersEmptyState();
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
  const row = fragment.querySelector("tr");
  row.dataset.logId = entry.id;
  fragment.querySelector(".log-time").textContent = formatTimestamp(entry.timestamp);
  fragment.querySelector(".log-method").textContent = entry.method;
  fragment.querySelector(".log-path").textContent = entry.path;
  fragment.querySelector(".log-status").textContent = entry.status_code;
  fragment.querySelector(".log-source").textContent = entry.source;
  fragment.querySelector(".log-request-headers").textContent = JSON.stringify(entry.request_headers || {}, null, 2);
  fragment.querySelector(".log-request-body").textContent = entry.request_body || "";
  fragment.querySelector(".log-response-headers").textContent = JSON.stringify(entry.response_headers || {}, null, 2);
  fragment.querySelector(".log-response-body").textContent = entry.response_body || "";
  const details = fragment.querySelector("details");
  if (openLogDetails.has(entry.id)) {
    details.open = true;
  }
  details.addEventListener("toggle", () => {
    if (details.open) {
      openLogDetails.add(entry.id);
    } else {
      openLogDetails.delete(entry.id);
    }
  });
  return fragment;
}

async function loadLogs() {
  try {
    const entries = await fetchJson("/logs");
    const currentIds = new Set(entries.map((entry) => entry.id));
    Array.from(openLogDetails).forEach((logId) => {
      if (!currentIds.has(logId)) {
        openLogDetails.delete(logId);
      }
    });
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
    const headers = collectHeaders();
    const treatBodyAsJson = mockBodyJsonToggle.checked;
    let bodyValue = mockBodyInput.value;
    if (treatBodyAsJson && bodyValue.trim()) {
      try {
        bodyValue = JSON.stringify(JSON.parse(bodyValue), null, 2);
        mockBodyInput.value = bodyValue;
      } catch (error) {
        throw new Error("Body must be valid JSON when the JSON option is enabled");
      }
    }
    const payload = {
      method: mockMethodInput.value,
      path: mockPathInput.value,
      status_code: Number(mockStatusInput.value),
      delay_ms: Number(mockDelayInput.value || 0),
      headers,
      body: bodyValue,
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

addHeaderButton.addEventListener("click", () => {
  const newRow = addHeaderRow();
  const keyInput = newRow.querySelector(".header-key");
  if (keyInput) {
    keyInput.focus();
  }
});

mockBodyJsonToggle.addEventListener("change", () => {
  applyBodyJsonMode(mockBodyJsonToggle.checked);
});

formatBodyButton.addEventListener("click", () => {
  const success = formatBodyAsJson();
  if (success) {
    mockBodyInput.setCustomValidity("");
    if (!mockBodyJsonToggle.checked) {
      mockBodyJsonToggle.checked = true;
      applyBodyJsonMode(true);
    }
  } else if (mockBodyJsonToggle.checked) {
    mockBodyInput.setCustomValidity(
      "Body must be valid JSON when the JSON option is enabled."
    );
  }
});

mockContentTypeInput.addEventListener("input", () => {
  delete mockContentTypeInput.dataset.autofill;
});

mockBodyInput.addEventListener("input", () => {
  if (!mockBodyJsonToggle.checked) {
    mockBodyInput.setCustomValidity("");
    return;
  }
  const trimmed = mockBodyInput.value.trim();
  if (!trimmed) {
    mockBodyInput.setCustomValidity("");
    return;
  }
  try {
    JSON.parse(trimmed);
    mockBodyInput.setCustomValidity("");
  } catch (error) {
    mockBodyInput.setCustomValidity(
      "Body must be valid JSON when the JSON option is enabled."
    );
  }
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

resetMockForm();
loadProxySettings();
loadMocks();
loadLogs();
startAutoRefresh();

window.addEventListener("beforeunload", stopAutoRefresh);
