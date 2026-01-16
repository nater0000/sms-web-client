// --- Constants & State ---
const STORAGE_KEY_URL = "voipms_bridge_url";
const STORAGE_KEY_SECRET = "voipms_bridge_secret";
const STORAGE_KEY_DEFAULTS = "voipms_bridge_defaults"; // New key

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    updateStatus();

    // Character Counter
    document.getElementById("input-message").addEventListener("input", (e) => {
        document.getElementById("char-count").innerText = `${e.target.value.length} chars`;
    });
});

// --- Settings Management ---
function loadSettings() {
    const url = localStorage.getItem(STORAGE_KEY_URL) || "";
    const secret = localStorage.getItem(STORAGE_KEY_SECRET) || "";
    const defaults = localStorage.getItem(STORAGE_KEY_DEFAULTS) || "";
    
    document.getElementById("cfg-url").value = url;
    document.getElementById("cfg-secret").value = secret;
    document.getElementById("cfg-defaults").value = defaults;
}

function saveSettings() {
    const url = document.getElementById("cfg-url").value.trim();
    const secret = document.getElementById("cfg-secret").value.trim();
    const defaults = document.getElementById("cfg-defaults").value.trim();

    if (!url || !secret) {
        alert("Bridge URL and Secret are required.");
        return;
    }

    localStorage.setItem(STORAGE_KEY_URL, url);
    localStorage.setItem(STORAGE_KEY_SECRET, secret);
    localStorage.setItem(STORAGE_KEY_DEFAULTS, defaults);

    // Close Modal
    const modalEl = document.getElementById('settingsModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();

    updateStatus();
    log("Configuration saved successfully.", "text-success");
}

function updateStatus() {
    const url = localStorage.getItem(STORAGE_KEY_URL);
    const alertBox = document.getElementById("connection-alert");
    
    if (!url) {
        alertBox.classList.remove("d-none");
    } else {
        alertBox.classList.add("d-none");
    }
}

// --- Sending Logic ---
async function sendMessage() {
    const url = localStorage.getItem(STORAGE_KEY_URL);
    const secret = localStorage.getItem(STORAGE_KEY_SECRET);
    
    // Get Inputs
    const recipientsRaw = document.getElementById("input-recipients").value.trim();
    const message = document.getElementById("input-message").value;
    const btn = document.getElementById("btn-send");

    // Validation 1: Config
    if (!url || !secret) {
        new bootstrap.Modal(document.getElementById('settingsModal')).show();
        return;
    }

    // Validation 2: Message Content
    if (!message) {
        log("Error: Message field is required.", "text-danger");
        return;
    }

    // Validation 3: Resolve Recipients
    let finalRecipients = [];
    
    if (recipientsRaw.length > 0) {
        // Use user input
        finalRecipients = recipientsRaw.split(",").map(s => s.trim()).filter(s => s.length > 0);
    } else {
        // Attempt to use defaults
        const defaultsRaw = localStorage.getItem(STORAGE_KEY_DEFAULTS) || "";
        if (defaultsRaw.length > 0) {
            finalRecipients = defaultsRaw.split(",").map(s => s.trim()).filter(s => s.length > 0);
            log("ℹ️ Input empty. Using configured default recipients.", "text-info");
        }
    }

    if (finalRecipients.length === 0) {
        log("Error: No recipients specified and no defaults configured.", "text-danger");
        return;
    }

    // Prepare Payload
    const payload = {
        contact: finalRecipients,
        message: message
    };

    // UI Lock
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

    log(`Sending to [${finalRecipients.join(", ")}]...`, "text-info");

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Secret": secret
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            log("✅ Success! Message queued for delivery.", "text-success");
            document.getElementById("input-message").value = ""; // Clear message only
            // We keep recipients cleared if they were empty, or keep them if typed
        } else {
            const errText = await response.text();
            log(`❌ Server Error (${response.status}): ${errText}`, "text-danger");
        }

    } catch (error) {
        log(`❌ Network Error: ${error.message}`, "text-danger");
        
        if (url.startsWith("http:") && window.location.protocol === "https:") {
            log("⚠️ MIXED CONTENT ERROR: You are accessing this site via HTTPS, but your Bridge is HTTP.", "text-warning");
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send-fill me-2"></i> Send Message';
    }
}

// --- Logging ---
function log(msg, colorClass = "text-light") {
    const consoleDiv = document.getElementById("log-console");
    const ts = new Date().toLocaleTimeString();
    
    const div = document.createElement("div");
    div.className = `log-entry ${colorClass}`;
    div.innerHTML = `<span class="text-dim me-2">[${ts}]</span> ${msg}`;
    
    consoleDiv.prepend(div);
}

function clearLog() {
    document.getElementById("log-console").innerHTML = "";
}
