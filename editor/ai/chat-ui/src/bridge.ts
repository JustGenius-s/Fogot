/**
 * C++ ↔ JS bridge for Fogot AI Chat.
 *
 * Simplified RPC protocol (post-refactor):
 *   JS → C++: callTool, getConfig, editorAction
 *   C++ → JS: chatBridge.onToolResult, chatBridge.setConfig, chatBridge.addAttachment
 */

import { useSyncExternalStore } from 'react'

// ─── Model & Config Types ─────────────────────────────────────────

export type ModelType = 'chat' | 'image'

export interface ModelConfig {
  id: string
  type: ModelType
  name: string
  apiKey: string
  apiEndpoint: string
  model: string
  maxTokens?: number
  temperature?: number
}

export interface AIConfig {
  models: ModelConfig[]
}

// ─── Model Persistence (localStorage) ─────────────────────────────

const MODELS_STORAGE_KEY = 'fogot-ai-models'
const SELECTED_MODEL_KEY = 'fogot-ai-selected-model'

function loadModelsFromStorage(): ModelConfig[] {
  try {
    const raw = localStorage.getItem(MODELS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveModelsToStorage(models: ModelConfig[]) {
  try {
    localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(models))
  } catch { /* quota exceeded, etc. */ }
}

// ─── Config Store ─────────────────────────────────────────────────

let config: AIConfig = { models: loadModelsFromStorage() }

const configListeners = new Set<() => void>()

function emitConfig() {
  config = { ...config }
  configListeners.forEach((fn) => fn())
}

export function useConfig(): AIConfig {
  return useSyncExternalStore(
    (listener) => {
      configListeners.add(listener)
      return () => configListeners.delete(listener)
    },
    () => config,
  )
}

export function getConfig(): AIConfig {
  return config
}

export function getChatModels(): ModelConfig[] {
  return config.models.filter((m) => m.type === 'chat')
}

export function getImageModels(): ModelConfig[] {
  return config.models.filter((m) => m.type === 'image')
}

/** Replace the full models list (called from settings UI). */
export function setModels(models: ModelConfig[]) {
  config = { ...config, models }
  saveModelsToStorage(models)
  autoSelectChatModel()
  emitConfig()
}

// ─── Selected Chat Model Store ────────────────────────────────────

let selectedChatModelId = localStorage.getItem(SELECTED_MODEL_KEY) ?? ''
const chatModelListeners = new Set<() => void>()

function autoSelectChatModel() {
  const chatModels = config.models.filter((m) => m.type === 'chat')
  if (chatModels.length > 0 && !chatModels.find((m) => m.id === selectedChatModelId)) {
    selectedChatModelId = chatModels[0].id
    try { localStorage.setItem(SELECTED_MODEL_KEY, selectedChatModelId) } catch {}
    chatModelListeners.forEach((fn) => fn())
  }
}

// Auto-select on startup if we loaded models from storage.
autoSelectChatModel()

export function useSelectedChatModelId(): string {
  return useSyncExternalStore(
    (listener) => {
      chatModelListeners.add(listener)
      return () => chatModelListeners.delete(listener)
    },
    () => selectedChatModelId,
  )
}

export function setSelectedChatModelId(id: string) {
  selectedChatModelId = id
  try { localStorage.setItem(SELECTED_MODEL_KEY, id) } catch {}
  chatModelListeners.forEach((fn) => fn())
}

export function getSelectedChatModel(): ModelConfig | undefined {
  const chatModels = getChatModels()
  return chatModels.find((m) => m.id === selectedChatModelId) ?? chatModels[0]
}

// ─── Pending Attachments Store ────────────────────────────────────

export interface PendingAttachment {
  path: string
  dataUrl: string
}

let pendingAttachments: PendingAttachment[] = []
const attachmentListeners = new Set<() => void>()

function emitAttachments() {
  pendingAttachments = [...pendingAttachments]
  attachmentListeners.forEach((fn) => fn())
}

export function usePendingAttachments(): PendingAttachment[] {
  return useSyncExternalStore(
    (listener) => {
      attachmentListeners.add(listener)
      return () => attachmentListeners.delete(listener)
    },
    () => pendingAttachments,
  )
}

export function addAttachment(path: string, dataUrl: string) {
  pendingAttachments = [...pendingAttachments, { path, dataUrl }]
  emitAttachments()
}

export function removeAttachment(index: number) {
  pendingAttachments = pendingAttachments.filter((_, i) => i !== index)
  emitAttachments()
}

export function clearAttachments() {
  pendingAttachments = []
  emitAttachments()
}

export function getAttachments(): PendingAttachment[] {
  return pendingAttachments
}

// ─── Agent Selection Store ────────────────────────────────────────

let agentId = 'chat'
const agentListeners = new Set<() => void>()

export function useAgentId(): string {
  return useSyncExternalStore(
    (listener) => {
      agentListeners.add(listener)
      return () => agentListeners.delete(listener)
    },
    () => agentId,
  )
}

export function setAgentId(id: string) {
  agentId = id
  agentListeners.forEach((fn) => fn())
}

export function getAgentId(): string {
  return agentId
}

// ─── JS → C++ ────────────────────────────────────────────────────

export function sendToNative(action: string, params: Record<string, string> = {}) {
  // macOS: WKWebView message handler
  if ((window as any).webkit?.messageHandlers?.fogot) {
    ;(window as any).webkit.messageHandlers.fogot.postMessage({ action, ...params })
    return
  }

  // Windows: WebView2 postMessage (JSON string → C++ WebMessageReceived)
  if ((window as any).chrome?.webview) {
    ;(window as any).chrome.webview.postMessage(JSON.stringify({ action, ...params }))
    return
  }

  // Fallback: fogot:// URL scheme via hidden iframe
  const query = new URLSearchParams(params).toString()
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  iframe.src = `fogot://${action}${query ? '?' + query : ''}`
  document.body.appendChild(iframe)
  setTimeout(() => iframe.remove(), 100)
}

// ─── Tool RPC ─────────────────────────────────────────────────────

const pendingRPC = new Map<
  string,
  { resolve: (v: string) => void; reject: (e: Error) => void }
>()
let rpcCounter = 0

/**
 * Call a C++ tool via the bridge. Returns a Promise that resolves
 * when C++ calls chatBridge.onToolResult with the matching requestId.
 */
export function bridgeRPC(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = `rpc-${++rpcCounter}-${Date.now()}`
    pendingRPC.set(requestId, { resolve, reject })
    sendToNative('callTool', {
      requestId,
      toolName,
      args: JSON.stringify(args),
    })
  })
}

