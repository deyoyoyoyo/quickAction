// --- 状態管理 ---
let messages = [];
let isStreaming = false;
let llmConfig = {
    endpoint: 'http://localhost:8000/api/v1',
    model: '',
    systemPrompt: ''
};

// --- DOM要素 ---
const messagesContainer = document.getElementById('messagesContainer');
const welcomeMessage = document.getElementById('welcomeMessage');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const statusIndicator = document.getElementById('statusIndicator');
const charCount = document.getElementById('charCount');

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
    // LLM設定を取得
    try {
        const config = await window.api.getLLMConfig();
        if (config) {
            llmConfig = { ...llmConfig, ...config };
            document.getElementById('endpointInput').value = llmConfig.endpoint;
            document.getElementById('systemPromptInput').value = llmConfig.systemPrompt || '';
        }
    } catch (e) {
        console.error('Failed to load LLM config:', e);
    }

    const connResult = await checkConnection();
    // 接続成功時にモデル一覧をプルダウンに反映
    if (connResult && connResult.ok && connResult.models) {
        populateModelSelect(connResult.models);
    }
    setupEventListeners();
    setupStreamListeners();
});

// --- モデル一覧取得・プルダウン更新 ---
async function fetchAndPopulateModels() {
    const select = document.getElementById('modelSelect');
    const refreshBtn = document.getElementById('modelRefreshBtn');
    select.innerHTML = '<option value="">読み込み中...</option>';
    refreshBtn.classList.add('loading');

    try {
        const result = await window.api.checkLLMConnection();
        if (result.ok && result.models) {
            populateModelSelect(result.models);
        } else {
            select.innerHTML = '<option value="">取得失敗</option>';
        }
    } catch (e) {
        select.innerHTML = '<option value="">エラー</option>';
    } finally {
        refreshBtn.classList.remove('loading');
    }
}

function populateModelSelect(models) {
    const select = document.getElementById('modelSelect');
    select.innerHTML = '';

    if (models.length === 0) {
        select.innerHTML = '<option value="">モデルなし</option>';
        return;
    }

    models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
    });

    // 保存済みモデルが一覧にあれば選択
    if (llmConfig.model && models.includes(llmConfig.model)) {
        select.value = llmConfig.model;
    } else {
        // 先頭を自動選択して設定に反映
        llmConfig.model = models[0];
        select.value = models[0];
    }
}

// --- 接続確認 ---
async function checkConnection() {
    const statusText = statusIndicator.querySelector('.status-text');
    statusIndicator.className = 'status-indicator';
    statusText.textContent = '接続確認中...';

    try {
        const result = await window.api.checkLLMConnection();
        if (result.ok) {
            statusIndicator.classList.add('connected');
            statusText.textContent = '接続済み';
        } else {
            statusIndicator.classList.add('error');
            statusText.textContent = result.error || '接続失敗';
        }
        return result;
    } catch (e) {
        statusIndicator.classList.add('error');
        statusText.textContent = '接続エラー';
        return null;
    }
}

// --- イベントリスナー ---
function setupEventListeners() {
    // 送信ボタン
    sendBtn.addEventListener('click', sendMessage);

    // Enter で送信（Shift+Enter で改行）
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // テキスト入力時
    messageInput.addEventListener('input', () => {
        autoResizeTextarea();
        updateSendButton();
        updateCharCount();
    });

    // クリアボタン
    clearBtn.addEventListener('click', () => {
        if (messages.length === 0) return;
        if (confirm('会話履歴をクリアしますか？')) {
            messages = [];
            renderMessages();
        }
    });

    // 設定トグル
    settingsToggle.addEventListener('click', () => {
        const isOpening = !settingsPanel.classList.contains('open');
        settingsPanel.classList.toggle('open');
        if (isOpening) fetchAndPopulateModels();
    });

    // モデル更新ボタン
    document.getElementById('modelRefreshBtn').addEventListener('click', fetchAndPopulateModels);

    // 設定保存
    saveSettingsBtn.addEventListener('click', async () => {
        llmConfig.endpoint = document.getElementById('endpointInput').value.trim();
        llmConfig.model = document.getElementById('modelSelect').value;
        llmConfig.systemPrompt = document.getElementById('systemPromptInput').value.trim();
        await window.api.saveLLMConfig(llmConfig);
        settingsPanel.classList.remove('open');
        checkConnection();
    });

    // ヒントチップ
    document.querySelectorAll('.hint-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            messageInput.value = chip.dataset.prompt;
            updateSendButton();
            sendMessage();
        });
    });
}

