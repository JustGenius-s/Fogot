/**
 * Sub-agent delegation tool.
 *
 * Wraps a child ToolLoopAgent as a standard tool so the parent agent
 * can autonomously decide to delegate work.
 */

import { tool, ToolLoopAgent, stepCountIs, readUIMessageStream } from 'ai'
import type { LanguageModel, ToolSet } from 'ai'
import { z } from 'zod'
import { getSubAgent } from '../agents'

// ─── Injected dependencies ────────────────────────────────────────

let _model: LanguageModel | null = null
let _getTools: (allowed?: string[]) => ToolSet = () => ({})

export function configureDelegateTool(
  model: LanguageModel,
  getTools: (allowed?: string[]) => ToolSet,
) {
  _model = model
  _getTools = getTools
}

export const delegateTask = tool({
  description: [
    'Delegate a task to a specialized sub-agent that runs independently.',
    'The sub-agent has its own context window and tools.',
    'Available agent types:',
    '  - "explore": Explore and search files in the project (read-only, fast, thorough)',
    '  - "coder": Implement code changes across multiple files in the project',
    '',
    'Guidelines:',
    '- Always provide a detailed, self-contained task description — sub-agents cannot see your conversation.',
    '- Brief the sub-agent like a smart colleague: explain what, why, and what you already know.',
    '- Include relevant file paths and context.',
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
