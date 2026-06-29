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
  'common.back': { en: 'Back', zh: '返回' },
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
  'mode.image': { en: 'Image', zh: '图像' },

  // ── Mode intros (shown in the hover popup when picking a mode) ──
  'mode.agent.intro.tagline': {
    en: 'General-purpose coding agent that edits your Godot project via tools.',
    zh: '通用编码代理，通过工具直接读写 Godot 项目。',
  },
  'mode.agent.intro.caps': {
    en: 'Read / write / edit / search project files\nRun shell commands when needed\nDelegate sub-tasks to specialized agents',
    zh: '读取 / 写入 / 编辑 / 搜索项目文件\n需要时运行 shell 命令\n委派子任务给专用代理',
  },
  'mode.agent.intro.when': {
    en: 'For everyday coding tasks — fixing bugs, adding features, refactoring.',
    zh: '适合日常编码任务——修 bug、加功能、重构代码。',
  },
  'mode.plan.intro.tagline': {
    en: 'Plan & break down work via read-only exploration before execution.',
    zh: '执行前先做只读探索，规划并拆解任务。',
  },
  'mode.plan.intro.caps': {
    en: 'Inspect the codebase to understand structure\nProduce a plan and hand off via exit plan mode',
    zh: '浏览代码库了解结构\n产出计划并通过退出规划模式交接',
  },
  'mode.plan.intro.when': {
    en: 'Use at the start of a non-trivial task to scope work and direction.',
    zh: '在开始非平凡任务时使用，先界定范围与方向。',
  },
  'mode.design.intro.tagline': {
    en: 'Design game content and audio — characters, props, levels, voice and BGM.',
    zh: '为游戏设计内容与音频——角色、道具、关卡、配音与 BGM。',
  },
  'mode.design.intro.caps': {
    en: 'Markdown design docs for characters / props / levels\nGenerate images via the image model\nDesign / clone voices, synthesize speech and BGM',
    zh: '用 Markdown 设计稿记录角色 / 道具 / 关卡\n通过图像模型生成配图\n设计 / 克隆音色、合成台词与背景音乐',
  },
  'mode.design.intro.when': {
    en: 'For content creation & sound design — no code is written.',
    zh: '用于内容创作与声音设计，不写代码。',
  },
  'mode.image.intro.tagline': {
    en: 'Generate images directly from prompts — no chat model required.',
    zh: '直接根据提示生成图像——无需对话模型。',
  },
  'mode.image.intro.caps': {
    en: 'Text-to-image generation\nBrowse and manage generated assets',
    zh: '文本生成图像\n浏览与管理生成的资源',
  },
  'mode.image.intro.when': {
    en: 'Use when you only need to produce pictures.',
    zh: '只需出图时使用。',
  },
  'mode.intro.whenLabel': { en: 'When', zh: '何时使用' },
  'mode.intro.capLabel': { en: 'Capabilities', zh: '能力' },

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
  'settings.capabilities': { en: 'Capabilities', zh: '模型能力' },
  'settings.capHint': {
    en: 'Auto-detected from the model ID. Override if detection is wrong — text-only models should disable image input.',
    zh: '根据模型 ID 自动识别。识别有误时可手动覆盖——纯文本模型应关闭图片输入。',
  },
  'settings.capVision': { en: 'Image input (vision)', zh: '图片输入（视觉）' },
  'settings.capToolCall': { en: 'Tool calling', zh: '工具调用' },
  'settings.capReasoning': { en: 'Reasoning', zh: '推理思考' },
  'settings.sourceCatalog': { en: 'From catalog', zh: '从目录添加' },
  'settings.sourceCustom': { en: 'Custom endpoint', zh: '自定义端点' },
  'settings.selectProvider': { en: 'Provider', zh: '提供方' },
  'settings.selectModel': { en: 'Model', zh: '模型' },
  'settings.searchProviders': { en: 'Search providers…', zh: '搜索提供方…' },
  'settings.searchModels': { en: 'Search models…', zh: '搜索模型…' },
  'settings.catalogLoading': { en: 'Loading models.dev catalog…', zh: '正在加载 models.dev 目录…' },
  'settings.catalogError': { en: 'Failed to load catalog. Check your connection.', zh: '目录加载失败，请检查网络连接。' },
  'settings.catalogRetry': { en: 'Retry', zh: '重试' },
  'settings.pickProviderFirst': { en: 'Select a provider first', zh: '请先选择提供方' },
  'settings.endpointPrefilled': {
    en: 'Auto-filled from the catalog. Edit only for self-hosted or regional endpoints.',
    zh: '已根据目录自动填充。仅自建或区域端点时才需修改。',
  },
  'settings.unsupportedProtocol': {
    en: 'Uses a non OpenAI-compatible protocol — falls back to OpenAI-compatible and may not work.',
    zh: '该提供方使用非 OpenAI 兼容协议，将回退到 OpenAI 兼容方式，可能无法正常工作。',
  },
  'settings.contextFromCatalog': { en: 'Auto from catalog', zh: '目录自动识别' },
  'settings.advanced': { en: 'Advanced', zh: '高级设置' },
  'settings.providers': { en: 'Providers', zh: '模型提供方' },
  'settings.providersHint': {
    en: 'Connect a provider once; enable its chat, image or audio models. Image/audio backends are limited to providers with an implemented transport.',
    zh: '连接一次提供方，即可启用它的对话/图像/音频模型。图像、音频后端仅限已实现对接的提供方。',
  },
  'settings.addProvider': { en: 'Connect provider', zh: '连接提供方' },
  'settings.newProvider': { en: 'Connect provider', zh: '连接提供方' },
  'settings.editProvider': { en: 'Edit provider', zh: '编辑提供方' },
  'settings.noProvidersYet': {
    en: 'No providers connected. Connect one to enable chat models.',
    zh: '尚未连接提供方。连接后即可启用对话模型。',
  },
  'settings.enableModels': { en: 'Enable models', zh: '启用模型' },
  'settings.fetchModels': { en: 'Fetch list', zh: '拉取列表' },
  'settings.fetchHint': {
    en: 'Loads the model list from the endpoint’s /models (OpenAI / OpenRouter standard).',
    zh: '从端点的 /models 接口拉取模型列表（OpenAI / OpenRouter 标准）。',
  },
  'settings.fetchError': { en: 'Fetch failed', zh: '拉取失败' },
  'settings.orAddManually': { en: 'Or add a model id manually', zh: '或手动添加模型 ID' },
  'settings.apiKeyOptional': { en: 'API Key (optional)', zh: 'API Key（可选）' },
  'settings.enabledModels': { en: '{count} enabled', zh: '已启用 {count} 个' },
  'settings.noModelsMatch': { en: 'No matching models', zh: '没有匹配的模型' },
  'selector.capVision': { en: 'Supports image input', zh: '支持图片输入' },
  'selector.capToolCall': { en: 'Supports tool calling', zh: '支持工具调用' },
  'selector.capReasoning': { en: 'Supports reasoning', zh: '支持推理' },
  'selector.customGroup': { en: 'Custom', zh: '自定义' },
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
  'design.search': { en: 'Search designs…', zh: '搜索设计…' },
  'design.allTypes': { en: 'All', zh: '全部' },
  'design.untyped': { en: 'Untyped', zh: '未分类' },
  'design.viewList': { en: 'List', zh: '列表' },
  'design.viewGrid': { en: 'Grid', zh: '网格' },
  'design.fields': { en: 'Attributes', zh: '属性' },
  'design.stats': { en: 'Stats', zh: '数值' },
  'design.details': { en: 'Details', zh: '细节' },
  'design.lore': { en: 'Lore', zh: '设定' },
  'design.audio': { en: 'Audio', zh: '音频' },
  'design.relationships': { en: 'Relationships', zh: '关系' },
  'design.references': { en: 'References', zh: '引用' },
  'design.referencedBy': { en: 'Referenced by', zh: '被引用' },
  'design.danglingRef': { en: 'Missing: {id}', zh: '缺失：{id}' },
  'design.noFields': { en: 'No structured attributes', zh: '没有结构化属性' },
  'design.emptyValue': { en: '—', zh: '—' },
  'design.tags': { en: 'Tags', zh: '标签' },
  'design.tagsHint': { en: 'Comma-separated', zh: '逗号分隔' },
  'design.sync': { en: 'Sync to project', zh: '同步到项目' },
  'design.synced': { en: 'Synced', zh: '已同步' },
  'design.syncFailed': { en: 'Sync failed', zh: '同步失败' },

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
  'assets.search': { en: 'Search assets…', zh: '搜索资源…' },
  'assets.saveToAssets': { en: 'Save to assets', zh: '保存到资源库' },
  'assets.saveFailed': { en: 'Save failed, retry', zh: '保存失败，重试' },
  'assets.savedTo': { en: 'Saved to {path}', zh: '已保存到 {path}' },

  // ── Image generation settings / progress ──
  'img.auto': { en: 'Auto', zh: '自动' },
  'img.low': { en: 'Low', zh: '低' },
  'img.medium': { en: 'Medium', zh: '中' },
  'img.high': { en: 'High', zh: '高' },
  'img.transparent': { en: 'Transparent', zh: '透明' },
  'img.opaque': { en: 'Opaque', zh: '不透明' },
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
