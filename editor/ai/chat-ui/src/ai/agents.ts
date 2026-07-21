/**
 * Agent definitions & modular prompt system.
 *
 * Modes expose a short identity line; behavior is constrained by the tool
 * allowlist and each tool's description/schema. Dynamic inventory (skills,
 * optional design Bible summary) may still be appended at assembly time.
 */

import { formatSkillListing } from './skills'

import defaultPromptRaw from './prompts/default.md?raw'
import subagentExploreRaw from './prompts/subagent-explore.md?raw'
import subagentCoderRaw from './prompts/subagent-coder.md?raw'
import designPromptRaw from './prompts/design.md?raw'
import planPromptRaw from './prompts/plan.md?raw'

// ─── Agent Config Interface ───────────────────────────────────────

export interface AgentConfig {
  id: string
  displayName: string
  systemPrompt: string
  allowedTools?: string[]
  disallowedTools?: string[]
  maxSteps?: number
  canBeSubAgent?: boolean
  whenToUse?: string
  allowNesting?: boolean
}

// ─── Sub-Agent whenToUse (short metadata, not markdown content) ──

const EXPLORE_WHEN_TO_USE = 'Explore and search project files (read-only, fast, thorough)'
const CODER_WHEN_TO_USE = 'Implement code changes across multiple files in the project'

// ─── Sub-Agent Definitions ────────────────────────────────────────

function getSubAgents(): AgentConfig[] {
  return [
    {
      id: 'explore',
      displayName: 'Explorer',
      canBeSubAgent: true,
      whenToUse: EXPLORE_WHEN_TO_USE,
      systemPrompt: subagentExploreRaw.trim(),
      allowedTools: ['read_file', 'list_files', 'search_files', 'get_class_docs'],
      allowNesting: false,
      maxSteps: 15,
    },
    {
      id: 'coder',
      displayName: 'Coder',
      canBeSubAgent: true,
      whenToUse: CODER_WHEN_TO_USE,
      systemPrompt: subagentCoderRaw.trim(),
      allowNesting: false,
      maxSteps: 20,
    },
  ]
}

/** Exported for tools/delegate.ts */
export const subAgents: AgentConfig[] = getSubAgents()

export function getSubAgent(id: string): AgentConfig {
  const agents = getSubAgents()
  return agents.find((a) => a.id === id) ?? agents[0]!
}

// ─── System Prompts (public API) ──────────────────────────────────

/** Main agent system prompt — mode line + optional skill inventory */
export function getDefaultSystemPrompt(skills?: { id: string; description: string }[]): string {
  let prompt = defaultPromptRaw.trim()
  if (skills?.length) {
    prompt += '\n\n' + formatSkillListing(skills)
  }
  return prompt
}

/** Legacy export for backwards compatibility */
export const defaultSystemPrompt = getDefaultSystemPrompt()

export function getPlanSystemPrompt(): string {
  return planPromptRaw.trim()
}

/** Legacy export for backwards compatibility */
export const planSystemPrompt = getPlanSystemPrompt()

/**
 * Design mode system prompt. Optional Bible summary is project data, not rules.
 */
export function getDesignSystemPrompt(bibleSummary?: string): string {
  let prompt = designPromptRaw.trim()
  if (bibleSummary?.trim()) {
    prompt += `\n\nDesign Bible (follow when authoring):\n${bibleSummary.trim()}`
  }
  return prompt
}

// ─── Top-Level Mode Agents ────────────────────────────────────────

export const agents: AgentConfig[] = []

export function getAgent(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id)
}