// --- ストリーミングリスナー ---
function setupStreamListeners() {
    window.api.onLLMStreamChunk((chunk) => {
        appendToAssistantMessage(chunk);
    });

    window.api.onLLMStreamEnd(() => {
        finishStreaming();
    });

    window.api.onLLMStreamError((error) => {
        finishStreaming();
        showError(error);
    });
}

// --- メッセージ送信 ---
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isStreaming) return;

    // ユーザーメッセージ追加
    messages.push({ role: 'user', content: text });
    messageInput.value = '';
    autoResizeTextarea();
    updateSendButton();
    updateCharCount();
    renderMessages();

    // ストリーミング開始
    isStreaming = true;
    sendBtn.classList.remove('active');
    showTypingIndicator();

    // APIリクエスト用メッセージ配列を構築
    const apiMessages = [];
    if (llmConfig.systemPrompt) {
        apiMessages.push({ role: 'system', content: llmConfig.systemPrompt });
    }
    apiMessages.push(...messages);

    try {
        await window.api.sendLLMMessage(apiMessages, llmConfig.model || undefined);
    } catch (e) {
        finishStreaming();
        showError('メッセージの送信に失敗しました: ' + e.message);
    }
}

// --- アシスタントメッセージへの追記 ---
function appendToAssistantMessage(chunk) {
    removeTypingIndicator();

    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
        // 既存のアシスタントメッセージに追記
        lastMsg.content += chunk;
        // 最後のアシスタントバブルのみ更新
        const messageBubbles = messagesContainer.querySelectorAll('.message.assistant');
        const lastBubble = messageBubbles[messageBubbles.length - 1];
        if (lastBubble) {
            lastBubble.querySelector('.message-bubble').innerHTML = formatMessage(lastMsg.content);
        }
    } else {
        // 新しいアシスタントメッセージを作成 → 全体を再描画して新しいバブルを生成
        messages.push({ role: 'assistant', content: chunk });
        renderMessages();
    }

    scrollToBottom();
}

// --- ストリーミング終了 ---
function finishStreaming() {
    isStreaming = false;
    removeTypingIndicator();
    updateSendButton();

    // 最終的にマークダウンっぽい整形をかける
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
        const messageBubbles = messagesContainer.querySelectorAll('.message.assistant');
        const lastBubble = messageBubbles[messageBubbles.length - 1];
        if (lastBubble) {
            lastBubble.querySelector('.message-bubble').innerHTML = formatMessage(lastMsg.content);
        }
    }
}

