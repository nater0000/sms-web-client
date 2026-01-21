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
        
        localStorage.removeItem(KEY_MANUAL_DRAFT); // Clear old drafts

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

    // --- NORMALIZATION HELPER ---
    // Returns clean number if valid (10 digits OR 11 digits starting with 1), else null.
    const processNumber = (raw) => {
        const n = raw.replace(/\D/g, ''); // Strip non-digits
        if (n.length === 10 || (n.length === 11 && n.startsWith('1'))) {
            return n;
        }
        return null;
    };

    // 1. Process Service Defaults (Normalize & Filter)
    const serviceRecipients = JSON.parse(localStorage.getItem(KEY_DEFAULTS) || "[]")
        .map(n => processNumber(n))
        .filter(n => n !== null);
    
    // 2. Process User Input (Normalize, Filter, & Warn)
    let additionalRecipients = [];
    let droppedNumbers = [];

    if (additionalVal) {
        const inputs = additionalVal.split(/[\n,]+/);
        inputs.forEach(str => {
            const s = str.trim();
            if (s === "") return;
            
            const valid = processNumber(s);
            if (valid) {
                additionalRecipients.push(valid);
            } else {
                droppedNumbers.push(s);
            }
        });
    }

    if (droppedNumbers.length > 0) {
        log(`⚠️ Filtered out ${droppedNumbers.length} invalid numbers: ${droppedNumbers.join(", ")}`, "text-warning");
    }

    // 3. Combine & De-duplicate (Set handles uniqueness of normalized strings)
    const combinedSet = new Set([...serviceRecipients, ...additionalRecipients]);
    const finalTo = Array.from(combinedSet).join(",");

    if (!finalTo) {
        return alert("Error: No valid recipients found.\n\nPlease check your numbers.");
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
        
        // --- AUTH HANDLING ---
        if (res.status === 401 || res.status === 403) {
            log("❌ Authentication Failed: Secret is invalid.", "text-danger");
            if(confirm("Authentication failed (Wrong Secret). Lock and try again?")) {
                doLogout();
            }
            return;
        }

        if(res.ok) {
            document.getElementById("input-message").value = "";
            document.getElementById("char-count").innerText = "0 chars";
            
            saveToHistory(msg);
            
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
    history = history.filter(item => item !== msg);
    history.unshift(msg);
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
                box.dispatchEvent(new Event('input'));
                const modal = bootstrap.Modal.getInstance(document.getElementById('historyModal'));
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
