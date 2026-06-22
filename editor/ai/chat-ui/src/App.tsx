import { useEffect, useMemo, type FC, type ReactNode } from 'react'
import {
  AssistantRuntimeProvider,
  RuntimeAdapterProvider,
  useAui,
  useRemoteThreadListRuntime,
} from '@assistant-ui/react'
import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { DirectChatTransport, ToolLoopAgent, stepCountIs } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Thread } from '@/components/assistant-ui/thread'
import { ModelSettings } from '@/components/assistant-ui/model-settings'
import { useConfig, useAgentId, useSelectedChatModelId, getSelectedChatModel, getImageModels, getAttachments, clearAttachments, setActivePlan, useAppView, getAvailableSkills } from '@/bridge'
import { AssetMode } from '@/components/assets/asset-mode'
import { DesignMode } from '@/components/assets/design-mode'
import { AudioMode } from '@/components/assets/audio-mode'
import { allTools, getToolsForAgent } from '@/ai/tools'
import { getDefaultSystemPrompt, getPlanSystemPrompt, getDesignSystemPrompt, getAudioSystemPrompt, getAgent } from '@/ai/agents'
import { createImageChatTransport } from '@/ai/image-transport'
import { configureDelegateTool } from '@/ai/tools'
import {
  updateUsageSnapshot,
  getLastUsage,
  setCurrentThreadId,
} from '@/ai/context-manager'
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

// ─── Transport Wrapper (attachments + context compression) ────────

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

/**
 * Rough token estimation: ~4 chars per token for English/code,
 * ~2 chars per token for CJK text. Uses a weighted average.
 */
function estimateTokens(text: string): number {
  let cjkChars = 0
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x2E80) cjkChars++
  }
  const latinChars = text.length - cjkChars
  return Math.ceil(latinChars / 4 + cjkChars / 1.5)
}

function estimateMessagesTokens(messages: any[]): number {
  let total = 0
  for (const msg of messages) {
    const parts = msg.parts ?? msg.content ?? []
    for (const p of parts) {
      if (p.type === 'text' && p.text) {
        total += estimateTokens(p.text)
      }
    }
    total += 4 // message overhead
  }
  return total
}