// ─── Editor Actions ───────────────────────────────────────────────

export function openFile(path: string) {
  sendToNative('editorAction', { type: 'openFile', path })
}

// ─── C++ → JS (chatBridge) ───────────────────────────────────────

export const chatBridge = {
  /** Resolve a pending tool RPC call. */
  onToolResult(requestId: string, resultJson: string, isError: boolean) {
    const pending = pendingRPC.get(requestId)
    if (!pending) return
    pendingRPC.delete(requestId)
    if (isError) {
      pending.reject(new Error(resultJson))
    } else {
      pending.resolve(resultJson)
    }
  },

  /** @deprecated C++ no longer pushes model config; models are managed in frontend localStorage. */
  setConfig(_configJson: string) {},

  /** Add attachment from C++ file picker (path + base64 data URL for preview). */
  addAttachment(path: string, dataUrl: string = '') {
    if (path) {
      addAttachment(path, dataUrl)
    }
  },
}

// Expose to global scope for C++ evaluateJavaScript calls.
;(window as any).chatBridge = chatBridge

// ─── Global Error Forwarding ──────────────────────────────────────

function logToEditor(level: 'log' | 'warn' | 'error', msg: string) {
  sendToNative('debugLog', { payload: msg, level })
}

function stringify(v: unknown): string {
  if (v instanceof Error) return `${v.message}${v.stack ? '\n' + v.stack : ''}`
  if (typeof v === 'string') return v
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  try { return JSON.stringify(v, null, 2) } catch { return Object.prototype.toString.call(v) }
}

window.onerror = (_event, source, line, col, error) => {
  logToEditor('error', `${error?.message ?? _event}\n  at ${source}:${line}:${col}`)
}

window.onunhandledrejection = (e: PromiseRejectionEvent) => {
  const reason = e.reason
  const msg = reason instanceof Error ? `${reason.message}${reason.stack ? '\n' + reason.stack : ''}` : stringify(reason)
  logToEditor('error', `Unhandled Promise rejection: ${msg}`)
}

const _origConsoleError = console.error
console.error = (...args: unknown[]) => {
  _origConsoleError.apply(console, args)
  const msg = args.map(stringify).join(' ').trim()
  if (msg) logToEditor('error', msg)
}

const _origConsoleWarn = console.warn
console.warn = (...args: unknown[]) => {
  _origConsoleWarn.apply(console, args)
  const msg = args.map(stringify).join(' ').trim()
  if (msg) logToEditor('warn', msg)
}

// Notify C++ that the JS bridge is ready.
sendToNative('bridgeReady')