// --- メッセージ描画 ---
function renderMessages() {
    // ウェルカムメッセージの表示切替
    if (welcomeMessage) {
        welcomeMessage.style.display = messages.length === 0 ? 'flex' : 'none';
    }

    // 既存のメッセージとタイピングインジケーターを削除
    messagesContainer.querySelectorAll('.message, .typing-indicator, .error-message').forEach(el => el.remove());

    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.role}`;

        const roleLabel = document.createElement('div');
        roleLabel.className = 'message-role';
        roleLabel.textContent = msg.role === 'user' ? 'あなた' : 'AI';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = formatMessage(msg.content);

        div.appendChild(roleLabel);
        div.appendChild(bubble);
        messagesContainer.appendChild(div);
    });

    scrollToBottom();
}

// --- 簡易マークダウン整形 ---
function formatMessage(text) {
    if (!text) return '';

    // markedのオプション設定 (初回のみでも良いですが念のため)
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true, // 改行を<br>に変換
            gfm: true
        });
    }

    let processedText = text;
    let isThinking = false;

    // <think>が含まれていて</think>がない場合はストリーミング中と判定
    const thinkStartCount = (processedText.match(/<think>/g) || []).length;
    const thinkEndCount = (processedText.match(/<\/think>/g) || []).length;
    if (thinkStartCount > thinkEndCount) {
        processedText += '</think>';
        isThinking = true;
    }

    // <think>タグの中身を取り出して個別にパースするためにプレースホルダーに置換
    const thinkBlocks = [];
    processedText = processedText.replace(/<think>([\s\S]*?)<\/think>/g, (match, content) => {
        const placeholder = `THINKBLOCKPLACEHOLDER${thinkBlocks.length}END`;
        thinkBlocks.push(content);
        return placeholder;
    });

    let html = '';
    // markedが読み込まれていればパース、なければ簡易エスケープ
    if (typeof marked !== 'undefined') {
        html = marked.parse(processedText);
    } else {
        html = escapeHtml(processedText).replace(/\n/g, '<br>');
    }

    // DOMPurifyでサニタイズ
    if (typeof DOMPurify !== 'undefined') {
        html = DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span', 'details', 'summary', 'div'],
            ALLOWED_ATTR: ['href', 'target', 'class', 'open']
        });
    }

    // プレースホルダーを<details>に展開
    thinkBlocks.forEach((content, index) => {
        const placeholder = `THINKBLOCKPLACEHOLDER${index}END`;
        let contentHtml = typeof marked !== 'undefined' ? marked.parse(content.trim()) : escapeHtml(content.trim()).replace(/\n/g, '<br>');

        if (typeof DOMPurify !== 'undefined') {
            contentHtml = DOMPurify.sanitize(contentHtml, {
                ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span', 'details', 'summary', 'div'],
                ALLOWED_ATTR: ['href', 'target', 'class', 'open']
            });
        }

        const isLastAndThinking = isThinking && index === thinkBlocks.length - 1;
        let detailsHtml = '';

        if (isLastAndThinking) {
            detailsHtml = `<details class="think-block thinking" open><summary class="think-summary"><span class="think-icon">💭</span> 思考中...</summary><div class="think-content markdown-body">${contentHtml}</div></details>`;
        } else {
            detailsHtml = `<details class="think-block"><summary class="think-summary"><span class="think-icon">💭</span> 推論過程を表示</summary><div class="think-content markdown-body">${contentHtml}</div></details>`;
        }

        // markedが<p>で囲んだプレースホルダーなどを置換
        const regex = new RegExp(`<p>${placeholder}</p>|${placeholder}`, 'g');
        html = html.replace(regex, detailsHtml);
    });

    return `<div class="markdown-body">${html}</div>`;
}

// --- タイピングインジケーター ---
function showTypingIndicator() {
    removeTypingIndicator();
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    messagesContainer.appendChild(indicator);
    scrollToBottom();
}

function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

// --- エラー表示 ---
function showError(msg) {
    const div = document.createElement('div');
    div.className = 'error-message';
    div.innerHTML = `<span class="error-icon">⚠️</span><span>${escapeHtml(msg)}</span>`;
    messagesContainer.appendChild(div);
    scrollToBottom();
}

// --- ユーティリティ ---
function scrollToBottom() {
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
}

function updateSendButton() {
    const hasText = messageInput.value.trim().length > 0;
    sendBtn.classList.toggle('active', hasText && !isStreaming);
}

function updateCharCount() {
    const len = messageInput.value.length;
    charCount.textContent = len > 0 ? `${len} 文字` : '';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
