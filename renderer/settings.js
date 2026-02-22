// --- 状態管理 ---
let services = [];
let editingIndex = -1;

// --- favicon URL取得 ---
function getFaviconUrl(serviceUrl, size = 32) {
    try {
        const url = new URL(serviceUrl);
        return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=${size}`;
    } catch {
        return '';
    }
}

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
    services = await window.api.getServices();
    renderServiceList();
    setupEventListeners();
});

// --- イベントリスナー ---
function setupEventListeners() {
    document.getElementById('addBtn').addEventListener('click', () => openModal());
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    document.getElementById('serviceForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveService();
    });

    document.querySelectorAll('input[name="windowMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('quickSizeGroup').classList.toggle('hidden', e.target.value !== 'quick');
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// --- サービスリスト描画 ---
function renderServiceList() {
    const container = document.getElementById('serviceList');

    if (services.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <p>サービスがありません<br>「新しいサービスを追加」で始めましょう</p>
      </div>
    `;
        return;
    }

    container.innerHTML = '';

    services.forEach((service, index) => {
        const item = document.createElement('div');
        item.className = 'service-item' + (service.visible === false ? ' hidden-service' : '');
        item.draggable = true;
        item.dataset.index = index;

        const faviconUrl = getFaviconUrl(service.url);
        const isVisible = service.visible !== false;

        item.innerHTML = `
      <button class="visibility-toggle ${isVisible ? 'visible' : ''}" title="${isVisible ? 'バーから非表示にする' : 'バーに表示する'}">
        <span class="eye-icon">${isVisible ? '👁️' : '👁️‍🗨️'}</span>
      </button>
      <div class="icon-preview" style="background: ${service.color}22">
        <img class="favicon-img" src="${faviconUrl}" alt="${escapeHtml(service.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
        <span class="favicon-fallback" style="display:none">${service.icon}</span>
      </div>
      <div class="info">
        <div class="name">${escapeHtml(service.name)}</div>
        <div class="url">${escapeHtml(service.url)}</div>
      </div>
      <div class="mode-tag">
        ${service.windowMode === 'quick' ? '⚡ クイック' : service.windowMode === 'llm-chat' ? '🍋 LLM' : '🖥️ フル'}
      </div>
      <div class="actions">
        <button class="edit-btn" title="編集">✏️</button>
        <button class="delete-btn" title="削除">🗑️</button>
      </div>
    `;

        // 表示/非表示トグル
        item.querySelector('.visibility-toggle').addEventListener('click', () => {
            services[index].visible = !isVisible;
            saveAndRefresh();
        });

        // 編集
        item.querySelector('.edit-btn').addEventListener('click', () => openModal(index));

        // 削除
        item.querySelector('.delete-btn').addEventListener('click', () => {
            if (confirm(`「${service.name}」を削除しますか？`)) {
                services.splice(index, 1);
                saveAndRefresh();
            }
        });

        // ドラッグ＆ドロップ
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index);
            setTimeout(() => item.classList.add('dragging'), 0);
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            document.querySelectorAll('.service-item').forEach(el => el.classList.remove('drag-over'));
        });
        item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drag-over'); });
        item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            if (fromIndex !== index) {
                const [movedItem] = services.splice(fromIndex, 1);
                services.splice(index, 0, movedItem);
                saveAndRefresh();
            }
        });

        container.appendChild(item);
    });
}

// --- モーダル ---
function openModal(index = -1) {
    editingIndex = index;
    const modal = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');

    if (index >= 0) {
        const service = services[index];
        title.textContent = 'サービスを編集';
        document.getElementById('serviceId').value = service.id;
        document.getElementById('serviceName').value = service.name;
        document.getElementById('serviceUrl').value = service.url;

        document.getElementById('serviceColor').value = service.color;
        document.querySelector(`input[name="windowMode"][value="${service.windowMode}"]`).checked = true;
        document.getElementById('quickWidth').value = service.quickWindowSize?.width || 500;
        document.getElementById('quickHeight').value = service.quickWindowSize?.height || 700;
    } else {
        title.textContent = 'サービスを追加';
        document.getElementById('serviceForm').reset();
        document.getElementById('serviceColor').value = '#6366f1';
        document.querySelector('input[name="windowMode"][value="quick"]').checked = true;
    }

    const mode = document.querySelector('input[name="windowMode"]:checked').value;
    document.getElementById('quickSizeGroup').classList.toggle('hidden', mode !== 'quick');

    modal.classList.add('active');
    document.getElementById('serviceName').focus();
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    editingIndex = -1;
}

// --- 保存 ---
function saveService() {
    const name = document.getElementById('serviceName').value.trim();
    const url = document.getElementById('serviceUrl').value.trim();
    const icon = editingIndex >= 0 ? services[editingIndex].icon : '⭐';
    const color = document.getElementById('serviceColor').value;
    const windowMode = document.querySelector('input[name="windowMode"]:checked').value;
    const quickWidth = parseInt(document.getElementById('quickWidth').value) || 500;
    const quickHeight = parseInt(document.getElementById('quickHeight').value) || 700;

    if (!name || !url) return;

    const service = {
        id: editingIndex >= 0 ? services[editingIndex].id : generateId(),
        name,
        url,
        icon,
        color,
        windowMode,
        quickWindowSize: { width: quickWidth, height: quickHeight },
        visible: editingIndex >= 0 ? services[editingIndex].visible : true
    };

    if (editingIndex >= 0) {
        services[editingIndex] = service;
    } else {
        services.push(service);
    }

    closeModal();
    saveAndRefresh();
}

async function saveAndRefresh() {
    await window.api.saveServices(services);
    renderServiceList();
}

// --- ユーティリティ ---
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
