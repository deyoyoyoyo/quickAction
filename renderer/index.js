// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
    const services = await window.api.getServices();
    renderServices(services);

    document.getElementById('settingsBtn').addEventListener('click', () => {
        window.api.openSettings();
    });

    // 格納ボタン
    document.getElementById('collapseBtn').addEventListener('click', () => {
        window.api.toggleCollapse();
    });

    // 格納タブ: 手動ドラッグ（上下移動）+ クリック（展開）
    const tab = document.getElementById('collapsedTab');
    let isDragging = false;
    let dragStartY = 0;
    let totalDragDistance = 0;

    tab.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStartY = e.screenY;
        totalDragDistance = 0;
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaY = e.screenY - dragStartY;
        if (deltaY !== 0) {
            totalDragDistance += Math.abs(deltaY);
            window.api.moveTabY(deltaY);
            dragStartY = e.screenY;
        }
    });

    window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        // ドラッグ距離が少なければクリックとみなして展開
        if (totalDragDistance < 5) {
            window.api.toggleCollapse();
        }
    });

    // 格納状態の切り替え
    window.api.onCollapseChanged((collapsed) => {
        document.getElementById('bar').style.display = collapsed ? 'none' : '';
        document.getElementById('collapsedTab').style.display = collapsed ? 'flex' : 'none';
    });

    window.api.onServicesUpdated((services) => {
        renderServices(services);
    });
});

// --- favicon URL取得 ---
function getFaviconUrl(serviceUrl, size = 32) {
    try {
        const url = new URL(serviceUrl);
        return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=${size}`;
    } catch {
        return null;
    }
}

// --- サービスボタン描画（visible: trueのみ） ---
function renderServices(services) {
    const container = document.getElementById('serviceList');
    container.innerHTML = '';

    const visibleServices = services.filter(s => s.visible !== false);

    visibleServices.forEach(service => {
        const btn = document.createElement('button');
        btn.className = 'service-btn';
        btn.style.setProperty('--glow-color', service.color);

        // アイコン: faviconを使用
        const faviconUrl = getFaviconUrl(service.url, 64);
        if (faviconUrl) {
            const img = document.createElement('img');
            img.className = 'favicon';
            img.src = faviconUrl;
            img.alt = service.name;
            img.draggable = false;
            img.onerror = () => {
                img.remove();
                const iconSpan = document.createElement('span');
                iconSpan.className = 'icon';
                iconSpan.textContent = service.icon;
                btn.prepend(iconSpan);
            };
            btn.appendChild(img);
        } else {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'icon';
            iconSpan.textContent = service.icon;
            btn.appendChild(iconSpan);
        }

        // グロー
        const glow = document.createElement('div');
        glow.className = 'glow';
        glow.style.background = service.color;
        btn.appendChild(glow);

        // ツールチップ
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = service.name;
        btn.appendChild(tooltip);

        // モードバッジ
        const badge = document.createElement('div');
        badge.className = 'mode-badge';
        badge.textContent = service.windowMode === 'quick' ? '⚡' : service.windowMode === 'llm-chat' ? '🍋' : '🖥';
        btn.appendChild(badge);

        // クリック（トグル動作）
        btn.addEventListener('click', (e) => {
            createRipple(e, btn);
            window.api.openService(service);
        });

        // 右クリックで設定
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            window.api.openSettings();
        });

        container.appendChild(btn);
    });
}

// --- リップルエフェクト ---
function createRipple(event, button) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (event.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (event.clientY - rect.top - size / 2) + 'px';
    button.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
}
