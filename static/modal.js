// ── CDN Panel — shared modal (confirm / alert) ────────────────────────────
(function () {
    // ── Inject DOM ────────────────────────────────────────────────────────────
    function inject() {
        const wrap = document.createElement("div");
        wrap.id = "cdn-modal";
        wrap.style.display = "none";
        wrap.innerHTML = `
<div id="cdn-modal-overlay">
    <div id="cdn-modal-box">
        <div id="cdn-modal-header">
            <div id="cdn-modal-icon-wrap">
                <svg id="cdn-modal-icon-svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"></svg>
            </div>
            <div class="cdn-modal-text">
                <p id="cdn-modal-title"></p>
                <p id="cdn-modal-msg"></p>
            </div>
        </div>
        <div id="cdn-modal-actions"></div>
    </div>
</div>`;
        document.body.appendChild(wrap);
    }

    // ── Icon paths ────────────────────────────────────────────────────────────
    const PATH_TRASH = "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";
    const PATH_INFO  = "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";

    let _resolve = null;

    // ── Open / close ──────────────────────────────────────────────────────────
    function open() {
        document.getElementById("cdn-modal").style.display = "block";
        requestAnimationFrame(() => requestAnimationFrame(() => {
            document.getElementById("cdn-modal-overlay").classList.add("cdn-modal-open");
        }));
    }

    function close() {
        document.getElementById("cdn-modal-overlay").classList.remove("cdn-modal-open");
        setTimeout(() => {
            const m = document.getElementById("cdn-modal");
            if (m) m.style.display = "none";
        }, 160);
    }

    // ── Populate content ──────────────────────────────────────────────────────
    function populate(title, message, iconClass, iconPath) {
        const iconWrap = document.getElementById("cdn-modal-icon-wrap");
        iconWrap.className = iconClass;  // "danger" or "info"
        document.getElementById("cdn-modal-icon-svg").innerHTML =
            `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"/>`;
        document.getElementById("cdn-modal-title").textContent = title;
        document.getElementById("cdn-modal-msg").textContent   = message;
    }

    // ── Public: cdnConfirm ────────────────────────────────────────────────────
    window.cdnConfirm = function (message, {
        title       = "Are you sure?",
        confirmText = "Delete",
        dangerous   = true,
    } = {}) {
        return new Promise(resolve => {
            _resolve = resolve;
            populate(title, message, dangerous ? "danger" : "info", dangerous ? PATH_TRASH : PATH_INFO);
            document.getElementById("cdn-modal-actions").innerHTML = `
                <button id="cdn-modal-cancel" class="cdn-modal-btn cdn-modal-btn-cancel">Cancel</button>
                <button id="cdn-modal-ok"     class="cdn-modal-btn ${dangerous ? "cdn-modal-btn-danger" : "cdn-modal-btn-primary"}">${confirmText}</button>`;
            document.getElementById("cdn-modal-cancel").onclick = () => { close(); resolve(false); };
            document.getElementById("cdn-modal-ok").onclick     = () => { close(); resolve(true);  };
            open();
            document.getElementById("cdn-modal-ok").focus();
        });
    };

    // ── Public: cdnAlert ──────────────────────────────────────────────────────
    window.cdnAlert = function (message, { title = "Error" } = {}) {
        return new Promise(resolve => {
            _resolve = resolve;
            populate(title, message, "info", PATH_INFO);
            document.getElementById("cdn-modal-actions").innerHTML = `
                <button id="cdn-modal-ok" class="cdn-modal-btn cdn-modal-btn-primary">OK</button>`;
            document.getElementById("cdn-modal-ok").onclick = () => { close(); resolve(); };
            open();
            document.getElementById("cdn-modal-ok").focus();
        });
    };

    // ── Keyboard ──────────────────────────────────────────────────────────────
    document.addEventListener("keydown", e => {
        const m = document.getElementById("cdn-modal");
        if (!m || m.style.display === "none") return;
        if (e.key === "Escape") {
            e.preventDefault();
            close();
            if (_resolve) { _resolve(false); _resolve = null; }
        }
        if (e.key === "Enter") {
            e.preventDefault();
            document.getElementById("cdn-modal-ok")?.click();
        }
    });

    // ── Init ──────────────────────────────────────────────────────────────────
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", inject);
    } else {
        inject();
    }
})();
