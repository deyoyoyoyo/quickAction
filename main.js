const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// デバッグログ
const logFile = path.join(__dirname, 'debug.log');
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
    console.log(msg);
}

log('=== App starting ===');

// GPU キャッシュ警告を抑制
app.commandLine.appendSwitch('disable-gpu-cache');

// 二重起動防止
const gotLock = app.requestSingleInstanceLock();
log(`Single instance lock: ${gotLock}`);
if (!gotLock) {
    log('Another instance is running, quitting.');
    app.quit();
} else {

    // --- 設定管理 ---
    const DEFAULT_CONFIG = {
        services: [
            { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com', icon: '🤖', color: '#10A37F', windowMode: 'quick', quickWindowSize: { width: 500, height: 700 }, visible: true },
            { id: 'x-twitter', name: 'X', url: 'https://x.com', icon: '𝕏', color: '#1DA1F2', windowMode: 'quick', quickWindowSize: { width: 500, height: 700 }, visible: true },
            { id: 'notion', name: 'Notion', url: 'https://www.notion.so', icon: '📝', color: '#E16259', windowMode: 'full', quickWindowSize: { width: 500, height: 700 }, visible: true },
            { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com', icon: '▶️', color: '#FF0000', windowMode: 'full', quickWindowSize: { width: 500, height: 700 }, visible: true },
            { id: 'github', name: 'GitHub', url: 'https://github.com', icon: '🐙', color: '#6e40c9', windowMode: 'full', quickWindowSize: { width: 500, height: 700 }, visible: true },
            { id: 'google-gemini', name: 'Gemini', url: 'https://gemini.google.com', icon: '✨', color: '#4285F4', windowMode: 'quick', quickWindowSize: { width: 500, height: 700 }, visible: false },
            { id: 'claude', name: 'Claude', url: 'https://claude.ai', icon: '🧠', color: '#D97757', windowMode: 'quick', quickWindowSize: { width: 500, height: 700 }, visible: false },
            { id: 'slack', name: 'Slack', url: 'https://app.slack.com', icon: '💬', color: '#4A154B', windowMode: 'full', quickWindowSize: { width: 500, height: 700 }, visible: false },
            { id: 'discord', name: 'Discord', url: 'https://discord.com/app', icon: '🎮', color: '#5865F2', windowMode: 'full', quickWindowSize: { width: 500, height: 700 }, visible: false },
            { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com', icon: '📧', color: '#EA4335', windowMode: 'full', quickWindowSize: { width: 500, height: 700 }, visible: false },
            { id: 'google-drive', name: 'Google Drive', url: 'https://drive.google.com', icon: '📁', color: '#0F9D58', windowMode: 'full', quickWindowSize: { width: 500, height: 700 }, visible: false },
            { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com', icon: '🎵', color: '#1DB954', windowMode: 'quick', quickWindowSize: { width: 400, height: 600 }, visible: false },
            { id: 'reddit', name: 'Reddit', url: 'https://www.reddit.com', icon: '🔴', color: '#FF4500', windowMode: 'full', quickWindowSize: { width: 500, height: 700 }, visible: false },
            { id: 'figma', name: 'Figma', url: 'https://www.figma.com', icon: '🎨', color: '#F24E1E', windowMode: 'full', quickWindowSize: { width: 500, height: 700 }, visible: false },
            { id: 'google-calendar', name: 'Googleカレンダー', url: 'https://calendar.google.com', icon: '📅', color: '#4285F4', windowMode: 'quick', quickWindowSize: { width: 450, height: 650 }, visible: false },
            { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai', icon: '🔍', color: '#20808D', windowMode: 'quick', quickWindowSize: { width: 500, height: 700 }, visible: false },
            { id: 'local-llm', name: 'Local LLM', url: '', icon: '🍋', color: '#7c5cff', windowMode: 'llm-chat', quickWindowSize: { width: 550, height: 750 }, visible: true },
        ],
        barPosition: null,
        barOpacity: 0.92,
        llmConfig: {
            endpoint: 'http://localhost:8000/api/v1',
            model: '',
            systemPrompt: ''
        }
    };

    let CONFIG_PATH;
    let config;

    function loadConfig() {
        try {
            if (!CONFIG_PATH) CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
            log(`Config path: ${CONFIG_PATH}`);
            if (fs.existsSync(CONFIG_PATH)) {
                const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
                const saved = JSON.parse(data);
                // visibleフィールドがないサービスにデフォルト値を追加
                if (saved.services) {
                    saved.services = saved.services.map(s => ({ visible: true, ...s }));
                    // デフォルトに存在するが保存済みにないサービスを末尾に追加
                    const savedIds = new Set(saved.services.map(s => s.id));
                    for (const def of DEFAULT_CONFIG.services) {
                        if (!savedIds.has(def.id)) {
                            saved.services.push({ ...def });
                        }
                    }
                }
                return { ...DEFAULT_CONFIG, ...saved };
            }
        } catch (e) {
            log(`Config load error: ${e.message}`);
        }
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    function saveConfig(cfg) {
        try {
            if (!CONFIG_PATH) CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
        } catch (e) {
            log(`Config save error: ${e.message}`);
        }
    }

    // --- ウィンドウ位置を画面内に収める ---
    function clampToWorkArea(x, y, width, height) {
        const display = screen.getPrimaryDisplay();
        const wa = display.workArea; // タスクバーを除いた領域
        const clampedX = Math.max(wa.x, Math.min(x, wa.x + wa.width - width));
        // バー下端(y+height)がタスクバー上端(wa.y+wa.height)に接するようにする
        const maxY = wa.y + wa.height - height; // この位置でバー下端=タスクバー上端
        const clampedY = Math.max(wa.y, Math.min(y, maxY));
        const clampedW = Math.min(width, wa.width);
        const clampedH = Math.min(height, wa.height);
        log(`clamp: wa={y:${wa.y},h:${wa.height}} bar={y:${y},h:${height}} maxY=${maxY} clampedY=${clampedY} barBottom=${clampedY + clampedH} taskbarTop=${wa.y + wa.height}`);
        return { x: clampedX, y: clampedY, width: clampedW, height: clampedH };
    }

    // --- ウィンドウ管理 ---
    let mainWindow = null;
    let settingsWindow = null;
    let tray = null;
    const serviceWindows = new Map();
    let isCollapsed = false;
    let expandedBounds = null;

    function createMainWindow() {
        log('Creating main window...');
        const display = screen.getPrimaryDisplay();
        const wa = display.workArea;
        log(`WorkArea: x=${wa.x} y=${wa.y} w=${wa.width} h=${wa.height}`);

        const visibleCount = config.services.filter(s => s.visible).length;
        const barWidth = 72;
        // 実際のコンテンツ: padding(8*2) + dragHandle(26) + buttons(58*count) + actions(50)
        const barHeight = Math.min(16 + 26 + visibleCount * 58 + 50, wa.height);
        log(`visibleCount=${visibleCount} barHeight=${barHeight}`);

        const pos = config.barPosition || {
            x: wa.x + wa.width - barWidth - 12,
            y: wa.y + Math.round((wa.height - barHeight) / 2)
        };

        // 画面内に収める
        const clamped = clampToWorkArea(pos.x, pos.y, barWidth, barHeight);

        mainWindow = new BrowserWindow({
            width: clamped.width,
            height: clamped.height,
            x: clamped.x,
            y: clamped.y,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            resizable: false,
            skipTaskbar: true,
            hasShadow: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
        log('Main window created');

        let isAdjusting = false; // setBoundsの再入防止
        mainWindow.on('moved', () => {
            if (!mainWindow || isAdjusting) return;
            const bounds = mainWindow.getBounds();
            const display = screen.getPrimaryDisplay();
            const wa = display.workArea;

            if (isCollapsed) {
                // 格納タブ: X固定（画面端に接着）、Y方向は画面内に制限
                const clampedY = Math.max(wa.y, Math.min(bounds.y, wa.y + wa.height - bounds.height));
                const tabX = expandedBounds ?
                    (expandedBounds.x + expandedBounds.width / 2 > wa.x + wa.width / 2
                        ? wa.x + wa.width - bounds.width
                        : wa.x)
                    : bounds.x;
                if (bounds.y !== clampedY || bounds.x !== tabX) {
                    isAdjusting = true;
                    mainWindow.setBounds({ ...bounds, x: tabX, y: clampedY });
                    isAdjusting = false;
                }
            } else {
                // 通常バー: 画面内に補正
                const clamped = clampToWorkArea(bounds.x, bounds.y, bounds.width, bounds.height);
                if (bounds.x !== clamped.x || bounds.y !== clamped.y) {
                    isAdjusting = true;
                    mainWindow.setBounds(clamped);
                    isAdjusting = false;
                }
                config.barPosition = { x: clamped.x, y: clamped.y };
                saveConfig(config);
            }
        });

        mainWindow.on('closed', () => {
            log('Main window closed');
            mainWindow = null;
        });
    }

    // --- 格納/展開 ---
    function collapseBar() {
        if (!mainWindow || isCollapsed) return;
        expandedBounds = mainWindow.getBounds();
        const display = screen.getPrimaryDisplay();
        const wa = display.workArea;

        // バーが画面の左半分にあるか右半分にあるかで格納方向を決定
        const barCenter = expandedBounds.x + expandedBounds.width / 2;
        const screenCenter = wa.x + wa.width / 2;
        const tabWidth = 14;
        const tabHeight = 50;

        let tabX, tabY;
        if (barCenter > screenCenter) {
            // 右端に格納
            tabX = wa.x + wa.width - tabWidth;
        } else {
            // 左端に格納
            tabX = wa.x;
        }
        tabY = expandedBounds.y + Math.round((expandedBounds.height - tabHeight) / 2);
        tabY = Math.max(wa.y, Math.min(tabY, wa.y + wa.height - tabHeight));

        isCollapsed = true;
        mainWindow.setResizable(true);
        mainWindow.setBounds({ x: tabX, y: tabY, width: tabWidth, height: tabHeight });
        mainWindow.setResizable(false);
        mainWindow.webContents.send('collapse-changed', true);
        log('Bar collapsed');
    }

    function expandBar() {
        if (!mainWindow || !isCollapsed || !expandedBounds) return;
        // 格納タブのY位置を展開後に反映
        const tabBounds = mainWindow.getBounds();
        const display = screen.getPrimaryDisplay();
        const wa = display.workArea;
        let newY = tabBounds.y;
        newY = Math.max(wa.y, Math.min(newY, wa.y + wa.height - expandedBounds.height));

        isCollapsed = false;
        mainWindow.setResizable(true);
        mainWindow.setBounds({ ...expandedBounds, y: newY });
        mainWindow.setResizable(false);
        config.barPosition = { x: expandedBounds.x, y: newY };
        expandedBounds.y = newY;
        saveConfig(config);
        mainWindow.webContents.send('collapse-changed', false);
        log('Bar expanded');
    }

    function toggleCollapse() {
        if (isCollapsed) {
            expandBar();
        } else {
            collapseBar();
        }
    }

    function toggleSettingsWindow() {
        if (settingsWindow) {
            settingsWindow.close();
            return;
        }

        const display = screen.getPrimaryDisplay();
        const wa = display.workArea;
        const sw = 600, sh = 700;
        const clamped = clampToWorkArea(
            wa.x + Math.round((wa.width - sw) / 2),
            wa.y + Math.round((wa.height - sh) / 2),
            sw, sh
        );

        settingsWindow = new BrowserWindow({
            width: clamped.width,
            height: clamped.height,
            x: clamped.x,
            y: clamped.y,
            frame: true,
            resizable: true,
            alwaysOnTop: true,
            title: 'Quick Action 設定',
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
        settingsWindow.setMenuBarVisibility(false);

        settingsWindow.on('closed', () => {
            settingsWindow = null;
        });
    }

    function openServiceWindow(service) {
        // 既存ウィンドウがあればトグル（hide/show）
        if (serviceWindows.has(service.id)) {
            const existingWin = serviceWindows.get(service.id);
            if (!existingWin.isDestroyed()) {
                if (existingWin.isVisible()) {
                    existingWin.hide();
                } else {
                    existingWin.show();
                    existingWin.focus();
                }
                return;
            }
            serviceWindows.delete(service.id);
        }

        // 新規ウィンドウ作成
        const display = screen.getPrimaryDisplay();
        const wa = display.workArea;

        let winWidth, winHeight, winX, winY;

        if (service.windowMode === 'quick' || service.windowMode === 'llm-chat') {
            winWidth = service.quickWindowSize?.width || 500;
            winHeight = service.quickWindowSize?.height || 700;
            if (mainWindow) {
                const mainBounds = mainWindow.getBounds();
                winX = mainBounds.x - winWidth - 10;
                winY = mainBounds.y;
                if (winX < wa.x) {
                    winX = mainBounds.x + mainBounds.width + 10;
                }
            } else {
                winX = wa.x + Math.round((wa.width - winWidth) / 2);
                winY = wa.y + Math.round((wa.height - winHeight) / 2);
            }
        } else {
            winWidth = Math.round(wa.width * 0.85);
            winHeight = Math.round(wa.height * 0.85);
            winX = wa.x + Math.round((wa.width - winWidth) / 2);
            winY = wa.y + Math.round((wa.height - winHeight) / 2);
        }

        const clamped = clampToWorkArea(winX, winY, winWidth, winHeight);

        const isLLMChat = service.windowMode === 'llm-chat';
        const win = new BrowserWindow({
            width: clamped.width,
            height: clamped.height,
            x: clamped.x,
            y: clamped.y,
            frame: true,
            alwaysOnTop: service.windowMode === 'quick' || isLLMChat,
            resizable: true,
            title: service.name,
            webPreferences: {
                preload: isLLMChat ? path.join(__dirname, 'preload.js') : undefined,
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        win.setMenuBarVisibility(false);
        if (isLLMChat) {
            win.loadFile(path.join(__dirname, 'renderer', 'llm-chat.html'));
        } else {
            win.loadURL(service.url);
        }
        serviceWindows.set(service.id, win);

        // ×ボタンで閉じた場合もhideに変換（セッション維持）
        win.on('close', (e) => {
            if (!app.isQuitting) {
                e.preventDefault();
                win.hide();
            }
        });
    }

    function createTray() {
        log('Creating tray...');
        try {
            const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
            const assetsDir = path.join(__dirname, 'assets');
            if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
            if (!fs.existsSync(iconPath)) generateTrayIconPNG(iconPath);

            const icon = nativeImage.createFromPath(iconPath);
            if (icon.isEmpty()) {
                generateMinimalPNG(iconPath);
                tray = new Tray(nativeImage.createFromPath(iconPath));
            } else {
                tray = new Tray(icon);
            }
            log('Tray created successfully');
        } catch (e) {
            log(`Tray creation error: ${e.message}`);
            try {
                const emptyIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAADklEQVQ4jWNgGAWDEwAAAhAAAbBjGsAAAAAASUVORK5CYII=');
                tray = new Tray(emptyIcon);
            } catch (e2) {
                log(`Fallback tray also failed: ${e2.message}`);
            }
        }

        if (!tray) return;

        const isStartup = app.getLoginItemSettings().openAtLogin;
        const contextMenu = Menu.buildFromTemplate([
            {
                label: '表示/非表示',
                click: () => { if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); }
            },
            { label: '設定', click: () => toggleSettingsWindow() },
            { type: 'separator' },
            {
                label: 'スタートアップ起動',
                type: 'checkbox',
                checked: isStartup,
                click: (menuItem) => {
                    app.setLoginItemSettings({ openAtLogin: menuItem.checked });
                    log(`Startup setting changed: ${menuItem.checked}`);
                }
            },
            { type: 'separator' },
            { label: '終了', click: () => { app.isQuitting = true; app.quit(); } }
        ]);

        tray.setToolTip('Quick Action');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => {
            if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        });
    }

    function generateTrayIconPNG(filePath) {
        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4y2P4z8BQz0BFQM8wmsBoA0YbMNqA0QaMNmC0AaMNIBYAAP//AwBE7wH9TKvCSgAAAABJRU5ErkJggg==';
        fs.writeFileSync(filePath, Buffer.from(pngBase64, 'base64'));
    }
    function generateMinimalPNG(filePath) {
        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        fs.writeFileSync(filePath, Buffer.from(pngBase64, 'base64'));
    }

    // --- IPC ハンドラ ---
    ipcMain.handle('get-services', () => config.services);

    ipcMain.handle('save-services', (event, services) => {
        config.services = services;
        saveConfig(config);
        if (mainWindow) {
            const display = screen.getPrimaryDisplay();
            const wa = display.workArea;
            const visibleCount = services.filter(s => s.visible).length;
            const barHeight = Math.min(16 + 26 + visibleCount * 58 + 50, wa.height);
            const bounds = mainWindow.getBounds();
            const clamped = clampToWorkArea(bounds.x, bounds.y, bounds.width, barHeight);
            mainWindow.setBounds(clamped);
            mainWindow.webContents.send('services-updated', services);
        }
        return true;
    });

    ipcMain.handle('open-service', (event, service) => {
        openServiceWindow(service);
        return true;
    });

    ipcMain.handle('open-settings', () => {
        toggleSettingsWindow();
        return true;
    });

    ipcMain.handle('get-bar-config', () => ({
        barOpacity: config.barOpacity,
        barPosition: config.barPosition
    }));

    ipcMain.handle('save-bar-config', (event, barConfig) => {
        Object.assign(config, barConfig);
        saveConfig(config);
        return true;
    });

    ipcMain.handle('close-window', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.close();
        return true;
    });

    ipcMain.handle('minimize-to-tray', () => {
        if (mainWindow) mainWindow.hide();
        return true;
    });

    ipcMain.handle('toggle-collapse', () => {
        toggleCollapse();
        return true;
    });

    // --- LLM API ハンドラ ---
    ipcMain.handle('get-llm-config', () => config.llmConfig || { endpoint: 'http://localhost:8000/api/v1', model: '', systemPrompt: '' });

    ipcMain.handle('save-llm-config', (event, llmCfg) => {
        config.llmConfig = llmCfg;
        saveConfig(config);
        return true;
    });

    ipcMain.handle('check-llm-connection', async () => {
        try {
            const endpoint = (config.llmConfig?.endpoint || 'http://localhost:8000/api/v1').replace(/\/+$/, '');
            const res = await fetch(`${endpoint}/models`, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                const body = await res.json();
                const models = (body.data || []).map(m => m.id);
                return { ok: true, models };
            }
            return { ok: false, error: `HTTP ${res.status}` };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('send-llm-message', async (event, messages, model) => {
        const sender = event.sender;
        const endpoint = (config.llmConfig?.endpoint || 'http://localhost:8000/api/v1').replace(/\/+$/, '');
        let requestModel = model || config.llmConfig?.model;

        // モデル名が未指定の場合、利用可能なモデルを自動取得
        if (!requestModel) {
            try {
                const modelsRes = await fetch(`${endpoint}/models`, { signal: AbortSignal.timeout(5000) });
                if (modelsRes.ok) {
                    const body = await modelsRes.json();
                    const models = (body.data || []).map(m => m.id);
                    if (models.length > 0) {
                        requestModel = models[0];
                        log(`Auto-selected model: ${requestModel}`);
                    }
                }
            } catch (e) {
                log(`Failed to auto-detect model: ${e.message}`);
            }
            if (!requestModel) {
                sender.send('llm-stream-error', 'モデルが見つかりません。設定画面でモデル名を指定してください。');
                return;
            }
        }

        // Node.js http/https でストリーミングリクエスト
        const url = new URL(`${endpoint}/chat/completions`);
        const isHttps = url.protocol === 'https:';
        const httpModule = isHttps ? require('https') : require('http');
        const postData = JSON.stringify({
            model: requestModel,
            messages: messages,
            stream: true
        });

        const reqOptions = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Connection': 'close'
            }
        };

        return new Promise((resolve) => {
            const req = httpModule.request(reqOptions, (res) => {
                if (res.statusCode !== 200) {
                    let errBody = '';
                    res.on('data', (chunk) => { errBody += chunk.toString(); });
                    res.on('end', () => {
                        if (!sender.isDestroyed()) {
                            sender.send('llm-stream-error', `API Error (${res.statusCode}): ${errBody}`);
                        }
                        resolve();
                    });
                    return;
                }

                let buffer = '';
                let receivedData = false;
                res.setEncoding('utf-8');
                res.on('data', (chunk) => {
                    receivedData = true;
                    buffer += chunk;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data: ')) continue;
                        const data = trimmed.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content && !sender.isDestroyed()) {
                                sender.send('llm-stream-chunk', content);
                            }
                        } catch (parseErr) {
                            // JSON パースエラーは無視
                        }
                    }
                });

                res.on('end', () => {
                    if (!sender.isDestroyed()) {
                        sender.send('llm-stream-end');
                    }
                    resolve();
                });

                // SSEストリーム終了時のHTTP Parse Errorを無視
                res.on('error', (e) => {
                    log(`LLM stream error: ${e.message}`);
                    if (receivedData && !sender.isDestroyed()) {
                        sender.send('llm-stream-end');
                    }
                    resolve();
                });
            });

            req.on('error', (e) => {
                log(`LLM API error: ${e.message}`);
                if (!sender.isDestroyed()) {
                    sender.send('llm-stream-error', `接続エラー: ${e.message}`);
                }
                resolve();
            });

            req.write(postData);
            req.end();
        });
    });

    ipcMain.handle('move-tab-y', (event, deltaY) => {
        if (!mainWindow || !isCollapsed) return;
        const bounds = mainWindow.getBounds();
        const display = screen.getPrimaryDisplay();
        const wa = display.workArea;
        let newY = bounds.y + deltaY;
        newY = Math.max(wa.y, Math.min(newY, wa.y + wa.height - bounds.height));
        mainWindow.setBounds({ ...bounds, y: newY });
    });

    // --- アプリ起動 ---
    app.on('second-instance', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });

    app.whenReady().then(() => {
        log('App ready event fired');
        config = loadConfig();
        log(`Loaded ${config.services.length} services`);
        createTray();
        createMainWindow();
        log('=== App started successfully ===');
    }).catch(err => {
        log(`App startup error: ${err.message}\n${err.stack}`);
    });

    app.on('window-all-closed', () => { /* トレイに残す */ });
    app.on('activate', () => { if (!mainWindow) createMainWindow(); });

    // 終了時に全サービスウィンドウを確実に破棄
    app.on('before-quit', () => {
        app.isQuitting = true;
        for (const [id, win] of serviceWindows) {
            if (!win.isDestroyed()) win.destroy();
        }
        serviceWindows.clear();
    });

    process.on('uncaughtException', (err) => log(`Uncaught exception: ${err.message}\n${err.stack}`));
    process.on('unhandledRejection', (reason) => log(`Unhandled rejection: ${reason}`));

} // end of gotLock else block
