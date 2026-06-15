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
export type ModelAuthMode = 'bearer' | 'none'

export interface ModelConfig {
  id: string
  type: ModelType
  name: string
  apiKey: string
  apiEndpoint: string
  model: string
  authMode?: ModelAuthMode
  maxTokens?: number
  temperature?: number
  contextWindow?: number
  extraBody?: string
}

export interface AIConfig {
  models: ModelConfig[]
}

// ─── Model Persistence (localStorage) ─────────────────────────────

const MODELS_STORAGE_KEY = 'fogot-ai-models'
const SELECTED_MODEL_KEY = 'fogot-ai-selected-model'
const SELECTED_IMAGE_MODEL_KEY = 'fogot-ai-selected-image-model'
const IMAGE_SIZE_KEY = 'fogot-ai-image-size'
const IMAGE_RESOLUTION_KEY = 'fogot-ai-image-resolution'
const IMAGE_QUALITY_KEY = 'fogot-ai-image-quality'
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
  autoSelectImageModel()
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

// ─── Selected Image Model Store ───────────────────────────────────

let selectedImageModelId = localStorage.getItem(SELECTED_IMAGE_MODEL_KEY) ?? ''
const imageModelListeners = new Set<() => void>()

function autoSelectImageModel() {
  const imageModels = config.models.filter((m) => m.type === 'image')
  if (imageModels.length > 0 && !imageModels.find((m) => m.id === selectedImageModelId)) {
    selectedImageModelId = imageModels[0].id
    try { localStorage.setItem(SELECTED_IMAGE_MODEL_KEY, selectedImageModelId) } catch {}
    imageModelListeners.forEach((fn) => fn())
  }
}

autoSelectImageModel()

export function useSelectedImageModelId(): string {
  return useSyncExternalStore(
    (listener) => {
      imageModelListeners.add(listener)
      return () => imageModelListeners.delete(listener)
    },
    () => selectedImageModelId,
  )
}

export function setSelectedImageModelId(id: string) {
  selectedImageModelId = id
  try { localStorage.setItem(SELECTED_IMAGE_MODEL_KEY, id) } catch {}
  imageModelListeners.forEach((fn) => fn())
}

export function getSelectedImageModel(): ModelConfig | undefined {
  const imageModels = getImageModels()
  return imageModels.find((m) => m.id === selectedImageModelId) ?? imageModels[0]
}

// ─── Image Generation Settings Stores ─────────────────────────────

let imageSize = localStorage.getItem(IMAGE_SIZE_KEY) ?? ''
const imageSizeListeners = new Set<() => void>()

export function useImageSize(): string {
  return useSyncExternalStore(
    (listener) => {
      imageSizeListeners.add(listener)
      return () => imageSizeListeners.delete(listener)
    },
    () => imageSize,
  )
}

export function setImageSize(size: string) {
  imageSize = size
  try { localStorage.setItem(IMAGE_SIZE_KEY, size) } catch {}
  imageSizeListeners.forEach((fn) => fn())
}

export function getImageSize(): string {
  return imageSize
}

// Resolution (1k / 2k / 4k)
let imageResolution = localStorage.getItem(IMAGE_RESOLUTION_KEY) ?? ''
const imageResolutionListeners = new Set<() => void>()

export function useImageResolution(): string {
  return useSyncExternalStore(
    (listener) => {
      imageResolutionListeners.add(listener)
      return () => imageResolutionListeners.delete(listener)
    },
    () => imageResolution,
  )
}

export function setImageResolution(res: string) {
  imageResolution = res
  try { localStorage.setItem(IMAGE_RESOLUTION_KEY, res) } catch {}
  imageResolutionListeners.forEach((fn) => fn())
}

export function getImageResolution(): string {
  return imageResolution
}

// Quality (auto / low / medium / high)
let imageQuality = localStorage.getItem(IMAGE_QUALITY_KEY) ?? ''
const imageQualityListeners = new Set<() => void>()

