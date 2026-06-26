import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import {
  AssistantRuntimeProvider,
  RuntimeAdapterProvider,
  useAui,
  useRemoteThreadListRuntime,
} from '@assistant-ui/react'
import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { DirectChatTransport, ToolLoopAgent, stepCountIs } from 'ai'
import { createChatModel } from '@/lib/provider-registry'
import { ensureCatalog } from '@/lib/models-catalog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Thread } from '@/components/assistant-ui/thread'
import { ModelSettings, SettingsView } from '@/components/assistant-ui/model-settings'
import { useConfig, useAgentId, useSelectedChatModelId, getSelectedChatModel, getAttachments, clearAttachments, setActivePlan, useAppView, getAvailableSkills } from '@/bridge'
import { AssetMode } from '@/components/assets/asset-mode'
import { DesignMode } from '@/components/assets/design-mode'
import { AudioMode } from '@/components/assets/audio-mode'
import { allTools, getToolsForAgent } from '@/ai/tools'
import { resolveCapabilities, resolveModelLimits, VISION_REQUIRED_TOOLS } from '@/lib/model-capabilities'
import { getDefaultSystemPrompt, getPlanSystemPrompt, getDesignSystemPrompt, getAgent } from '@/ai/agents'
import { loadDesignTemplate } from '@/lib/designs'
import { createImageChatTransport } from '@/ai/image-transport'
import { configureDelegateTool } from '@/ai/tools'
import {
  updateUsageSnapshot,
  getLastUsage,
  setCurrentThreadId,
} from '@/ai/context-manager'
import { compactIfNeeded } from '@/ai/compaction'
import type { ModelConfig } from '@/bridge'
import { extractMentions, resolveMentionContext } from '@/ai/mentions'
import { DEFAULT_MODE_ID } from '@/components/assistant-ui/mode-selector'
import { threadListAdapter } from '@/lib/thread-storage'
import { WriteFileToolUI } from '@/components/custom/write-file-tool-ui'
import { EditFileToolUI } from '@/components/custom/edit-file-tool-ui'
import { DelegateTaskToolUI } from '@/components/custom/delegate-task-tool-ui'
import { ExitPlanModeToolUI } from '@/components/custom/create-plan-tool-ui'
import { DesignToolUI } from '@/components/custom/design-tool-ui'
import {
  DesignVoiceToolUI,
  CloneVoiceToolUI,
  GenerateSpeechToolUI,
  GenerateMusicToolUI,
} from '@/components/custom/audio-tool-ui'
import { SkillToolUI } from '@/components/custom/skill-tool-ui'
import { QuestionToolUI } from '@/components/custom/question-tool-ui'
import { ExecuteCommandToolUI } from '@/components/custom/execute-command-tool-ui'
import {
  ReadFileToolUI,
  ListFilesToolUI,
  DeleteFileToolUI,
  CopyFileToolUI,
  MoveFileToolUI,
  SearchFilesToolUI,
} from '@/components/custom/file-ops-tool-ui'
import { getBuiltinSkills, loadProjectSkills } from '@/ai/skills'
import { setAvailableSkills, clearInvokedSkills } from '@/bridge'
import { useTranslation } from '@/lib/i18n'

// ─── Transport Wrapper (attachments + context compaction) ────────

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

/**
 * Drop image parts from a message's parts/content when the model can't see
 * images. Keeps text and other parts intact.
 */
function stripImageParts(msg: any): any {
  const isImagePart = (p: any) =>
    p?.type === 'image' ||
    ((p?.type === 'file' || p?.type === 'image-url') &&
      typeof p?.mediaType === 'string' &&
      p.mediaType.startsWith('image/'))

  let changed = false
  const map = (arr: any[] | undefined) => {
    if (!Array.isArray(arr)) return arr
    const next = arr.filter((p) => !isImagePart(p))
    if (next.length !== arr.length) changed = true
    return next
  }
  const parts = map(msg.parts)
  const content = Array.isArray(msg.content) ? map(msg.content) : msg.content
  return changed ? { ...msg, parts, content } : msg
}