async function summarizeMessages(
  messages: any[],
  modelConfig: { apiEndpoint: string; apiKey: string; model: string },
): Promise<string> {
  const conversationText = messages
    .map((m: any) => {
      const role = m.role ?? 'unknown'
      const textParts = (m.parts ?? m.content ?? [])
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text ?? '')
        .join('\n')
      return `[${role}]: ${textParts.slice(0, 2000)}`
    })
    .join('\n\n')

  const endpoint = modelConfig.apiEndpoint.replace(/\/$/, '')
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${modelConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: `You are a conversation summarizer. Create a concise but comprehensive summary that preserves:
- Key decisions and conclusions
- Important context (file paths, variable names, technical details)
- Ongoing tasks and their current status
- Any unresolved questions

Write in the same language as the conversation. Use bullet points. Keep under 800 words.`,
        },
        {
          role: 'user',
          content: `Summarize this conversation:\n\n${conversationText}`,
        },
      ],
      max_tokens: 2048,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    throw new Error(`Summarization failed: ${response.status}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

function wrapTransport(
  inner: DirectChatTransport,
  modelConfig: { apiEndpoint: string; apiKey: string; model: string; contextWindow?: number },
): DirectChatTransport {
  const origSend = inner.sendMessages.bind(inner)
  const contextWindow = modelConfig.contextWindow ?? 1_000_000
  const COMPRESS_THRESHOLD = 0.75
  const KEEP_RECENT_PAIRS = 4

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inner.sendMessages = async (args: any) => {
    let msgs = [...args.messages]
    const msgsForEstimation = msgs

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

    // --- Context compression ---
    const estimatedTokens = estimateMessagesTokens(msgs)
    if (estimatedTokens > contextWindow * COMPRESS_THRESHOLD && msgs.length > KEEP_RECENT_PAIRS * 2 + 1) {
      try {
        // Split: find system message, determine what to summarize vs keep
        let systemMsg: any | null = null
        let conversation = msgs
        if (conversation[0]?.role === 'system') {
          systemMsg = conversation[0]
          conversation = conversation.slice(1)
        }

        const keepCount = KEEP_RECENT_PAIRS * 2
        const toSummarize = conversation.slice(0, conversation.length - keepCount)
        const toKeep = conversation.slice(conversation.length - keepCount)

        if (toSummarize.length > 2) {
          const summary = await summarizeMessages(toSummarize, modelConfig)
          if (summary) {
            msgs = []
            if (systemMsg) msgs.push(systemMsg)
            msgs.push({
              role: 'user',
              parts: [{ type: 'text', text: `[Earlier conversation summary]\n\n${summary}` }],
            })
            msgs.push({
              role: 'assistant',
              parts: [{ type: 'text', text: 'Understood. I have the context from our earlier conversation. Let me continue helping you.' }],
            })
            msgs.push(...toKeep)

            updateUsageSnapshot({
              inputTokens: estimateMessagesTokens(msgs),
              outputTokens: 0,
              totalTokens: estimateMessagesTokens(msgs),
            })
          }
        }
      } catch (e) {
        console.warn('Context compression failed, sending full messages:', e)
      }
    }

    args = { ...args, messages: msgs }

    const stream = await origSend(args)

    // Fallback: if API didn't report usage, estimate from messages after stream ends
    const usageBefore = getLastUsage()
    const inputEstimate = estimateMessagesTokens(msgsForEstimation)

    const [passThrough, monitor] = stream.tee()
    const reader = monitor.getReader()
    ;(async () => {
      try {
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      } catch { /* stream error, ignore */ }
      // Wait for messageMetadata callbacks to fire
      await new Promise(r => setTimeout(r, 300))
      const usageAfter = getLastUsage()
      if (!usageAfter || usageAfter === usageBefore) {
        updateUsageSnapshot({ inputTokens: inputEstimate, outputTokens: 0, totalTokens: inputEstimate })
      }
    })()

    return passThrough
  }

  return inner
}

// ─── Status Bar ───────────────────────────────────────────────────

const StatusBar: FC<{ status: string }> = ({ status }) => {
  if (!status) return null
  return (
    <div className="text-[11px] text-muted-foreground px-4 py-1 border-t border-border shrink-0 truncate">
      {status}
    </div>
  )
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
  status: string
}> = ({ transport, status }) => {
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
      <TooltipProvider>
        <MainView status={status} />
      </TooltipProvider>
    </AssistantRuntimeProvider>
  )
}

const MainView: FC<{ status: string }> = ({ status }) => {
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <Thread />
      </div>
      <StatusBar status={status} />
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


  useEffect(() => {
    async function init() {
      const builtins = getBuiltinSkills()
      const project = await loadProjectSkills()
      setAvailableSkills([...builtins, ...project])
      clearInvokedSkills()
    }
    init()
  }, [])

  const isConfigured = !!(chatModel?.apiKey && chatModel?.apiEndpoint && chatModel?.model)

  const transport = useMemo(() => {
    // Image mode talks directly to the image model — no chat model required.
    if (agentId === 'image') return createImageChatTransport()

    if (!isConfigured || !chatModel) return null

    const provider = createOpenAICompatible({
      name: 'fogot-llm',
      apiKey: chatModel.apiKey,
      baseURL: chatModel.apiEndpoint,
      transformRequestBody: (args) => {
        let extra: Record<string, unknown> = {}
        if (chatModel.extraBody) {
          try { extra = JSON.parse(chatModel.extraBody) } catch {}
        }
        return { ...extra, ...args }
      },
    })

    const model = provider.chatModel(chatModel.model)
    configureDelegateTool(model, getToolsForAgent)

    const agentConfig = (agentId && agentId !== DEFAULT_MODE_ID) ? getAgent(agentId) : undefined

    let tools: ReturnType<typeof getToolsForAgent>
    let instructions: string
    let maxSteps: number

    if (agentId === 'plan') {
      setActivePlan(null)
      tools = getToolsForAgent(['read_file', 'list_files', 'search_files', 'exit_plan_mode'])
      instructions = getPlanSystemPrompt()
      maxSteps = 15
    } else if (agentId === 'design') {
      tools = getToolsForAgent([
        'read_file', 'write_design', 'list_files', 'search_files', 'generate_image',
      ])
      instructions = getDesignSystemPrompt()
      maxSteps = 25
    } else if (agentId === 'audio') {
      tools = getToolsForAgent([
        'read_file', 'write_design', 'list_files', 'search_files',
        'design_voice', 'clone_voice', 'generate_speech', 'generate_music', 'list_voices',
      ])
      instructions = getAudioSystemPrompt()
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

    const agent = new ToolLoopAgent({
      model,
      tools,
      instructions,
      stopWhen: stepCountIs(maxSteps),
      maxTokens: chatModel.maxTokens ?? 4096,
      temperature: chatModel.temperature ?? 0.7,
    } as any)

    const inner = new DirectChatTransport({
      agent,
      sendReasoning: true,
      messageMetadata: (() => {
        let usageReported = false
        return ({ part }: { part: any }) => {
          if (part.type === 'finish-step') {
            const u = part.usage
            if (u && (u.inputTokens || u.outputTokens || u.totalTokens)) {
              const input = u.inputTokens ?? 0
              const output = u.outputTokens ?? 0
              const total = u.totalTokens ?? (input + output)
              updateUsageSnapshot({ inputTokens: input, outputTokens: output, totalTokens: total })
              usageReported = true
            }
            if (part.response?.modelId) {
              return { modelId: part.response.modelId }
            }
          }
          if (part.type === 'finish') {
            const u = part.totalUsage
            if (u && (u.inputTokens || u.outputTokens || u.totalTokens)) {
              const input = u.inputTokens ?? 0
              const output = u.outputTokens ?? 0
              const total = u.totalTokens ?? (input + output)
              updateUsageSnapshot({ inputTokens: input, outputTokens: output, totalTokens: total })
              usageReported = true
              return { usage: { inputTokens: input, outputTokens: output, totalTokens: total, reasoningTokens: u.outputTokenDetails?.reasoningTokens ?? u.reasoningTokens, cachedInputTokens: u.inputTokenDetails?.cacheReadTokens ?? u.cachedInputTokens } }
            }
          }
          return undefined
        }
      })(),
    } as any)
    return wrapTransport(inner, {
      apiEndpoint: chatModel.apiEndpoint,
      apiKey: chatModel.apiKey,
      model: chatModel.model,
      contextWindow: chatModel.contextWindow,
    })
  }, [chatModelId, agentId, isConfigured, chatModel])

  if (!transport) {
    return <UnconfiguredView />
  }

  const status =
    agentId === 'image'
      ? getImageModels().length > 0
        ? t('app.ready')
        : t('app.noImageModel')
      : !chatModel?.apiKey
        ? t('app.noApiKey')
        : t('app.ready')

  return (
    <ChatProvider
      transport={transport}
      status={status}
    />
  )
}
