/**
 * Sub-agent delegation tool.
 *
 * Wraps a child ToolLoopAgent as a standard tool so the parent agent
 * can autonomously decide to delegate work. Also creates a persisted
 * child thread in localStorage so the user can open a full-page
 * transcript in the thread list.
 */

import { tool, ToolLoopAgent, stepCountIs, readUIMessageStream } from 'ai'
import type { LanguageModel, ToolSet } from 'ai'
import { z } from 'zod'
import { getSubAgent } from '../agents'
import { createSubAgentThread } from '@/lib/thread-storage'

// ─── Injected dependencies ────────────────────────────────────────

let _model: LanguageModel | null = null
let _getTools: (allowed?: string[]) => ToolSet = () => ({})
let _getParentThreadId: () => string = () => ''

export function configureDelegateTool(
  model: LanguageModel,
  getTools: (allowed?: string[]) => ToolSet,
) {
  _model = model
  _getTools = getTools
}

export function configureParentThreadIdProvider(fn: () => string) {
  _getParentThreadId = fn
}

/**
 * After delegate_task completes, maps `task` string → child thread ID
 * so DelegateTaskToolUI can find the child thread.
 */
export const childThreadMap = new Map<string, string>()

export const delegateTask = tool({
  description: [
    'Delegate a task to a specialized sub-agent with its own context and tools.',
    'Agents:',
    '  - "explore": read-only search/analysis across the project',
    '  - "coder": implement code changes across files',
    'Guidelines:',
    '- Task must be self-contained — sub-agents cannot see this conversation.',
    '- Include paths, known context, and the exact outcome you need.',
    '- Prefer explore for broad discovery; coder for multi-file edits.',
  ].join('\n'),
  inputSchema: z.object({
    task: z.string().describe(
      'Detailed, self-contained task description. The sub-agent cannot see your conversation. Include file paths, context, and what specifically needs to happen.',
    ),
    agent_type: z.string().optional().describe(
      'Sub-agent type: "explore" (read-only search/analysis) or "coder" (implement changes). Defaults to "explore".',
    ),
  }),

  execute: async function* ({ task, agent_type }, { abortSignal }) {
    if (!_model) {
      return 'Error: delegate_task not configured — no model available.'
    }

    const agentDef = getSubAgent(agent_type ?? 'explore')
    const tools = _getTools(agentDef.allowedTools) as Record<string, unknown>

    if (!agentDef.allowNesting) {
      delete tools['delegate_task']
    }

    const agentKey = agent_type ?? 'explore'
    const parentID = _getParentThreadId()

    // Create child thread entry early (empty parts, updated after execution)
    const childId = createSubAgentThread(parentID, agentKey, task, [])
    childThreadMap.set(task, childId)

    const subAgent = new ToolLoopAgent({
      model: _model,
      tools: tools as ToolSet,
      instructions: agentDef.systemPrompt,
      stopWhen: stepCountIs(agentDef.maxSteps ?? 15),
    })

    const result = await subAgent.stream({ prompt: task, abortSignal })

    for await (const message of readUIMessageStream({
      stream: result.toUIMessageStream(),
    })) {
      yield message
    }
  },

  toModelOutput: ({ output: message }) => {
    let text = 'Sub-agent task completed.'
    const parts = message?.parts
    if (parts) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        if (p?.type === 'text' && 'text' in p) {
          text = (p as { type: 'text'; text: string }).text
          break
        }
      }
    }
    return { type: 'text' as const, value: text }
  },
})