function wrapTransport(
  inner: DirectChatTransport,
  chatModel: ModelConfig,
  options: { supportsVision?: boolean },
): DirectChatTransport {
  const origSend = inner.sendMessages.bind(inner)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inner.sendMessages = async (args: any) => {
    let msgs = [...args.messages]

    // --- Strip images for text-only models ---
    if (options.supportsVision === false) {
      msgs = msgs.map(stripImageParts)
    }

    // --- Inject attachments ---
    const attachments = getAttachments()
    if (attachments.length > 0) {
      let lastUserIdx = -1
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') { lastUserIdx = i; break }
      }
      if (lastUserIdx >= 0) {
        // Attachments are now handled via ComposerRuntime.addAttachment() 
        // in PendingAttachments component (attachment.tsx)
      }
      clearAttachments()
    }

    // --- @ mention context injection ---
    {
      let lastUserIdx = -1
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') { lastUserIdx = i; break }
      }
      if (lastUserIdx >= 0) {
        const userMsg = msgs[lastUserIdx]
        const textParts = (userMsg.parts ?? userMsg.content ?? [])
          .filter((p: any) => p.type === 'text')
        const fullText = textParts.map((p: any) => p.text ?? '').join('\n')
        const mentions = extractMentions(fullText)
        if (mentions.length > 0) {
          const context = await resolveMentionContext(mentions)
          if (context) {
            const parts = [...(userMsg.parts ?? userMsg.content ?? [])]
            parts.push({ type: 'text', text: '\n\n' + context })
            msgs = [...msgs]
            msgs[lastUserIdx] = { ...userMsg, parts, content: parts }
          }
        }
      }
    }

    // --- Context compaction (opencode-style: prune → summarize on overflow) ---
    try {
      msgs = await compactIfNeeded(msgs, chatModel, getLastUsage())
    } catch (e) {
      console.warn('Context compaction failed, sending full messages:', e)
    }

    args = { ...args, messages: msgs }

    return origSend(args)
  }

  return inner
}

// ─── Unconfigured fallback (header + settings access) ─────────────

const UnconfiguredView: FC = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-sm font-medium text-foreground">{t('app.aiChat')}</span>
        <ModelSettings />
      </div>
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4 text-center">
        <p>{t('app.unconfigured')}</p>
      </div>
    </div>
  )
}

// ─── History Provider (per-thread message persistence) ────────────

const MESSAGES_PREFIX = 'fogot-msgs-'

function HistoryProvider({ children }: { children?: ReactNode }) {
  const aui = useAui()
  const history = useMemo(
    () => ({
      async load() {
        const remoteId = aui.threadListItem().getState().remoteId
        if (!remoteId) return { messages: [] }
        setCurrentThreadId(remoteId)
        const raw = localStorage.getItem(MESSAGES_PREFIX + remoteId)
        if (!raw) return { messages: [] }
        try { return JSON.parse(raw) } catch { return { messages: [] } }
      },
      async append() {},
      withFormat(fmt: any) {
        return {
          async load() {
            const remoteId = aui.threadListItem().getState().remoteId
            if (!remoteId) return { headId: null, messages: [] }
            setCurrentThreadId(remoteId)
            const raw = localStorage.getItem(MESSAGES_PREFIX + remoteId)
            if (!raw) return { headId: null, messages: [] }
            try {
              const stored = JSON.parse(raw)
              if (!stored.rows) return { headId: null, messages: [] }
              return {
                headId: stored.headId ?? null,
                messages: stored.rows.map((row: any) =>
                  fmt.decode({ id: row.id, parent_id: row.parent_id, format: row.format, content: row.content })
                ),
              }
            } catch { return { headId: null, messages: [] } }
          },
          async append(item: any) {
            const { remoteId } = await aui.threadListItem().initialize()
            setCurrentThreadId(remoteId)
            const key = MESSAGES_PREFIX + remoteId
            const raw = localStorage.getItem(key)
            const stored = raw ? JSON.parse(raw) : { rows: [] }
            if (!stored.rows) stored.rows = []
            const id = fmt.getId(item.message)
            const encoded = fmt.encode(item)
            const row = { id, parent_id: item.parentId, format: fmt.format, content: encoded }
            const idx = stored.rows.findIndex((r: any) => r.id === id)
            if (idx >= 0) stored.rows[idx] = row
            else stored.rows.push(row)
            stored.headId = id
            try { localStorage.setItem(key, JSON.stringify(stored)) } catch {}
          },
          async update(item: any, localMessageId: string) {
            const remoteId = aui.threadListItem().getState().remoteId
            if (!remoteId) return
            const key = MESSAGES_PREFIX + remoteId
            const raw = localStorage.getItem(key)
            if (!raw) return
            const stored = JSON.parse(raw)
            if (!stored.rows) return
            const encoded = fmt.encode(item)
            const row = { id: localMessageId, parent_id: item.parentId, format: fmt.format, content: encoded }
            const idx = stored.rows.findIndex((r: any) => r.id === localMessageId)
            if (idx >= 0) { stored.rows[idx] = row; localStorage.setItem(key, JSON.stringify(stored)) }
          },
        }
      },
    }),
    [aui],
  )
  return (
    <RuntimeAdapterProvider adapters={{ history }}>
      {children}
    </RuntimeAdapterProvider>
  )
}

