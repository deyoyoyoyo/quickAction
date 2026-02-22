const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // サービス関連
  getServices: () => ipcRenderer.invoke('get-services'),
  saveServices: (services) => ipcRenderer.invoke('save-services', services),
  openService: (service) => ipcRenderer.invoke('open-service', service),

  // 設定画面
  openSettings: () => ipcRenderer.invoke('open-settings'),

  // バー設定
  getBarConfig: () => ipcRenderer.invoke('get-bar-config'),
  saveBarConfig: (config) => ipcRenderer.invoke('save-bar-config', config),

  // ウィンドウ操作
  closeWindow: () => ipcRenderer.invoke('close-window'),
  minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),

  // 格納/展開
  toggleCollapse: () => ipcRenderer.invoke('toggle-collapse'),
  moveTabY: (deltaY) => ipcRenderer.invoke('move-tab-y', deltaY),

  // イベントリスナー
  onServicesUpdated: (callback) => {
    ipcRenderer.on('services-updated', (event, services) => callback(services));
  },
  onCollapseChanged: (callback) => {
    ipcRenderer.on('collapse-changed', (event, collapsed) => callback(collapsed));
  },

  // LLM API
  getLLMConfig: () => ipcRenderer.invoke('get-llm-config'),
  saveLLMConfig: (config) => ipcRenderer.invoke('save-llm-config', config),
  checkLLMConnection: () => ipcRenderer.invoke('check-llm-connection'),
  sendLLMMessage: (messages, model) => ipcRenderer.invoke('send-llm-message', messages, model),
  onLLMStreamChunk: (callback) => {
    ipcRenderer.on('llm-stream-chunk', (event, chunk) => callback(chunk));
  },
  onLLMStreamEnd: (callback) => {
    ipcRenderer.on('llm-stream-end', () => callback());
  },
  onLLMStreamError: (callback) => {
    ipcRenderer.on('llm-stream-error', (event, error) => callback(error));
  }
});