export function useImageQuality(): string {
  return useSyncExternalStore(
    (listener) => {
      imageQualityListeners.add(listener)
      return () => imageQualityListeners.delete(listener)
    },
    () => imageQuality,
  )
}

export function setImageQuality(q: string) {
  imageQuality = q
  try { localStorage.setItem(IMAGE_QUALITY_KEY, q) } catch {}
  imageQualityListeners.forEach((fn) => fn())
}

export function getImageQuality(): string {
  return imageQuality
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

// ─── Available Skills Store ───────────────────────────────────────

interface SkillData {
  id: string
  name: string
  description: string
  content: string
  source: string
}

let availableSkills: SkillData[] = []
const skillsListeners = new Set<() => void>()

export function useAvailableSkills(): SkillData[] {
  return useSyncExternalStore(
    (listener) => { skillsListeners.add(listener); return () => skillsListeners.delete(listener) },
    () => availableSkills,
  )
}

export function setAvailableSkills(skills: SkillData[]) {
  availableSkills = skills
  skillsListeners.forEach((fn) => fn())
}

export function getAvailableSkills(): SkillData[] {
  return availableSkills
}

const invokedSkillIds = new Set<string>()

export function addInvokedSkill(id: string) { invokedSkillIds.add(id) }
export function hasInvokedSkill(id: string): boolean { return invokedSkillIds.has(id) }
export function clearInvokedSkills() { invokedSkillIds.clear() }

// ─── Agent Selection Store ────────────────────────────────────────

let agentId = 'agent'
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
  if (id === 'image') {
    autoSelectImageModel()
    imageModelListeners.forEach((fn) => fn())
  } else {
    autoSelectChatModel()
    chatModelListeners.forEach((fn) => fn())
  }
  agentListeners.forEach((fn) => fn())
}

export function getAgentId(): string {
  return agentId
}

// ─── Top-Level View Store ─────────────────────────────────────────

export type AppView = 'chat' | 'assets'

let appView: AppView = 'chat'
const viewListeners = new Set<() => void>()

export function useAppView(): AppView {
  return useSyncExternalStore(
    (listener) => {
      viewListeners.add(listener)
      return () => viewListeners.delete(listener)
    },
    () => appView,
  )
}

export function getAppView(): AppView {
  return appView
}

export function setAppView(view: AppView) {
  appView = view
  viewListeners.forEach((fn) => fn())
}

// ─── Active Plan Store ────────────────────────────────────────────

export interface PlanStepState {
  title: string
  status: 'pending' | 'in_progress' | 'done' | 'skipped'
}

export interface ActivePlan {
  summary: string
  steps: PlanStepState[]
}

let activePlan: ActivePlan | null = null
const planListeners = new Set<() => void>()

function emitPlan() {
  planListeners.forEach((fn) => fn())
}

export function useActivePlan(): ActivePlan | null {
  return useSyncExternalStore(
    (listener) => {
      planListeners.add(listener)
      return () => planListeners.delete(listener)
    },
    () => activePlan,
  )
}

export function getActivePlan(): ActivePlan | null {
  return activePlan
}

export function setActivePlan(plan: ActivePlan | null) {
  activePlan = plan
  emitPlan()
}

export function updatePlanStep(stepIndex: number, status: PlanStepState['status']) {
  if (!activePlan || stepIndex < 0 || stepIndex >= activePlan.steps.length) return
  activePlan = {
    ...activePlan,
    steps: activePlan.steps.map((s, i) =>
      i === stepIndex ? { ...s, status } : s,
    ),
  }
  emitPlan()
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

    if (toolName === 'execute_command') {
      _activeCommandRequests.set(requestId, true)
      const cmd = (args as { command?: string }).command
      if (cmd) {
        _commandByKey.set(cmd, requestId)
      }
    }

    sendToNative('callTool', {
      requestId,
      toolName,
      args: JSON.stringify(args),
    })
  })
}

// ─── Command Streaming Output ─────────────────────────────────────

const _activeCommandRequests = new Map<string, boolean>()
const _commandOutputBuffers = new Map<string, string>()
const _commandByKey = new Map<string, string>() // command_text → requestId
type CommandOutputListener = (requestId: string, fullOutput: string) => void
const _commandOutputListeners = new Set<CommandOutputListener>()