// ─── Chat Provider (runtime in scope) ─────────────────────────────

const ChatProvider: FC<{
  transport: DirectChatTransport
}> = ({ transport }) => {
  const wrappedAdapter = useMemo(() => ({
    ...threadListAdapter,
    unstable_Provider: HistoryProvider,
    generateTitle: async (remoteId: string, messages: any[]) => {
      const firstUser = messages.find((m: any) => m.role === 'user')
      let title = 'New Chat'
      if (firstUser) {
        const textPart = firstUser.content?.find?.((p: any) => p.type === 'text')
        if (textPart?.text) {
          title = textPart.text.slice(0, 40) + (textPart.text.length > 40 ? '...' : '')
        }
      }
      try {
        const raw = localStorage.getItem('fogot-threads')
        const threads = raw ? JSON.parse(raw) : []
        const t = threads.find((x: any) => x.id === remoteId)
        if (t) { t.title = title; localStorage.setItem('fogot-threads', JSON.stringify(threads)) }
      } catch {}
      return new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'part-start', part: { type: 'text' }, path: [] })
          controller.enqueue({ type: 'text-delta', textDelta: title, path: [0] })
          controller.enqueue({ type: 'part-finish', path: [0] })
          controller.close()
        },
      })
    },
  }), [])

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: () => useChatRuntime({ transport }),
    adapter: wrappedAdapter,
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ReadFileToolUI />
      <WriteFileToolUI />
      <EditFileToolUI />
      <ListFilesToolUI />
      <DeleteFileToolUI />
      <CopyFileToolUI />
      <MoveFileToolUI />
      <SearchFilesToolUI />
      <ExecuteCommandToolUI />
      <DelegateTaskToolUI />
      <ExitPlanModeToolUI />
      <DesignToolUI />
      <DesignVoiceToolUI />
      <CloneVoiceToolUI />
      <GenerateSpeechToolUI />
      <GenerateMusicToolUI />
      <SkillToolUI />
      <QuestionToolUI />
      <TooltipProvider>
        <MainView />
      </TooltipProvider>
    </AssistantRuntimeProvider>
  )
}

