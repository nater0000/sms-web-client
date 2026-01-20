// web-client/app.js

// --- CONFIGURATION ---
const BRIDGE_BASE_URL = "__BRIDGE_URL_PLACEHOLDER__"; 

// Constants for LocalStorage keys
const KEY_SECRET = "bridge_secret";
const KEY_NAME = "bridge_name";
const KEY_DEFAULTS = "bridge_recipients"; // The Service's fixed list
const KEY_MANUAL_DRAFT = "bridge_manual_draft"; // The user's typed input (Auto-Save)
const KEY_HISTORY = "bridge_msg_history";

document.addEventListener("DOMContentLoaded", () => {
    checkSession();
    
    const msgInput = document.getElementById("input-message");
    const recInput = document.getElementById("input-additional");
    const charCount = document.getElementById("char-count");

    // 1. Character Counter
    msgInput.addEventListener("input", (e) => {
        charCount.innerText = `${e.target.value.length} chars`;
    });

    // 2. Ctrl+Enter to Send
    msgInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault(); 
            sendMessage();
        }
    });

    // 3. Auto-Save Manual Recipients
    // We restore it on load (in checkSession) and save on input
    recInput.addEventListener("input", (e) => {
        localStorage.setItem(KEY_MANUAL_DRAFT, e.target.value);
    });
    
    // Login Enter Keys
    document.getElementById("input-passphrase").addEventListener("keypress", (e) => {
        if(e.key === "Enter") doUnlock();
    });
    document.getElementById("input-secret").addEventListener("keypress", (e) => {
        if(e.key === "Enter") doManualUnlock();
    });
});

// --- NAVIGATION ---
function showManualView() {
    document.getElementById("view-login").classList.add("hidden");
    document.getElementById("view-manual").classList.remove("hidden");
    document.getElementById("input-secret").focus();
}

function showPassphraseView() {
    document.getElementById("view-manual").classList.add("hidden");
    document.getElementById("view-login").classList.remove("hidden");
    document.getElementById("input-passphrase").focus();
}