export function getCommandOutput(requestId: string): string {
  return _commandOutputBuffers.get(requestId) ?? ''
}

export function getCommandRequestId(command: string): string | undefined {
  return _commandByKey.get(command)
}

export function onCommandOutputChange(listener: CommandOutputListener): () => void {
  _commandOutputListeners.add(listener)
  return () => _commandOutputListeners.delete(listener)
}

export function cancelCommand(requestId: string) {
  sendToNative('cancelCommand', { requestId })
}

// ─── Editor Actions ───────────────────────────────────────────────

export function openFile(path: string, startLine?: number, endLine?: number) {
  const params: Record<string, string> = { type: 'openFile', path }
  if (startLine != null) params.startLine = String(startLine)
  if (endLine != null) params.endLine = String(endLine)
  sendToNative('editorAction', params)
}

// ─── Debugger Error Buffer ────────────────────────────────────────

export interface DebuggerError {
  type: 'error' | 'warning'
  message: string
  source_file?: string
  source_line?: number
  source_func?: string
  condition?: string
  stack_trace?: string
  timestamp: number
}

const MAX_DEBUGGER_ERRORS = 200
let debuggerErrors: DebuggerError[] = []
const debuggerErrorListeners = new Set<() => void>()

function emitDebuggerErrors() {
  debuggerErrorListeners.forEach((fn) => fn())
}

export function getDebuggerErrors(): DebuggerError[] {
  return debuggerErrors
}

export function clearDebuggerErrors() {
  debuggerErrors = []
  emitDebuggerErrors()
}

export function onDebuggerErrorsChange(listener: () => void): () => void {
  debuggerErrorListeners.add(listener)
  return () => debuggerErrorListeners.delete(listener)
}

// ─── C++ → JS (chatBridge) ───────────────────────────────────────

export const chatBridge = {
  /** Resolve a pending tool RPC call. */
  onToolResult(requestId: string, resultJson: string, isError: boolean) {
    const pending = pendingRPC.get(requestId)
    if (!pending) return
    pendingRPC.delete(requestId)
    _activeCommandRequests.delete(requestId)
    if (isError) {
      pending.reject(new Error(resultJson))
    } else {
      pending.resolve(resultJson)
    }
  },

  /** Streaming output chunk from a running shell command. */
  onCommandOutput(requestId: string, chunk: string) {
    const current = _commandOutputBuffers.get(requestId) ?? ''
    const updated = current + chunk
    _commandOutputBuffers.set(requestId, updated)
    _commandOutputListeners.forEach((fn) => fn(requestId, updated))
  },

  /** @deprecated C++ no longer pushes model config; models are managed in frontend localStorage. */
  setConfig(_configJson: string) {},

  /** Add attachment from C++ file picker (path + base64 data URL for preview). */
  addAttachment(path: string, dataUrl: string = '') {
    if (path) {
      addAttachment(path, dataUrl)
    }
  },

  /** Receive a batch of runtime errors/warnings from the Godot debugger. */
  onDebuggerErrors(errorsJson: string) {
    try {
      const batch = JSON.parse(errorsJson) as Omit<DebuggerError, 'timestamp'>[]
      const now = Date.now()
      const entries: DebuggerError[] = batch.map((e) => ({ ...e, timestamp: now }))
      debuggerErrors = [...debuggerErrors, ...entries].slice(-MAX_DEBUGGER_ERRORS)
      emitDebuggerErrors()
    } catch { /* malformed JSON, skip */ }
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
const SUPPRESSED_WARNINGS = ['ToolInvocationTracker']
console.warn = (...args: unknown[]) => {
  _origConsoleWarn.apply(console, args)
  const msg = args.map(stringify).join(' ').trim()
  if (msg && !SUPPRESSED_WARNINGS.some(s => msg.includes(s))) logToEditor('warn', msg)
}

// Notify C++ that the JS bridge is ready.
sendToNative('bridgeReady')
