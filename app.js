// web-client/app.js

// --- CONFIGURATION ---
// The GitHub Action 'web-deploy.yml' will replace this string with your secret.
// If running locally, you can temporarily change this to your VPS URL for testing.
const BRIDGE_BASE_URL = "__BRIDGE_URL_PLACEHOLDER__"; 

document.addEventListener("DOMContentLoaded", () => {
    checkSession();
    
    // Character counter
    document.getElementById("input-message").addEventListener("input", (e) => {
        document.getElementById("char-count").innerText = `${e.target.value.length} chars`;
    });
    
    // Enter key to unlock
    document.getElementById("input-passphrase").addEventListener("keypress", (e) => {
        if(e.key === "Enter") doUnlock();
    });
});

async function doUnlock() {
    const phrase = document.getElementById("input-passphrase").value.trim();
    const errDiv = document.getElementById("login-error");
    
    if(!phrase) return;
    errDiv.innerText = "Verifying...";
    
    try {
        // 1. Hit the Bridge to validate Passphrase
        const res = await fetch(`${BRIDGE_BASE_URL}/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passphrase: phrase })
        });
        
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || "Unlock failed");
        
        // 2. SUCCESS: The server returns the Secret and the Recipients
        localStorage.setItem("bridge_secret", data.webhook_secret);
        localStorage.setItem("bridge_name", data.display_name);
        localStorage.setItem("bridge_recipients", JSON.stringify(data.recipients));
        
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

function checkSession() {
    const secret = localStorage.getItem("bridge_secret");
    
    // Toggle Views based on if we have a secret (logged in)
    if (secret) {
        document.getElementById("view-login").classList.add("hidden");
        document.getElementById("view-app").classList.remove("hidden");
        
        // Update Header Name
        document.getElementById("display-name").innerText = localStorage.getItem("bridge_name");
        
        // Update "Active Group" Chips (Read Only)
        const defs = JSON.parse(localStorage.getItem("bridge_recipients") || "[]");
        const chipContainer = document.getElementById("active-group-list");
        
        if(chipContainer) {
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
        }
        
    } else {
        document.getElementById("view-app").classList.add("hidden");
        document.getElementById("view-login").classList.remove("hidden");
    }
}

function doLogout() {
    localStorage.clear();
    location.reload();
}

async function sendMessage() {
    const secret = localStorage.getItem("bridge_secret");
    const msg = document.getElementById("input-message").value.trim();
    
    // Get "Additional Recipients" input
    const additionalInput = document.getElementById("input-additional");
    const additionalVal = additionalInput ? additionalInput.value.trim() : "";
    
    if (!msg) return alert("Message is empty");

    // --- RECIPIENT LOGIC ---
    // 1. Get Service Defaults
    const serviceRecipients = JSON.parse(localStorage.getItem("bridge_recipients") || "[]");
    
    // 2. Get User Additions
    let additionalRecipients = [];
    if (additionalVal) {
        additionalRecipients = additionalVal.split(",").map(s => s.trim()).filter(s => s !== "");
    }

    // 3. Combine Unique Numbers
    const combinedSet = new Set([...serviceRecipients, ...additionalRecipients]);
    const finalTo = Array.from(combinedSet).join(",");

    // --- NEW VALIDATION: Ensure at least one recipient exists ---
    if (!finalTo) {
        log("❌ Error: No recipients! (Service list is empty & no additional numbers added)", "text-danger");
        return; 
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

function log(msg, colorClass="text-secondary") {
    const consoleDiv = document.getElementById("log-console");
    if(!consoleDiv) return;
    const ts = new Date().toLocaleTimeString();
    const div = document.createElement("div");
    div.className = colorClass;
    div.innerText = `[${ts}] ${msg}`;
    consoleDiv.prepend(div);
}
