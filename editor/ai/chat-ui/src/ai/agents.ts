/**
 * Agent definitions & modular prompt system.
 *
 * Prompts are authored as plain Markdown files under `src/ai/prompts/` and
 * imported via Vite's `?raw` suffix (zero escaping, easy to edit). Dynamic
 * bits use `{{PLACEHOLDER}}` tokens replaced at assembly time. This mirrors
 * how opencode organizes its prompts (external text files + runtime assembly).
 */

import { getAvailableSkills } from '@/bridge'
import { formatSkillListing } from './skills'
import { describeSchemaForPrompt } from '@/lib/design-schema'

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

// ─── Prompt Assembly ──────────────────────────────────────────────

/** Build the sub-agent listing block injected into the default prompt. */
function buildDefaultSystemPrompt(): string {
  const list = getSubAgents()
    .filter((a) => a.canBeSubAgent)
    .map((a) => `- ${a.id}: ${a.whenToUse}`)
    .join('\n')
  return defaultPromptRaw.replace('{{SUBAGENT_LIST}}', list)
}

// ─── Sub-Agent Definitions ────────────────────────────────────────

function getSubAgents(): AgentConfig[] {
  return [
    {
      id: 'explore',
      displayName: 'Explorer',
      canBeSubAgent: true,
      whenToUse: EXPLORE_WHEN_TO_USE,
      systemPrompt: subagentExploreRaw,
      allowedTools: ['read_file', 'list_files', 'search_files', 'get_class_docs'],
      allowNesting: false,
      maxSteps: 15,
    },
    {
      id: 'coder',
      displayName: 'Coder',
      canBeSubAgent: true,
      whenToUse: CODER_WHEN_TO_USE,
      systemPrompt: subagentCoderRaw,
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

/** Main agent system prompt — call this to get the current language version */
export function getDefaultSystemPrompt(skills?: { id: string; description: string }[]): string {
  let prompt = buildDefaultSystemPrompt()
  if (skills?.length) {
    prompt += '\n\n' + formatSkillListing(skills)
  }
  return prompt
}

/** Legacy export for backwards compatibility */
export const defaultSystemPrompt = buildDefaultSystemPrompt()

export function getPlanSystemPrompt(): string {
  return planPromptRaw
}

/** Legacy export for backwards compatibility */
export const planSystemPrompt = getPlanSystemPrompt()

// ─── Design Mode ──────────────────────────────────────────────────

/**
 * Design mode system prompt. Body lives in `prompts/design.md` (plain Markdown, no escaping).
 * Two placeholders: {{BIBLE_SUMMARY}} (bible summary, empty if none) and {{SCHEMA}} (kind schema).
 */
export function getDesignSystemPrompt(bibleSummary?: string): string {
  return designPromptRaw
    .replace('{{BIBLE_SUMMARY}}', bibleSummary ?? '(No design Bible in this project yet)')
    .replace('{{SCHEMA}}', describeSchemaForPrompt())
}

// ─── Top-Level Mode Agents ────────────────────────────────────────

export const agents: AgentConfig[] = []

export function getAgent(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id)
}