function initUpload(project, cdnBase) {
    // ── State ────────────────────────────────────────────────────────────────
    const selected    = new Set();  // "category:filename"
    let   stagedFiles = null;       // Array of File objects

    // ── DOM refs ─────────────────────────────────────────────────────────────
    const dropZone             = document.getElementById("drop-zone");
    const fileInput            = document.getElementById("file-input");
    const categorySelect       = document.getElementById("category-select");        // hidden native select
    const categoryTrigger      = document.getElementById("category-trigger");       // visible button
    const categoryTriggerLabel = document.getElementById("category-trigger-label"); // text inside trigger
    const categoryTriggerChev  = document.getElementById("category-trigger-chevron");
    const categoryDropdown     = document.getElementById("category-dropdown");
    const categoryHint         = document.getElementById("category-hint");
    const autoBadge            = document.getElementById("auto-badge");
    const stagedArea           = document.getElementById("staged-area");
    const stagedCount          = document.getElementById("staged-count");
    const stagedNames          = document.getElementById("staged-names");
    const clearStagedBtn       = document.getElementById("clear-staged-btn");
    const uploadBtn            = document.getElementById("upload-btn");
    const uploadProgress       = document.getElementById("upload-progress");
    const uploadProgressBar    = document.getElementById("upload-progress-bar");
    const uploadStatus         = document.getElementById("upload-status");
    const createCategoryBtn    = document.getElementById("create-category-btn");
    const newCategoryInput     = document.getElementById("new-category-input");
    const categoryStatus       = document.getElementById("category-status");
    const bulkBar              = document.getElementById("bulk-bar");
    const bulkCount            = document.getElementById("bulk-count");
    const bulkDeleteBtn        = document.getElementById("bulk-delete-btn");
    const bulkCancelBtn        = document.getElementById("bulk-cancel-btn");

    // ── Theme toggle ─────────────────────────────────────────────────────────
    document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.documentElement.classList.add("cdn-transitioning");
            const isDark = document.documentElement.classList.toggle("dark");
            localStorage.setItem("cdn-theme", isDark ? "dark" : "light");
            setTimeout(() => document.documentElement.classList.remove("cdn-transitioning"), 200);
        });
    });

    // ── Tabs ─────────────────────────────────────────────────────────────────
    const tabs   = document.querySelectorAll("[data-tab]");
    const panels = document.querySelectorAll("[data-panel]");

    function activateTab(name) {
        panels.forEach(p => p.classList.add("hidden"));
        tabs.forEach(t => t.classList.toggle("tab-active", t.dataset.tab === name));
        document.querySelector(`[data-panel="${name}"]`)?.classList.remove("hidden");
    }

    tabs.forEach(tab => tab.addEventListener("click", () => activateTab(tab.dataset.tab)));
    if (tabs.length) activateTab(tabs[0].dataset.tab);

    // ── Custom category dropdown ──────────────────────────────────────────────
    function openDropdown() {
        categoryDropdown?.classList.remove("hidden");
        categoryTriggerChev?.classList.add("rotate-180");
    }

    function closeDropdown() {
        categoryDropdown?.classList.add("hidden");
        categoryTriggerChev?.classList.remove("rotate-180");
    }

    function updateDropdownChecks(val) {
        document.querySelectorAll("[data-cat-check]").forEach(el => {
            el.classList.toggle("hidden", el.dataset.catCheck !== val);
        });
    }

    function setDropdownValue(val) {
        if (!categorySelect) return;
        categorySelect.value = val;
        if (categoryTriggerLabel) categoryTriggerLabel.textContent = val;
        updateDropdownChecks(val);
    }

    // Toggle dropdown on trigger click (stopPropagation prevents document close handler)
    categoryTrigger?.addEventListener("click", e => {
        e.stopPropagation();
        categoryDropdown?.classList.contains("hidden") ? openDropdown() : closeDropdown();
    });

    // Close on outside click
    document.addEventListener("click", closeDropdown);

    // Clicks inside dropdown don't bubble to document (prevents instant close)
    categoryDropdown?.addEventListener("click", e => e.stopPropagation());

    // Option selection
    document.querySelectorAll("[data-cat-option]").forEach(opt => {
        opt.addEventListener("click", () => {
            setDropdownValue(opt.dataset.catOption);
            removeAutoRing();
            updateUploadBtn();
            closeDropdown();
        });
    });

    // ── Auto-detect category ─────────────────────────────────────────────────
    function autoDetectCategory(files) {
        if (!files || !files.length) return;
        const ext      = "." + files[0].name.split(".").pop().toLowerCase();
        const detected = CATEGORY_MAP[ext];
        const options  = [...categorySelect.options].map(o => o.value);

        if (detected && options.includes(detected)) {
            setDropdownValue(detected);
            addAutoRing();
            setHint(`Auto-detected: ${detected}`, "brand");
        } else if (detected) {
            setHint(`Detected "${detected}" but that category doesn't exist yet — create it first.`, "amber");
        } else {
            setHint("Unknown file type — pick a category above.", "amber");
        }
        updateUploadBtn();
    }

    function addAutoRing() {
        categoryTrigger?.classList.add("ring-2", "ring-brand-500", "border-brand-500");
        autoBadge?.classList.remove("hidden");
    }

    function removeAutoRing() {
        categoryTrigger?.classList.remove("ring-2", "ring-brand-500", "border-brand-500");
        autoBadge?.classList.add("hidden");
    }

    function setHint(text, color) {
        if (!categoryHint) return;
        const map = {
            brand: "text-brand-500",
            amber:  "text-amber-500",
            slate:  "text-slate-400 dark:text-zinc-500",
        };
        categoryHint.textContent = text;
        categoryHint.className   = `text-xs mt-1.5 pointer-events-none transition-colors ${map[color] || map.slate}`;
    }

    // ── Staging ───────────────────────────────────────────────────────────────
    function stageFiles(files) {
        if (!files || !files.length) return;
        stagedFiles = files;
        autoDetectCategory(files);
        renderStagedArea(files);
    }

    function renderStagedArea(files) {
        if (!stagedArea) return;
        const shown = files.slice(0, 3).map(f => f.name).join(", ");
        const extra = files.length - 3;
        stagedCount.textContent = `${files.length} file${files.length > 1 ? "s" : ""} ready`;
        stagedNames.textContent = shown + (extra > 0 ? ` +${extra} more` : "");
        updateUploadBtn();
        stagedArea.classList.remove("hidden");
    }

    function updateUploadBtn() {
        if (!uploadBtn) return;
        const cat   = categorySelect?.value || "";
        const count = stagedFiles?.length || 0;
        uploadBtn.textContent = `Upload ${count} file${count > 1 ? "s" : ""} to "${cat}" →`;
    }

    function clearStaged() {
        stagedFiles = null;
        stagedArea?.classList.add("hidden");
        removeAutoRing();
        setHint("Auto-detected from file type — you can override above", "slate");
    }

    clearStagedBtn?.addEventListener("click", clearStaged);
    uploadBtn?.addEventListener("click", () => {
        if (stagedFiles) doUpload(stagedFiles);
    });

    // ── Drop zone ─────────────────────────────────────────────────────────────
    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", e => {
        e.preventDefault();
        dropZone.classList.add("border-brand-500", "bg-brand-500/5");
        dropZone.classList.remove("border-slate-200", "dark:border-zinc-700");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("border-brand-500", "bg-brand-500/5");
        dropZone.classList.add("border-slate-200", "dark:border-zinc-700");
    });

    dropZone.addEventListener("drop", e => {
        e.preventDefault();
        dropZone.classList.remove("border-brand-500", "bg-brand-500/5");
        dropZone.classList.add("border-slate-200", "dark:border-zinc-700");
        stageFiles([...e.dataTransfer.files]); // spread: DataTransfer FileList is live
    });

    fileInput.addEventListener("change", () => {
        const files = [...fileInput.files]; // spread BEFORE clearing — FileList is a live object
        fileInput.value = "";
        if (files.length) stageFiles(files);
    });

    // ── Upload with XHR progress ──────────────────────────────────────────────
    function doUpload(files) {
        const category = categorySelect.value;
        const form     = new FormData();
        for (const f of files) form.append("files", f);
        form.append("category", category);

        stagedArea?.classList.add("hidden");
        uploadProgress.classList.remove("hidden");
        uploadProgressBar.style.width = "0%";
        uploadProgressBar.className   = "bg-brand-500 h-full rounded-full transition-all duration-200 ease-out";
        uploadStatus.textContent      = `Uploading ${files.length} file${files.length > 1 ? "s" : ""} to ${category}…`;
        uploadStatus.className        = "text-xs text-slate-500 dark:text-zinc-400";

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/panel/projects/${project}/upload`);

        xhr.upload.addEventListener("progress", e => {
            if (e.lengthComputable) {
                uploadProgressBar.style.width = `${Math.round((e.loaded / e.total) * 90)}%`;
            }
        });

        xhr.addEventListener("load", () => {
            uploadProgressBar.style.width = "100%";
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.ok) {
                    const parts = [];
                    if (data.processed?.length) parts.push(`${data.processed.length} processed`);
                    if (data.uploaded?.length)  parts.push(`${data.uploaded.length} uploaded`);
                    if (data.skipped?.length)   parts.push(`${data.skipped.length} skipped`);
                    if (data.errors?.length)    parts.push(`${data.errors.length} errors`);
                    uploadStatus.textContent = parts.join(" · ") || "Done.";
                    uploadStatus.className   = "text-xs text-emerald-500";
                    uploadProgressBar.className = "bg-emerald-500 h-full rounded-full transition-all duration-200";
                    clearStaged();

                    // For image uploads: inject cards in-place (no page reload)
                    if (category === PROCESSED_CATEGORY && data.processed?.length) {
                        const grid = document.getElementById("image-grid");
                        if (grid) {
                            [...data.processed].reverse().forEach((img, i) => {
                                const c = buildImageCard(img.name, img.sizes, `new-${Date.now()}-${i}`);
                                grid.insertBefore(c, grid.firstChild);
                                bindNewCard(c);
                                bindSizePicker(c);
                            });
                            nudgeCount(category, data.processed.length);
                            // Reveal files container if it was hidden (empty state)
                            const emptyState    = document.querySelector(`[data-empty-state="${category}"]`);
                            const filesContainer = document.querySelector(`[data-files-container="${category}"]`);
                            if (emptyState)     emptyState.classList.add("hidden");
                            if (filesContainer) filesContainer.classList.remove("hidden");
                        }
                    } else {
                        // For non-image categories (fonts, docs, etc.) reload to show new rows
                        setTimeout(() => location.reload(), 1200);
                    }
                } else {
                    uploadStatus.textContent = `Error: ${data.error}`;
                    uploadStatus.className   = "text-xs text-red-500";
                    uploadProgressBar.className = "bg-red-500 h-full rounded-full";
                    uploadProgressBar.style.width = "100%";
                }
            } catch {
                uploadStatus.textContent = "Upload failed: invalid response";
                uploadStatus.className   = "text-xs text-red-500";
            }
        });

        xhr.addEventListener("error", () => {
            uploadStatus.textContent = "Upload failed: network error";
            uploadStatus.className   = "text-xs text-red-500";
            uploadProgressBar.className = "bg-red-500 h-full rounded-full";
        });

        xhr.send(form);
    }

    // ── Create category ───────────────────────────────────────────────────────
    createCategoryBtn.addEventListener("click", async () => {
        const name = newCategoryInput.value.trim().toLowerCase();
        if (!name) return;
        createCategoryBtn.disabled    = true;
        createCategoryBtn.textContent = "Creating…";
        try {
            const res  = await fetch(`/panel/projects/${project}/categories`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (data.ok) {
                categoryStatus.textContent = `'${name}' created.`;
                categoryStatus.className   = "text-xs text-emerald-500 sm:ml-1";
                setTimeout(() => location.reload(), 700);
            } else {
                categoryStatus.textContent = `Error: ${data.error}`;
                categoryStatus.className   = "text-xs text-red-500 sm:ml-1";
                createCategoryBtn.disabled    = false;
                createCategoryBtn.textContent = "+ Category";
            }
        } catch (err) {
            categoryStatus.textContent = `Failed: ${err.message}`;
            categoryStatus.className   = "text-xs text-red-500 sm:ml-1";
            createCategoryBtn.disabled    = false;
            createCategoryBtn.textContent = "+ Category";
        }
    });

    newCategoryInput.addEventListener("keydown", e => {
        if (e.key === "Enter") createCategoryBtn.click();
    });

    // ── Delete category (tab × button) ────────────────────────────────────────
    document.querySelectorAll("[data-delete-tab]").forEach(btn => {
        btn.addEventListener("click", async e => {
            e.stopPropagation();
            const cat = btn.dataset.deleteTab;
            if (!await cdnConfirm(`All files in "${cat}" will be permanently removed.`, { title: `Delete category "${cat}"?`, confirmText: "Delete category" })) return;
            btn.disabled = true;

            try {
                const res  = await fetch(`/panel/projects/${project}/categories/${cat}`, { method: "DELETE" });
                const data = await res.json();

                if (data.ok) {
                    const n   = data.deleted_files || 0;
                    const msg = n > 0
                        ? `Deleted "${cat}" (${n} file${n > 1 ? "s" : ""})`
                        : `Deleted "${cat}"`;
                    showToast(msg, "success");

                    // Was this the active panel?
                    const panel     = document.querySelector(`[data-panel="${cat}"]`);
                    const wasActive = panel && !panel.classList.contains("hidden");

                    // Remove tab group + panel
                    document.querySelector(`[data-tab-group="${cat}"]`)?.remove();
                    panel?.remove();

                    // Remove from dropdown
                    document.querySelector(`[data-cat-option="${cat}"]`)?.remove();

                    // Remove from hidden select
                    const opt = [...(categorySelect?.options || [])].find(o => o.value === cat);
                    if (opt) opt.remove();

                    // Switch to first remaining tab if this was active
                    if (wasActive) {
                        const firstTab = document.querySelector("[data-tab]");
                        if (firstTab) activateTab(firstTab.dataset.tab);
                    }

                    // If dropdown was showing deleted category, reset to first option
                    if (categoryTriggerLabel?.textContent === cat) {
                        const firstOpt = categorySelect?.options[0];
                        if (firstOpt) setDropdownValue(firstOpt.value);
                    }
                } else {
                    showToast(`Delete failed: ${data.error}`, "error");
                    btn.disabled = false;
                }
            } catch (err) {
                showToast(`Delete failed: ${err.message}`, "error");
                btn.disabled = false;
            }
        });
    });

    // ── Initialize missing default categories ────────────────────────────────
    const initCatBtn = document.getElementById("init-categories-btn");
    initCatBtn?.addEventListener("click", async () => {
        initCatBtn.disabled    = true;
        initCatBtn.textContent = "Initializing…";
        try {
            const res  = await fetch(`/panel/projects/${project}/init-categories`, { method: "POST" });
            const data = await res.json();
            if (data.ok) {
                showToast(`Created: ${data.created.join(", ") || "nothing new"}`, "success");
                setTimeout(() => location.reload(), 800);
            } else {
                showToast(`Failed: ${data.error}`, "error");
                initCatBtn.disabled    = false;
                initCatBtn.textContent = "Initialize";
            }
        } catch (err) {
            showToast(`Failed: ${err.message}`, "error");
            initCatBtn.disabled    = false;
            initCatBtn.textContent = "Initialize";
        }
    });

    // ── Copy URL with size picker ─────────────────────────────────────────────
    // Close all open size picker menus on any outside click
    document.addEventListener("click", () => {
        document.querySelectorAll(".cdn-size-picker-menu:not(.hidden)").forEach(m => m.classList.add("hidden"));
    });

    function bindSizePicker(container) {
        container.querySelectorAll(".cdn-size-picker-toggle").forEach(toggle => {
            toggle.addEventListener("click", e => {
                e.stopPropagation();
                const menu = toggle.parentElement?.querySelector(".cdn-size-picker-menu");
                if (!menu) return;
                // Close any other open menus first
                document.querySelectorAll(".cdn-size-picker-menu:not(.hidden)").forEach(m => {
                    if (m !== menu) m.classList.add("hidden");
                });
                menu.classList.toggle("hidden");
            });
        });
        container.querySelectorAll(".cdn-size-copy-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                const menu = btn.closest(".cdn-size-picker-menu");
                navigator.clipboard.writeText(btn.dataset.copyUrl).then(() => {
                    menu?.classList.add("hidden");
                    showToast("URL copied", "success");
                });
            });
        });
        // Also bind legacy [data-copy-url] buttons (static file table rows)
        container.querySelectorAll("[data-copy-url]:not(.cdn-size-copy-btn)").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                navigator.clipboard.writeText(btn.dataset.copyUrl).then(() => {
                    const orig = btn.innerHTML;
                    btn.innerHTML = `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
                    btn.classList.add("text-emerald-500");
                    showToast("URL copied", "success");
                    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove("text-emerald-500"); }, 1500);
                });
            });
        });
    }

    // Bind size pickers on all Jinja-rendered cards and static file table buttons
    bindSizePicker(document);

    // ── Single file delete ────────────────────────────────────────────────────
    document.querySelectorAll("[data-delete-file]").forEach(btn => {
        btn.addEventListener("click", async e => {
            e.stopPropagation();
            const filename = btn.dataset.deleteFile;
            const category = btn.dataset.deleteCategory;
            if (!await cdnConfirm(filename, { title: "Delete file?", confirmText: "Delete" })) return;
            btn.disabled = true;
            try {
                const res  = await fetch(`/panel/projects/${project}/${category}/${filename}`, { method: "DELETE" });
                const data = await res.json();
                if (data.ok) {
                    document.getElementById(btn.dataset.row)?.remove();
                    nudgeCount(category, -1);
                    checkEmptyState(category);
                    showToast(`Deleted ${filename}`, "success");
                } else {
                    showToast(`Delete failed: ${data.error}`, "error");
                    btn.disabled = false;
                }
            } catch (err) {
                showToast(`Delete failed: ${err.message}`, "error");
                btn.disabled = false;
            }
        });
    });

    // ── Bulk select ───────────────────────────────────────────────────────────
    document.querySelectorAll("[data-select-checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
            cb.checked ? selected.add(cb.dataset.selectCheckbox) : selected.delete(cb.dataset.selectCheckbox);
            cb.closest("[data-file-card]")?.classList.toggle("is-selected", cb.checked);
            refreshBulkBar();
        });
    });

    document.querySelectorAll("[data-select-all]").forEach(cb => {
        cb.addEventListener("change", () => {
            const cat = cb.dataset.selectAll;
            document.querySelectorAll(`[data-select-checkbox^="${cat}:"]`).forEach(itemCb => {
                itemCb.checked = cb.checked;
                cb.checked ? selected.add(itemCb.dataset.selectCheckbox)
                           : selected.delete(itemCb.dataset.selectCheckbox);
                itemCb.closest("[data-file-card]")?.classList.toggle("is-selected", cb.checked);
            });
            refreshBulkBar();
        });
    });

    function refreshBulkBar() {
        if (selected.size > 0) {
            bulkCount.textContent = `${selected.size} file${selected.size > 1 ? "s" : ""} selected`;
            bulkBar.classList.remove("translate-y-20", "opacity-0", "pointer-events-none");
        } else {
            bulkBar.classList.add("translate-y-20", "opacity-0", "pointer-events-none");
        }
    }

    bulkCancelBtn?.addEventListener("click", () => {
        document.querySelectorAll("[data-select-checkbox]").forEach(cb => {
            cb.checked = false;
            cb.closest("[data-file-card]")?.classList.remove("is-selected");
        });
        document.querySelectorAll("[data-select-all]").forEach(cb => { cb.checked = false; });
        selected.clear();
        refreshBulkBar();
    });

    bulkDeleteBtn?.addEventListener("click", async () => {
        if (!selected.size) return;
        const count = selected.size;
        if (!await cdnConfirm(`${count} file${count > 1 ? "s" : ""} will be permanently removed.`, { title: `Delete ${count} file${count > 1 ? "s" : ""}?`, confirmText: `Delete ${count}` })) return;
        bulkDeleteBtn.disabled    = true;
        bulkDeleteBtn.textContent = "Deleting…";
        const affectedCategories  = new Set();
        let deleted = 0;

        for (const key of [...selected]) {
            const colonIdx = key.indexOf(":");
            const category = key.slice(0, colonIdx);
            const filename = key.slice(colonIdx + 1);
            try {
                const res  = await fetch(`/panel/projects/${project}/${category}/${filename}`, { method: "DELETE" });
                const data = await res.json();
                if (data.ok) {
                    document.querySelector(`[data-select-checkbox="${key}"]`)?.closest("tr, [data-file-card]")?.remove();
                    selected.delete(key);
                    nudgeCount(category, -1);
                    affectedCategories.add(category);
                    deleted++;
                }
            } catch { /* continue */ }
        }

        affectedCategories.forEach(cat => checkEmptyState(cat));
        bulkDeleteBtn.disabled    = false;
        bulkDeleteBtn.textContent = "Delete selected";
        refreshBulkBar();
        if (deleted > 0) showToast(`Deleted ${deleted} file${deleted > 1 ? "s" : ""}`, "success");
    });

    // ── Helpers ───────────────────────────────────────────────────────────────
    function nudgeCount(category, delta) {
        const badge = document.querySelector(`[data-count="${category}"]`);
        if (!badge) return;
        badge.textContent = Math.max(0, parseInt(badge.textContent || "0") + delta);
    }

    function checkEmptyState(category) {
        const filesContainer = document.querySelector(`[data-files-container="${category}"]`);
        const emptyStateEl   = document.querySelector(`[data-empty-state="${category}"]`);
        if (!filesContainer || !emptyStateEl) return;

        const isProcessed = category === PROCESSED_CATEGORY;
        const remaining   = isProcessed
            ? filesContainer.querySelectorAll("[data-file-card]").length
            : filesContainer.querySelectorAll("tbody tr").length;

        if (remaining === 0) {
            filesContainer.classList.add("hidden");
            emptyStateEl.classList.remove("hidden");
        }
    }

    // ── Image search ──────────────────────────────────────────────────────────
    (function () {
        const searchInput  = document.getElementById("image-search");
        const searchClear  = document.getElementById("image-search-clear");
        const searchStatus = document.getElementById("image-search-status");
        const selectAllRow = document.getElementById("image-select-all-row");
        const grid         = document.getElementById("image-grid");
        if (!searchInput || !grid) return;

        // Snapshot original cards so we can restore after clearing search
        let originalCards = [...grid.children];
        let searchTimer   = null;
        let isSearchMode  = false;

        searchInput.addEventListener("input", () => {
            const q = searchInput.value.trim();
            searchClear?.classList.toggle("hidden", !q);
            clearTimeout(searchTimer);
            if (!q) { clearSearch(); return; }
            searchTimer = setTimeout(() => doSearch(q), 350);
        });

        searchClear?.addEventListener("click", () => {
            searchInput.value = "";
            searchClear.classList.add("hidden");
            clearSearch();
            searchInput.focus();
        });

        async function doSearch(q) {
            isSearchMode = true;
            document.getElementById("load-more-wrap")?.classList.add("hidden");
            selectAllRow?.classList.add("hidden");
            if (searchStatus) { searchStatus.textContent = "Searching…"; searchStatus.classList.remove("hidden"); }
            try {
                const res  = await fetch(`/panel/projects/${project}/images/search?q=${encodeURIComponent(q)}&limit=100`);
                const data = await res.json();
                if (!data.ok) { if (searchStatus) searchStatus.textContent = `Search failed: ${data.error}`; return; }
                grid.innerHTML = "";
                data.images.forEach((img, i) => { const c = buildImageCard(img.name, img.sizes, `s${i}`); grid.appendChild(c); bindNewCard(c); bindSizePicker(c); });
                if (searchStatus) {
                    if (data.total === 0) searchStatus.textContent = `No results for "${q}"`;
                    else if (data.total > 100) searchStatus.textContent = `Showing first 100 of ${data.total} matches for "${q}"`;
                    else searchStatus.textContent = `${data.total} result${data.total !== 1 ? "s" : ""} for "${q}"`;
                }
            } catch (err) {
                if (searchStatus) searchStatus.textContent = `Search failed: ${err.message}`;
            }
        }

        function clearSearch() {
            if (!isSearchMode) return;
            isSearchMode = false;
            if (searchStatus) searchStatus.classList.add("hidden");
            selectAllRow?.classList.remove("hidden");
            document.getElementById("load-more-wrap")?.classList.remove("hidden");
            grid.innerHTML = "";
            originalCards.forEach(c => grid.appendChild(c));
        }
    })();

    // ── Load more images ──────────────────────────────────────────────────────
    (function () {
        const btn = document.getElementById("load-more-btn");
        if (!btn) return;
        let offset  = parseInt(btn.dataset.offset || "50");
        const grid  = document.getElementById("image-grid");
        if (!grid) return;

        btn.addEventListener("click", async () => {
            const origText  = btn.textContent;
            btn.disabled    = true;
            btn.textContent = "Loading…";
            try {
                const res  = await fetch(`/panel/projects/${project}/images/page?offset=${offset}&limit=50`);
                const data = await res.json();
                if (!data.ok) { showToast(`Load failed: ${data.error}`, "error"); btn.disabled = false; btn.textContent = origText; return; }
                data.images.forEach((img, i) => { const c = buildImageCard(img.name, img.sizes, offset + i); grid.appendChild(c); bindNewCard(c); bindSizePicker(c); });
                offset += data.images.length;
                btn.dataset.offset = offset;
                const countEl = document.getElementById("load-more-count");
                if (!data.has_more) {
                    document.getElementById("load-more-wrap")?.remove();
                } else {
                    const rem = data.total - offset;
                    btn.disabled    = false;
                    btn.textContent = "Load 50 more";
                    if (countEl) countEl.textContent = `showing ${offset} of ${data.total}`;
                }
            } catch (err) {
                showToast(`Load failed: ${err.message}`, "error");
                btn.disabled    = false;
                btn.textContent = origText;
            }
        });
    })();

    // ── File table search (client-side filter) ────────────────────────────────
    document.querySelectorAll("[data-table-search]").forEach(input => {
        input.addEventListener("input", () => {
            const cat = input.dataset.tableSearch;
            const q   = input.value.trim().toLowerCase();
            document.querySelectorAll(`[data-search-row="${cat}"]`).forEach(row => {
                const name = row.querySelector(".font-mono")?.textContent.toLowerCase() || "";
                row.style.display = (q && !name.includes(q)) ? "none" : "";
            });
        });
    });

    // ── Build an image card element (mirrors project.html Jinja card) ─────────
    function buildImageCard(name, sizes, idx) {
        const id   = `img-loaded-${idx}`;
        const cat  = PROCESSED_CATEGORY;
        const card = document.createElement("div");
        card.id               = id;
        card.dataset.fileCard = "";
        card.className        = "group relative bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 rounded-xl overflow-hidden aspect-square cursor-default";

        // Build size picker options
        const sizeBtns = sizes.map(s => {
            const url = s === "full"
                ? `${cdnBase}/${project}/${name}`
                : `${cdnBase}/${project}/${s}/${name}`;
            return `<button type="button" class="cdn-size-copy-btn block w-full text-left px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap" data-copy-url="${url}">${s}</button>`;
        }).join("");

        card.innerHTML = `
            <img src="${cdnBase}/${project}/320/${name}" alt="${name}"
                 class="w-full h-full object-cover" loading="lazy"
                 onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden')">
            <div class="hidden absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-zinc-800 text-slate-400 text-xs text-center px-2">No preview</div>
            <div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col justify-between p-2">
                <div class="flex items-start justify-between">
                    <input type="checkbox" data-select-checkbox="${cat}:${name}"
                           class="rounded accent-brand-500 cursor-pointer select-checkbox">
                    <div class="relative cdn-size-picker">
                        <button type="button" class="cdn-size-picker-toggle bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 p-1 rounded-lg transition-colors" title="Copy URL">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                            </svg>
                        </button>
                        <div class="cdn-size-picker-menu hidden absolute top-full right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50">
                            ${sizeBtns}
                        </div>
                    </div>
                </div>
                <div>
                    <p class="text-xs text-white/80 truncate mb-1">${name}</p>
                    <div class="flex items-center justify-between">
                        <div class="flex gap-1 flex-wrap">
                            ${sizes.map(s => `<span class="text-xs bg-black/30 text-white/70 px-1 rounded">${s}</span>`).join("")}
                        </div>
                        <button data-delete-file="${name}" data-delete-category="${cat}" data-row="${id}"
                                class="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/20 transition-colors ml-1" title="Delete">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>`;
        return card;
    }

    // ── Bind event listeners on a freshly built card ──────────────────────────
    function bindNewCard(card) {
        // Size picker (copy URL with size selection) is bound via bindSizePicker(card)
        card.querySelectorAll("[data-delete-file]").forEach(btn => {
            btn.addEventListener("click", async e => {
                e.stopPropagation();
                const filename = btn.dataset.deleteFile;
                const category = btn.dataset.deleteCategory;
                if (!await cdnConfirm(filename, { title: "Delete file?", confirmText: "Delete" })) return;
                btn.disabled = true;
                try {
                    const res  = await fetch(`/panel/projects/${project}/${category}/${filename}`, { method: "DELETE" });
                    const data = await res.json();
                    if (data.ok) {
                        document.getElementById(btn.dataset.row)?.remove();
                        nudgeCount(category, -1);
                        checkEmptyState(category);
                        showToast(`Deleted ${filename}`, "success");
                    } else {
                        showToast(`Delete failed: ${data.error}`, "error");
                        btn.disabled = false;
                    }
                } catch (err) {
                    showToast(`Delete failed: ${err.message}`, "error");
                    btn.disabled = false;
                }
            });
        });
        card.querySelectorAll("[data-select-checkbox]").forEach(cb => {
            cb.addEventListener("change", () => {
                cb.checked ? selected.add(cb.dataset.selectCheckbox) : selected.delete(cb.dataset.selectCheckbox);
                cb.closest("[data-file-card]")?.classList.toggle("is-selected", cb.checked);
                refreshBulkBar();
            });
        });
    }

    function showToast(message, type = "info") {
        const container = document.getElementById("toast-container");
        if (!container) return;
        const styles = {
            success: "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300",
            error:   "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300",
            info:    "bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300",
        };
        const toast = document.createElement("div");
        toast.className = `${styles[type] || styles.info} border rounded-xl px-4 py-3 text-sm shadow-lg pointer-events-auto transform transition-all duration-200 translate-y-2 opacity-0`;
        toast.textContent = message;
        container.appendChild(toast);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            toast.classList.remove("translate-y-2", "opacity-0");
        }));
        setTimeout(() => {
            toast.classList.add("translate-y-2", "opacity-0");
            setTimeout(() => toast.remove(), 200);
        }, 3000);
    }
}
