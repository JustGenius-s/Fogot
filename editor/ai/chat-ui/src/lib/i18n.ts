/**
 * Lightweight i18n for the chat UI.
 *
 * The editor pushes its UI locale to the webview (via `chatBridge.setLocale`)
 * on startup; we normalize it to `en` or `zh` and default to English. UI text
 * is looked up by key from the {@link messages} dictionary. Components subscribe
 * to locale changes with {@link useTranslation}; non-component code can call the
 * standalone {@link t}.
 */

import { useSyncExternalStore } from 'react'

export type Locale = 'en' | 'zh'

const LOCALE_KEY = 'fogot-ai-locale'

/** Map any editor locale string (e.g. "zh_CN", "en_US") to a supported locale. */
function normalize(raw: string): Locale {
  return raw.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

let locale: Locale = (() => {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch { /* ignore */ }
  return 'en'
})()

const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return locale
}

/** Set the active locale from a raw editor locale string. */
export function setLocale(raw: string) {
  const next = normalize(raw)
  if (next === locale) return
  locale = next
  try { localStorage.setItem(LOCALE_KEY, next) } catch { /* ignore */ }
  listeners.forEach((fn) => fn())
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => locale,
  )
}

// ─── Dictionary ────────────────────────────────────────────────────

interface Entry {
  en: string
  zh: string
}