// --- AUTHENTICATION ---
async function doUnlock() {
    const phrase = document.getElementById("input-passphrase").value.trim();
    const errDiv = document.getElementById("login-error");
    
    if(!phrase) return;
    errDiv.innerText = "Verifying...";
    
    try {
        const res = await fetch(`${BRIDGE_BASE_URL}/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passphrase: phrase })
        });
        
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || "Unlock failed");
        
        localStorage.setItem(KEY_SECRET, data.webhook_secret);
        localStorage.setItem(KEY_NAME, data.display_name);
        localStorage.setItem(KEY_DEFAULTS, JSON.stringify(data.recipients));
        
        // Clear previous manual drafts when switching services to avoid confusion
        localStorage.removeItem(KEY_MANUAL_DRAFT);

        checkSession();
        errDiv.innerText = "";
        document.getElementById("input-passphrase").value = "";
        
    } catch (e) {
        console.error(e);
        errDiv.innerText = "❌ " + e.message;
        if(e.message.includes("Failed to fetch")) {
            errDiv.innerText += " (Check Bridge URL/CORS)";
        }
        document.getElementById("input-passphrase").value = "";
    }
}

function doManualUnlock() {
    const secret = document.getElementById("input-secret").value.trim();
    if(!secret) return alert("Please enter the webhook secret.");

    localStorage.setItem(KEY_SECRET, secret);
    localStorage.setItem(KEY_NAME, "Manual Mode");
    localStorage.setItem(KEY_DEFAULTS, "[]");

    checkSession();
    document.getElementById("input-secret").value = "";
}

function checkSession() {
    const secret = localStorage.getItem(KEY_SECRET);
    
    if (secret) {
        document.getElementById("view-login").classList.add("hidden");
        document.getElementById("view-manual").classList.add("hidden");
        document.getElementById("view-app").classList.remove("hidden");
        
        document.getElementById("display-name").innerText = localStorage.getItem(KEY_NAME);
        
        // Load Service Defaults (Read Only)
        const defs = JSON.parse(localStorage.getItem(KEY_DEFAULTS) || "[]");
        const chipContainer = document.getElementById("active-group-list");
        
        chipContainer.innerHTML = ""; 
        if(defs.length > 0) {
            defs.forEach(num => {
                const badge = document.createElement("span");
                badge.className = "badge bg-secondary me-1";
                badge.innerText = num;
                chipContainer.appendChild(badge);
            });
            document.getElementById("group-container").classList.remove("hidden");
        } else {
            document.getElementById("group-container").classList.add("hidden");
        }

        // Restore Manual Draft (Auto-Save)
        const savedDraft = localStorage.getItem(KEY_MANUAL_DRAFT);
        if(savedDraft) {
            document.getElementById("input-additional").value = savedDraft;
        }
        
    } else {
        document.getElementById("view-app").classList.add("hidden");
        document.getElementById("view-manual").classList.add("hidden");
        document.getElementById("view-login").classList.remove("hidden");
    }
}

function doLogout() {
    localStorage.removeItem(KEY_SECRET);
    localStorage.removeItem(KEY_NAME);
    localStorage.removeItem(KEY_DEFAULTS);
    // We keep history and manual draft for convenience
    location.reload();
}

function resetRecipients() {
    if(confirm("Clear the Additional Recipients list?")) {
        document.getElementById("input-additional").value = "";
        localStorage.removeItem(KEY_MANUAL_DRAFT);
        document.getElementById("input-additional").focus();
    }
}

// --- MESSAGING ---
async function sendMessage() {
    const secret = localStorage.getItem(KEY_SECRET);
    const msg = document.getElementById("input-message").value.trim();
    const additionalVal = document.getElementById("input-additional").value.trim();
    
    if (!msg) return alert("Message is empty");

    const serviceRecipients = JSON.parse(localStorage.getItem(KEY_DEFAULTS) || "[]");
    
    let additionalRecipients = [];
    if (additionalVal) {
        // Split by comma OR newline, trim, and filter
        additionalRecipients = additionalVal.split(/[\n,]+/)
            .map(s => s.trim())
            .filter(s => s !== "");
            
        // Basic Phone Validation
        const invalid = additionalRecipients.filter(n => !/^[\d\+\-\(\)\s]+$/.test(n));
        if (invalid.length > 0) {
            return alert(`Invalid phone number format: ${invalid.join(", ")}`);
        }
    }

    const combinedSet = new Set([...serviceRecipients, ...additionalRecipients]);
    const finalTo = Array.from(combinedSet).join(",");

    if (!finalTo) {
        return alert("Error: No recipients specified.\n\nSince you are in Manual Mode (or the Service list is empty), you must add numbers in the 'Recipients' box.");
    }

    const btn = document.getElementById("btn-send");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

    try {
        const res = await fetch(`${BRIDGE_BASE_URL}/webhook`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-Secret": secret 
            },
            body: JSON.stringify({ message: msg, to: finalTo })
        });
        
        if(res.ok) {
            document.getElementById("input-message").value = "";
            document.getElementById("char-count").innerText = "0 chars";
            
            saveToHistory(msg); // Save success to history
            
            log(`Sent to ${combinedSet.size} recipients ✅`, "text-success");
        } else {
            const txt = await res.text();
            log("Error: " + txt, "text-danger");
        }
    } catch (e) {
        log("Network Error: " + e.message, "text-danger");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// --- HISTORY SYSTEM ---
function saveToHistory(msg) {
    let history = JSON.parse(localStorage.getItem(KEY_HISTORY) || "[]");
    // Remove if duplicate exists (move to top)
    history = history.filter(item => item !== msg);
    // Add to top
    history.unshift(msg);
    // Keep max 5
    if (history.length > 5) history.pop();
    
    localStorage.setItem(KEY_HISTORY, JSON.stringify(history));
}

function showHistory() {
    const history = JSON.parse(localStorage.getItem(KEY_HISTORY) || "[]");
    const list = document.getElementById("history-list");
    list.innerHTML = "";

    if (history.length === 0) {
        list.innerHTML = '<div class="p-3 text-center text-dim">No recent messages found.</div>';
    } else {
        history.forEach(msg => {
            const div = document.createElement("div");
            div.className = "history-item text-secondary small text-break";
            div.innerText = msg;
            div.onclick = () => {
                const box = document.getElementById("input-message");
                box.value = msg;
                // Trigger input event to update char count
                box.dispatchEvent(new Event('input'));
                
                // Close modal (Bootstrap native)
                const modalEl = document.getElementById('historyModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();
            };
            list.appendChild(div);
        });
    }

    const modal = new bootstrap.Modal(document.getElementById('historyModal'));
    modal.show();
}

function log(msg, colorClass="text-secondary") {
    const consoleDiv = document.getElementById("log-console");
    if(!consoleDiv) return;
    const ts = new Date().toLocaleTimeString();
    const div = document.createElement("div");
    div.className = colorClass;
    div.innerText = `[${ts}] ${msg}`;
    consoleDiv.prepend(div);
}