const MainView: FC = () => {
  const view = useAppView()

  if (view === 'assets') {
    return <AssetMode />
  }

  if (view === 'design') {
    return <DesignMode />
  }

  if (view === 'audio') {
    return <AudioMode />
  }

  if (view === 'settings') {
    return <SettingsView />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <Thread />
      </div>
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────

export default function App() {
  const { t } = useTranslation()
  useConfig()
  const agentId = useAgentId()
  const chatModelId = useSelectedChatModelId()
  const chatModel = getSelectedChatModel()
  const appView = useAppView()


  useEffect(() => {
    ensureCatalog()
    async function init() {
      const builtins = getBuiltinSkills()
      const project = await loadProjectSkills()
      setAvailableSkills([...builtins, ...project])
      clearInvokedSkills()
    }
    init()
  }, [])

  const isConfigured = !!(chatModel?.apiKey && chatModel?.apiEndpoint && chatModel?.model)

  // Design mode loads an optional project template (res://.design/_template.md).
  // When the template changes we re-load so the next agent build picks it up.
  const [designTemplate, setDesignTemplate] = useState<string | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    if (agentId === 'design') {
      loadDesignTemplate().then((t) => {
        if (!cancelled) setDesignTemplate(t)
      })
    } else {
      setDesignTemplate(undefined)
    }
    return () => { cancelled = true }
  }, [agentId])

  const transport = useMemo(() => {
    // Image mode talks directly to the image model — no chat model required.
    if (agentId === 'image') return createImageChatTransport()

    if (!isConfigured || !chatModel) return null

    let extraBody: Record<string, unknown> | undefined
    if (chatModel.extraBody) {
      try { extraBody = JSON.parse(chatModel.extraBody) } catch {}
    }

    const model = createChatModel({
      npm: chatModel.npm,
      providerId: chatModel.providerId,
      baseURL: chatModel.apiEndpoint,
      apiKey: chatModel.apiKey,
      modelId: chatModel.model,
      extraBody,
    })
    configureDelegateTool(model, getToolsForAgent)

    const agentConfig = (agentId && agentId !== DEFAULT_MODE_ID) ? getAgent(agentId) : undefined

    let tools: ReturnType<typeof getToolsForAgent>
    let instructions: string
    let maxSteps: number

    if (agentId === 'plan') {
      setActivePlan(null)
      tools = getToolsForAgent(['read_file', 'list_files', 'search_files', 'get_class_docs', 'delegate_task', 'ask_user', 'exit_plan_mode'])
      instructions = getPlanSystemPrompt()
      maxSteps = 25
    } else if (agentId === 'design') {
      tools = getToolsForAgent([
        'read_file', 'write_design', 'sync_design', 'list_files', 'search_files', 'generate_image',
        'design_voice', 'clone_voice', 'generate_speech', 'generate_music', 'list_voices',
      ])
      instructions = getDesignSystemPrompt(designTemplate)
      maxSteps = 30
    } else if (agentConfig?.allowedTools) {
      tools = getToolsForAgent(agentConfig.allowedTools)
      instructions = agentConfig.systemPrompt ?? getDefaultSystemPrompt(getAvailableSkills())
      maxSteps = agentConfig.maxSteps ?? 25
    } else {
      tools = allTools
      instructions = agentConfig?.systemPrompt ?? getDefaultSystemPrompt(getAvailableSkills())
      maxSteps = agentConfig?.maxSteps ?? 25
    }

    // --- Capability adaptation (mirrors opencode/models.dev) ---
    // Filter tools/params by what the selected model can actually handle so a
    // text-only model never receives images or tool definitions it can't use.
    const caps = resolveCapabilities(chatModel)
    if (!caps.toolCall) {
      tools = {}
    } else if (!caps.vision) {
      tools = Object.fromEntries(
        Object.entries(tools).filter(([name]) => !VISION_REQUIRED_TOOLS.includes(name as never)),
      ) as typeof tools
    }

    const limits = resolveModelLimits(chatModel)

    const agent = new ToolLoopAgent({
      model,
      tools,
      instructions,
      stopWhen: stepCountIs(maxSteps),
      maxTokens: limits.maxOutputTokens,
      ...(caps.temperature ? { temperature: chatModel.temperature ?? 0.7 } : {}),
    } as any)

    const inner = new DirectChatTransport({
      agent,
      sendReasoning: true,
      messageMetadata: (() => {
        // Context-window occupancy is the size of the prompt sent to the model,
        // i.e. the LAST step's inputTokens (which grows as the conversation does).
        // `finish.totalUsage` SUMS inputTokens across every tool-loop step, so it
        // over-counts wildly on multi-step turns and jumps around between turns.
        // We therefore track the max inputTokens seen across steps instead.
        let maxInputTokens = 0
        let totalOutputTokens = 0
        let reasoningTokens: number | undefined
        let cachedInputTokens: number | undefined

        const report = () => {
          if (maxInputTokens > 0 || totalOutputTokens > 0) {
            updateUsageSnapshot({
              inputTokens: maxInputTokens,
              outputTokens: totalOutputTokens,
              totalTokens: maxInputTokens + totalOutputTokens,
              cachedInputTokens,
              reasoningTokens,
            })
          }
        }

        return ({ part }: { part: any }) => {
          if (part.type === 'finish-step') {
            const u = part.usage
            if (u) {
              const input = u.inputTokens ?? 0
              if (input > maxInputTokens) maxInputTokens = input
              totalOutputTokens += u.outputTokens ?? 0
              const r = u.outputTokenDetails?.reasoningTokens ?? u.reasoningTokens
              if (r != null) reasoningTokens = (reasoningTokens ?? 0) + r
              const c = u.inputTokenDetails?.cacheReadTokens ?? u.cachedInputTokens
              if (c != null && c > (cachedInputTokens ?? 0)) cachedInputTokens = c
              report()
            }
            if (part.response?.modelId) {
              return { modelId: part.response.modelId }
            }
          }
          if (part.type === 'finish') {
            report()
            if (maxInputTokens > 0 || totalOutputTokens > 0) {
              return {
                usage: {
                  inputTokens: maxInputTokens,
                  outputTokens: totalOutputTokens,
                  totalTokens: maxInputTokens + totalOutputTokens,
                  reasoningTokens,
                  cachedInputTokens,
                },
              }
            }
          }
          return undefined
        }
      })(),
    } as any)
    return wrapTransport(inner, chatModel, {
      supportsVision: caps.vision,
    })
  }, [chatModelId, agentId, isConfigured, chatModel, designTemplate])

  if (!transport) {
    // Still allow reaching settings (and other views) before any model is
    // configured — otherwise the gear button appears to do nothing.
    if (appView === 'settings') return <SettingsView />
    return <UnconfiguredView />
  }

  return (
    <ChatProvider
      transport={transport}
    />
  )
}
