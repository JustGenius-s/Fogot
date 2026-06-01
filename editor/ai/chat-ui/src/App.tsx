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
import { useConfig, useAgentId, useSelectedChatModelId, getSelectedChatModel, getAttachments, clearAttachments, setActivePlan, usePromptLanguage } from '@/bridge'
import { allTools, getToolsForAgent } from '@/ai/tools'
import { getDefaultSystemPrompt, getPlanSystemPrompt, getAgent } from '@/ai/agents'
import { configureDelegateTool } from '@/ai/delegate-tool'
import { DEFAULT_MODE_ID } from '@/components/assistant-ui/mode-selector'
import { threadListAdapter } from '@/lib/thread-storage'
import { WriteFileToolUI } from '@/components/custom/write-file-tool-ui'
import { DelegateTaskToolUI } from '@/components/custom/delegate-task-tool-ui'
import { ExitPlanModeToolUI } from '@/components/custom/create-plan-tool-ui'

// ─── Attachment-aware Transport Wrapper ───────────────────────────

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

function wrapTransportWithAttachments(inner: DirectChatTransport): DirectChatTransport {
  const origSend = inner.sendMessages.bind(inner)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inner.sendMessages = (args: any) => {
    const attachments = getAttachments()
    if (attachments.length > 0) {
      const msgs = [...args.messages]
      let lastUserIdx = -1
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') { lastUserIdx = i; break }
      }
      if (lastUserIdx >= 0) {
        const userMsg = { ...msgs[lastUserIdx], parts: [...msgs[lastUserIdx].parts] }
        for (const att of attachments) {
          const ext = att.path.split('.').pop()?.toLowerCase() ?? ''
          userMsg.parts.push({
            type: 'file',
            mediaType: MEDIA_TYPES[ext] || 'application/octet-stream',
            url: att.dataUrl,
            filename: att.path.split('/').pop() || att.path,
          })
        }
        msgs[lastUserIdx] = userMsg
        args = { ...args, messages: msgs }
      }
      clearAttachments()
    }
    return origSend(args)
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

const UnconfiguredView: FC = () => (
  <div className="flex flex-col h-full bg-background">
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
      <span className="text-sm font-medium text-foreground">AI Chat</span>
      <ModelSettings />
    </div>
    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4 text-center">
      <p>Click ⚙ to add a chat model.</p>
    </div>
  </div>
)

// ─── History Provider (per-thread message persistence) ────────────

const MESSAGES_PREFIX = 'fogot-msgs-'

function HistoryProvider({ children }: { children?: ReactNode }) {
  const aui = useAui()
  const history = useMemo(
    () => ({
      async load() {
        const remoteId = aui.threadListItem().getState().remoteId
        if (!remoteId) return { messages: [] }
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
      <WriteFileToolUI />
      <DelegateTaskToolUI />
      <ExitPlanModeToolUI />
      <TooltipProvider>
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0">
            <Thread />
          </div>
          <StatusBar status={status} />
        </div>
      </TooltipProvider>
    </AssistantRuntimeProvider>
  )
}

// ─── App Root ─────────────────────────────────────────────────────

export default function App() {
  useConfig()
  const agentId = useAgentId()
  const chatModelId = useSelectedChatModelId()
  const chatModel = getSelectedChatModel()

  const promptLang = usePromptLanguage()

  const isConfigured = !!(chatModel?.apiKey && chatModel?.apiEndpoint && chatModel?.model)

  const transport = useMemo(() => {
    if (!isConfigured || !chatModel) return null

    const provider = createOpenAICompatible({
      name: 'fogot-llm',
      apiKey: chatModel.apiKey,
      baseURL: chatModel.apiEndpoint,
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
    } else if (agentConfig?.allowedTools) {
      tools = getToolsForAgent(agentConfig.allowedTools)
      instructions = agentConfig.systemPrompt ?? getDefaultSystemPrompt()
      maxSteps = agentConfig.maxSteps ?? 25
    } else {
      tools = allTools
      instructions = agentConfig?.systemPrompt ?? getDefaultSystemPrompt()
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

    const inner = new DirectChatTransport({ agent, sendReasoning: true })
    return wrapTransportWithAttachments(inner)
  }, [chatModelId, agentId, isConfigured, chatModel, promptLang])

  if (!transport) {
    return <UnconfiguredView />
  }

  const status = !chatModel?.apiKey ? 'No API key configured' : 'Ready'

  return (
    <ChatProvider
      transport={transport}
      status={status}
    />
  )
}