const messages = {
  // ── Common ──
  'common.refresh': { en: 'Refresh', zh: '刷新' },
  'common.delete': { en: 'Delete', zh: '删除' },
  'common.cancel': { en: 'Cancel', zh: '取消' },
  'common.save': { en: 'Save', zh: '保存' },
  'common.update': { en: 'Update', zh: '更新' },
  'common.add': { en: 'Add', zh: '添加' },
  'common.copyPath': { en: 'Copy Path', zh: '复制路径' },
  'common.dangerZone': { en: 'Danger zone', zh: '危险操作' },
  'common.loading': { en: 'Loading…', zh: '加载中…' },
  'common.chat': { en: 'Chat', zh: '对话' },
  'common.more': { en: 'More', zh: '更多' },
  'common.edit': { en: 'Edit', zh: '编辑' },
  'common.copy': { en: 'Copy', zh: '复制' },
  'common.previous': { en: 'Previous', zh: '上一个' },
  'common.next': { en: 'Next', zh: '下一个' },
  'common.play': { en: 'Play', zh: '播放' },
  'common.pause': { en: 'Pause', zh: '暂停' },

  // ── Mode names ──
  'mode.agent': { en: 'Agent', zh: '代理' },
  'mode.plan': { en: 'Plan', zh: '规划' },
  'mode.design': { en: 'Design', zh: '设计' },
  'mode.audio': { en: 'Audio', zh: '音频' },
  'mode.image': { en: 'Image', zh: '图像' },

  // ── Model type labels ──
  'type.chat': { en: 'Chat', zh: '对话' },
  'type.image': { en: 'Image', zh: '图像' },
  'type.audio': { en: 'Audio', zh: '音频' },

  // ── Thread chrome ──
  'thread.newChat': { en: 'New Chat', zh: '新对话' },
  'thread.designs': { en: 'Designs', zh: '设计库' },
  'thread.scrollToBottom': { en: 'Scroll to bottom', zh: '滚动到底部' },
  'thread.sendMessage': { en: 'Send message', zh: '发送消息' },
  'thread.stopGenerating': { en: 'Stop generating', zh: '停止生成' },
  'thread.messageInput': { en: 'Message input', zh: '消息输入框' },
  'thread.placeholder': { en: 'Send a message...', zh: '发送消息…' },
  'thread.welcomeTitle': { en: 'Hello there!', zh: '你好！' },
  'thread.welcomeSubtitle': { en: 'How can I help you today?', zh: '今天我能帮你做什么？' },
  'thread.exportMarkdown': { en: 'Export as Markdown', zh: '导出为 Markdown' },
  'thread.planStarted': { en: 'Plan execution started', zh: '计划开始执行' },

  // ── Attachments ──
  'attachment.add': { en: 'Add Attachment', zh: '添加附件' },
  'attachment.removeFile': { en: 'Remove file', zh: '移除文件' },
  'attachment.remove': { en: 'Remove attachment', zh: '移除附件' },
  'attachment.imagePreview': { en: 'Image Attachment Preview', zh: '图片附件预览' },
  'attachment.preview': { en: 'Attachment preview', zh: '附件预览' },
  'attachment.typeImage': { en: 'Image', zh: '图片' },
  'attachment.typeDocument': { en: 'Document', zh: '文档' },
  'attachment.typeFile': { en: 'File', zh: '文件' },
  'attachment.itemLabel': { en: '{type} attachment', zh: '{type}附件' },

  // ── Settings ──
  'settings.title': { en: 'Settings', zh: '设置' },
  'settings.description': {
    en: 'Manage AI model configurations and preferences.',
    zh: '管理 AI 模型配置与偏好。',
  },
  'settings.chatModels': { en: 'Chat Models', zh: '对话模型' },
  'settings.imageModels': { en: 'Image Models', zh: '图像模型' },
  'settings.audioModels': { en: 'Audio Models', zh: '音频模型' },
  'settings.newModel': { en: 'New {type} Model', zh: '新建{type}模型' },
  'settings.editModel': { en: 'Edit {type} Model', zh: '编辑{type}模型' },
  'settings.name': { en: 'Name', zh: '名称' },
  'settings.modelId': { en: 'Model ID', zh: '模型 ID' },
  'settings.apiEndpoint': { en: 'API Endpoint', zh: 'API 地址' },
  'settings.apiKey': { en: 'API Key', zh: 'API 密钥' },
  'settings.authMode': { en: 'Auth Mode', zh: '鉴权方式' },
  'settings.authBearer': { en: 'Bearer header', zh: 'Bearer 鉴权头' },
  'settings.authNone': { en: 'No automatic auth header', zh: '不自动添加鉴权头' },
  'settings.authHint': {
    en: 'APIMart uses Bearer header. Use no automatic auth header when an OpenAPI gateway or proxy handles authentication.',
    zh: 'APIMart 使用 Bearer 鉴权头。若由 OpenAPI 网关或代理处理鉴权，则选择不自动添加鉴权头。',
  },
  'settings.maxTokens': { en: 'Max Tokens', zh: '最大 Token 数' },
  'settings.temperature': { en: 'Temperature', zh: '温度' },
  'settings.contextWindow': { en: 'Context Window (tokens)', zh: '上下文窗口（token）' },
  'settings.contextHint': { en: 'DeepSeek: 1M, GPT-4o: 128k, Claude: 200k', zh: 'DeepSeek：1M，GPT-4o：128k，Claude：200k' },
  'settings.extraBody': { en: 'Extra Body (JSON)', zh: '额外请求体（JSON）' },
  'settings.extraBodyHint': {
    en: 'Additional JSON merged into request body.',
    zh: '合并进请求体的额外 JSON。',
  },
  'settings.provider': { en: 'Provider', zh: '提供方' },
  'settings.providerAuto': { en: 'Auto-detect', zh: '自动检测' },
  'settings.imageProviderHint': {
    en: 'Leave on Auto-detect unless you need to force a specific provider.',
    zh: '除非需要强制指定提供方，否则保持自动检测。',
  },
  'settings.providerHint': {
    en: 'Audio backends differ per provider. Model ID is the default speech model (e.g. speech-2.5-hd-preview); music uses music-2.6.',
    zh: '不同提供方的音频接口不同。模型 ID 为默认语音合成模型（如 speech-2.5-hd-preview）；音乐使用 music-2.6。',
  },
  'settings.groupId': { en: 'Group ID (optional)', zh: 'Group ID（可选）' },
  'settings.groupIdHint': {
    en: 'Appended as a ?GroupId= query param. Required by some MiniMax accounts.',
    zh: '作为 ?GroupId= 查询参数附加。部分 MiniMax 账号需要。',
  },
  'settings.noModelsYet': { en: 'No {type} models yet', zh: '还没有{type}模型' },

  // ── App-level status ──
  'app.aiChat': { en: 'AI Chat', zh: 'AI 对话' },
  'app.unconfigured': { en: 'Click ⚙ to add a chat model.', zh: '点击 ⚙ 添加一个对话模型。' },
  'app.ready': { en: 'Ready', zh: '就绪' },
  'app.noApiKey': { en: 'No API key configured', zh: '未配置 API 密钥' },
  'app.noImageModel': { en: 'No image model configured', zh: '未配置图像模型' },

  // ── Audio / voice library ──
  'audio.voiceLibrary': { en: 'Voices', zh: '音色库' },
  'audio.voicesCount': { en: '{count} voices', zh: '{count} 个音色' },
  'audio.noVoices': { en: 'No voices yet', zh: '还没有音色' },
  'audio.noVoicesHint': {
    en: 'Switch to Audio mode and ask the AI to design or clone a voice',
    zh: '切换到 Audio 模式，让 AI 设计或克隆一个音色',
  },
  'audio.kindClone': { en: 'Cloned', zh: '克隆' },
  'audio.kindDesign': { en: 'Designed', zh: '生成' },
  'audio.preview': { en: 'Preview', zh: '试听' },
  'audio.copyVoiceId': { en: 'Copy voice id', zh: '复制 voice_id' },
  'audio.noAudioModel': { en: 'No audio model', zh: '未配置音频模型' },
  'audio.toolDesign': { en: 'Voice Design', zh: '音色生成' },
  'audio.toolClone': { en: 'Voice Clone', zh: '音色克隆' },
  'audio.toolSpeech': { en: 'Character Voice', zh: '角色配音' },
  'audio.toolMusic': { en: 'Background Music', zh: '背景音乐' },
  'audio.referenceLabel': { en: 'Reference: {path}', zh: '参考音频：{path}' },

  // ── Design ──
  'design.designsCount': { en: '{count} designs', zh: '{count} 个设计' },
  'design.noDesigns': { en: 'No designs yet', zh: '还没有设计' },
  'design.noDesignsHint': {
    en: 'Switch to Design mode and ask the AI to design something',
    zh: '切换到 Design 模式，让 AI 设计内容',
  },
  'design.label': { en: 'Design', zh: '设计' },
  'design.openView': { en: 'Design View', zh: '设计视图' },
  'design.voiceLine': { en: 'Voice', zh: '角色配音' },
  'design.bgm': { en: 'BGM', zh: '背景音乐' },
  'design.folderNotFound': { en: 'Folder not found: {dir}', zh: '未找到文件夹：{dir}' },

  // ── Assets ──
  'assets.title': { en: 'Assets', zh: '资源' },
  'assets.assetsCount': { en: '{count} assets', zh: '{count} 个资源' },
  'assets.noAssets': { en: 'No image assets in this folder', zh: '此文件夹没有图片资源' },
  'assets.noAssetsHint': {
    en: 'Generate in Image mode, or add images to this folder',
    zh: '在 Image 模式生成，或往此文件夹添加图片',
  },
  'assets.folderNotFound': { en: 'Folder not found: {dir}', zh: '未找到文件夹：{dir}' },
  'assets.useInChat': { en: 'Use in Chat', zh: '在对话中使用' },
  'assets.openInEditor': { en: 'Open in Editor', zh: '在编辑器中打开' },
  'assets.selectAsset': { en: 'Select asset', zh: '选择资源' },
  'assets.chooseFromAssets': { en: 'Choose from assets', zh: '从资源中选择' },
  'assets.saveToAssets': { en: 'Save to assets', zh: '保存到资源库' },
  'assets.saveFailed': { en: 'Save failed, retry', zh: '保存失败，重试' },
  'assets.savedTo': { en: 'Saved to {path}', zh: '已保存到 {path}' },

  // ── Image generation settings / progress ──
  'img.auto': { en: 'Auto', zh: '自动' },
  'img.low': { en: 'Low', zh: '低' },
  'img.medium': { en: 'Medium', zh: '中' },
  'img.high': { en: 'High', zh: '高' },
  'gen.creating': { en: 'Creating image', zh: '正在创建图像' },
  'gen.sketching': { en: 'Sketching', zh: '起稿中' },
  'gen.draft': { en: 'Generating draft', zh: '生成草稿' },
  'gen.refining': { en: 'Refining details', zh: '细化细节' },
  'gen.almostDone': { en: 'Almost done', zh: '即将完成' },
} satisfies Record<string, Entry>

export type MessageKey = keyof typeof messages

/** Translate a key for the active locale, interpolating `{name}` vars. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const entry = messages[key]
  let text = entry ? entry[locale] ?? entry.en : key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return text
}

/** Hook returning a locale-bound `t` (re-renders on locale change). */
export function useTranslation(): { t: typeof t; locale: Locale } {
  const current = useLocale()
  return { t, locale: current }
}
