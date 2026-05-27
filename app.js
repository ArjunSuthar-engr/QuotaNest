document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('add-account-form');
    const grid = document.getElementById('accounts-grid');

    let accounts = JSON.parse(localStorage.getItem('bot_accounts')) || [];
    let editingAccountId = null;
    const submitBtn = form.querySelector('button[type="submit"]');

    const CYCLE_OPTIONS = {
        '5': '5 hours',
        '24': '24 hours',
        '168': '7 days',
        '720': '30 days'
    };

    const trackTimerCheckbox = document.getElementById('acc-track-timer');
    const noteGroup = document.getElementById('acc-note-group');
    const noteInput = document.getElementById('acc-note');
    const brandName = document.querySelector('.brand-name');

    function applyTheme(mode) {
        document.body.classList.toggle('dark-mode', mode === 'dark');
    }

    function toggleTheme() {
        const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('theme_preference', next);
    }

    function isFullBrandTextSelected() {
        if (!brandName) return false;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return false;
        const selectedText = selection.toString().trim();
        const fullText = brandName.textContent.trim();
        if (!selectedText || selectedText !== fullText) return false;

        const range = selection.getRangeAt(0);
        const common = range.commonAncestorContainer;
        const node = common.nodeType === Node.TEXT_NODE ? common.parentElement : common;
        return brandName.contains(node);
    }

    function syncTrackTimerUI() {
        const enabled = !!trackTimerCheckbox.checked;
        noteGroup.style.display = enabled ? 'none' : 'block';

        const resetInput = document.getElementById('acc-reset');
        resetInput.required = enabled;

        document.querySelectorAll('input[name="acc-date-type"]').forEach((el) => {
            el.disabled = !enabled;
        });
    }

    function normalizeAccount(account) {
        if (account.cycleHours) return account;

        if (account.hasSecondary) {
            account.cycleHours = 5;
        } else {
            account.cycleHours = 168;
        }

        delete account.plan;
        delete account.limit;
        delete account.files;
        delete account.hasSecondary;
        delete account.resetDate2;
        delete account.dateType2;

        return account;
    }

    accounts = accounts.map((acc) => {
        const normalized = normalizeAccount(acc);
        if (typeof normalized.trackTimer !== 'boolean') normalized.trackTimer = true;
        if (typeof normalized.note !== 'string') normalized.note = '';
        return normalized;
    });

    const savedTheme = localStorage.getItem('theme_preference');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
    }

    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme_preference')) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });
    document.addEventListener('mouseup', () => {
        if (!isFullBrandTextSelected()) return;
        toggleTheme();
        window.getSelection()?.removeAllRanges();
    });

    syncTrackTimerUI();
    trackTimerCheckbox.addEventListener('change', syncTrackTimerUI);

    function saveAccounts() {
        localStorage.setItem('bot_accounts', JSON.stringify(accounts));
    }

    function generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    function getCycleLabel(cycleHours) {
        return CYCLE_OPTIONS[String(cycleHours)] || `${cycleHours} hours`;
    }

    function toLocalDatetimeValue(date) {
        const pad = (n) => String(n).padStart(2, '0');
        const yyyy = date.getFullYear();
        const mm = pad(date.getMonth() + 1);
        const dd = pad(date.getDate());
        const hh = pad(date.getHours());
        const min = pad(date.getMinutes());
        return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    }

    window.ackNext = function(id) {
        const index = accounts.findIndex(acc => acc.id === id);
        if (index === -1) return;

        const acc = accounts[index];
        const cycleHours = acc.cycleHours || 168;
        const cycleMs = cycleHours * 60 * 60 * 1000;
        const now = Date.now();
        const safeDate = acc.resetDate ? new Date(acc.resetDate) : new Date();
        let baseMs = safeDate.getTime();
        if (Number.isNaN(baseMs)) baseMs = now;

        if ((acc.dateType || 'last') === 'next') {
            // Keep a fixed cadence: advance from previous scheduled next reset.
            while (baseMs <= now) {
                baseMs += cycleMs;
            }
            acc.resetDate = toLocalDatetimeValue(new Date(baseMs));
            acc.dateType = 'next';
        } else {
            // Keep a fixed cadence: advance from previous last reset anchor.
            while ((baseMs + cycleMs) <= now) {
                baseMs += cycleMs;
            }
            acc.resetDate = toLocalDatetimeValue(new Date(baseMs));
            acc.dateType = 'last';
        }

        accounts[index] = acc;
        saveAccounts();
        renderAccounts();
        updateTimers();
    };

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const accountData = {
            name: document.getElementById('acc-name').value,
            platform: document.getElementById('acc-platform').value,
            email: document.getElementById('acc-email').value,
            phone: document.getElementById('acc-phone').value,
            cycleHours: parseInt(document.getElementById('acc-cycle').value, 10),
            trackTimer: !!trackTimerCheckbox.checked,
            note: noteInput.value,
            resetDate: document.getElementById('acc-reset').value,
            dateType: document.querySelector('input[name="acc-date-type"]:checked')?.value || 'last'
        };

        if (editingAccountId) {
            const index = accounts.findIndex(acc => acc.id === editingAccountId);
            if (index !== -1) {
                accounts[index] = { ...accounts[index], ...accountData };
            }
            editingAccountId = null;
            submitBtn.textContent = 'Save Account';
        } else {
            accountData.id = generateId();
            accounts.push(accountData);
        }

        saveAccounts();
        renderAccounts();
        form.reset();
        document.getElementById('acc-cycle').value = '168';
        document.querySelector('input[name="acc-date-type"][value="last"]').checked = true;
        trackTimerCheckbox.checked = true;
        noteInput.value = '';
        syncTrackTimerUI();
    });

    window.deleteAccount = function(id) {
        if (confirm('Are you sure you want to delete this account?')) {
            accounts = accounts.filter(acc => acc.id !== id);
            saveAccounts();
            renderAccounts();
        }
    };

    window.editAccount = function(id) {
        const account = accounts.find(acc => acc.id === id);
        if (!account) return;

        editingAccountId = id;
        document.getElementById('acc-name').value = account.name;
        document.getElementById('acc-platform').value = account.platform;
        document.getElementById('acc-email').value = account.email || '';
        document.getElementById('acc-phone').value = account.phone || '';
        document.getElementById('acc-cycle').value = String(account.cycleHours || 168);
        trackTimerCheckbox.checked = account.trackTimer !== false;
        noteInput.value = account.note || '';
        syncTrackTimerUI();
        document.getElementById('acc-reset').value = account.resetDate || '';
        const type = account.dateType || 'last';
        const typeEl = document.querySelector(`input[name="acc-date-type"][value="${type}"]`);
        if (typeEl) typeEl.checked = true;

        submitBtn.textContent = 'Update Account';
        form.scrollIntoView({ behavior: 'smooth' });
    };

    function calculateTimeRemaining(resetDateStr, dateType, cycleHours) {
        if (!resetDateStr) return { text: 'No Date', status: 'safe', percent: 0, isReset: false };

        const resetDate = new Date(resetDateStr);
        const cycleMs = cycleHours * 60 * 60 * 1000;
        const nextReset = dateType === 'next'
            ? resetDate
            : new Date(resetDate.getTime() + cycleMs);

        const now = new Date();
        const diff = nextReset - now;
        let percent = ((cycleMs - diff) / cycleMs) * 100;
        percent = Math.max(0, Math.min(100, percent));

        if (diff <= 0) {
            return { text: 'CREDITS RESET', status: 'success', percent: 100, isReset: true };
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / 1000 / 60) % 60);
        const seconds = Math.floor((diff / 1000) % 60);

        let status = 'safe';
        if (diff < cycleMs * 0.2) status = 'warning';
        if (diff < cycleMs * 0.05) status = 'danger';

        return {
            text: `${days > 0 ? days + 'd ' : ''}${hours}h ${minutes}m ${seconds}s`,
            status,
            percent,
            isReset: false
        };
    }

    function getNextResetTime(account) {
        if (account.trackTimer === false) return Infinity;
        if (!account.resetDate) return Infinity;

        const cycleMs = (account.cycleHours || 168) * 60 * 60 * 1000;
        const date = new Date(account.resetDate);

        if (account.dateType === 'next') {
            return date.getTime();
        }

        return date.getTime() + cycleMs;
    }

    function renderAccounts() {
        grid.innerHTML = '';

        if (accounts.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1/-1; text-align: center;">No accounts tracked yet. Add one above!</p>';
            return;
        }

        const sortedAccounts = [...accounts].sort((a, b) => getNextResetTime(a) - getNextResetTime(b));

        sortedAccounts.forEach(acc => {
            const card = document.createElement('div');
            card.className = 'account-card';

            const formattedDate = acc.resetDate
                ? new Date(acc.resetDate).toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                })
                : 'N/A';

            const isTracked = acc.trackTimer !== false;
            const noteText = (acc.note || '').trim();

            card.innerHTML = `
                <div class="card-header">
                    <div class="card-title">${acc.name}</div>
                    <div style="display: flex; gap: 0.75rem; align-items: center;">
                        <div class="platform-badge">${acc.platform}</div>
                        <button class="btn-edit" onclick="editAccount('${acc.id}')" title="Edit Account">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn-delete" onclick="deleteAccount('${acc.id}')" title="Delete Account">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="card-details">
                    <span><strong>Cycle:</strong> ${getCycleLabel(acc.cycleHours || 168)}</span>
                    ${acc.email ? `<span><strong>Email:</strong> ${acc.email}</span>` : ''}
                    ${acc.phone ? `<span><strong>Phone:</strong> ${acc.phone}</span>` : ''}
                    ${isTracked ? `<span><strong>${acc.dateType === 'next' ? 'Next Reset' : 'Last Reset'}:</strong> ${formattedDate}</span>` : `<span><strong>Reference:</strong> No timer</span>`}
                </div>
                ${isTracked ? `
                    <div class="timer-section">
                        <div class="timer-label">Time Until Next Reset</div>
                        <div class="timer-display" id="timer-${acc.id}">Loading...</div>
                        <div class="progress-container">
                            <div class="progress-bar" id="progress-${acc.id}"></div>
                        </div>
                        <button class="btn-ack" id="ack-${acc.id}" type="button" onclick="ackNext('${acc.id}')" style="display: none;">OK, next</button>
                    </div>
                ` : `
                    <div class="note-section">
                        <div class="note-label">Note</div>
                        <div class="note-text">${noteText ? noteText.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '<span class="note-empty">No note yet</span>'}</div>
                    </div>
                `}
            `;
            grid.appendChild(card);
        });
    }

    function updateTimers() {
        accounts.forEach(acc => {
            if (acc.trackTimer === false) return;
            const timerElement = document.getElementById(`timer-${acc.id}`);
            const progressElement = document.getElementById(`progress-${acc.id}`);
            const ackElement = document.getElementById(`ack-${acc.id}`);

            if (timerElement) {
                const { text, status, percent, isReset } = calculateTimeRemaining(
                    acc.resetDate,
                    acc.dateType || 'last',
                    acc.cycleHours || 168
                );
                timerElement.textContent = text;
                timerElement.className = `timer-display ${status}`;
                if (progressElement) {
                    progressElement.style.width = `${percent}%`;
                }
                if (ackElement) {
                    ackElement.style.display = isReset ? 'inline-flex' : 'none';
                }
            }
        });
    }

    saveAccounts();
    renderAccounts();
    updateTimers();
    setInterval(updateTimers, 1000);
});
