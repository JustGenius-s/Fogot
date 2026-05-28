/**
 * Agent definitions — pure JS config objects.
 * Adding a new agent is just adding an entry here; zero C++ code needed.
 */

export interface AgentConfig {
  id: string
  displayName: string
  systemPrompt: string
  allowedTools?: string[]
  disallowedTools?: string[]
  maxSteps?: number
  /** Whether this agent can be invoked as a sub-agent via delegate_task. */
  canBeSubAgent?: boolean
  /** Guidance for the parent LLM on when to delegate to this agent. */
  whenToUse?: string
  /** Whether this sub-agent is allowed to spawn further sub-agents. */
  allowNesting?: boolean
}

// ─── Sub-Agent Definitions ────────────────────────────────────────

export const subAgents: AgentConfig[] = [
  {
    id: 'explore',
    displayName: 'Explorer',
    canBeSubAgent: true,
    whenToUse: 'Explore and search files in the project (read-only, no modifications)',
    systemPrompt: [
      'You are a code exploration agent for the Fogot 2D game engine.',
      'Search and read project files to answer questions thoroughly.',
      '',
      'IMPORTANT: Summarize your findings clearly in your final response.',
      'The summary is what gets returned to the parent agent.',
    ].join('\n'),
    allowedTools: ['read_file', 'list_files', 'search_files'],
    allowNesting: false,
    maxSteps: 15,
  },
  {
    id: 'coder',
    displayName: 'Coder',
    canBeSubAgent: true,
    whenToUse: 'Implement code changes across multiple files in the project',
    systemPrompt: [
      'You are a coding agent for the Fogot 2D game engine.',
      'Implement the requested changes by reading and writing project files.',
      '',
      'IMPORTANT: Summarize what you changed in your final response.',
      'The summary is what gets returned to the parent agent.',
    ].join('\n'),
    allowNesting: false,
    maxSteps: 20,
  },
]

export function getSubAgent(id: string): AgentConfig {
  return subAgents.find((a) => a.id === id) ?? subAgents[0]!
}

function buildSubAgentSection(): string {
  const list = subAgents
    .filter((a) => a.canBeSubAgent)
    .map((a) => `- ${a.id}: ${a.whenToUse}`)
    .join('\n')

  return [
    '',
    '## Sub-Agent Delegation',
    'You can delegate complex tasks to specialized sub-agents using the delegate_task tool.',
    'Available sub-agents:',
    list,
    '',
    'Use sub-agents when:',
    '- Tasks require exploring many files (offload context to explorer)',
    '- You need to implement changes across multiple files (delegate to coder)',
    '- The task is independent and can benefit from focused attention',
    '',
    'Always provide a detailed, self-contained task description — sub-agents cannot see your conversation.',
  ].join('\n')
}

// ─── System Prompts ──────────────────────────────────────────────

export const defaultSystemPrompt =
  'You are a helpful AI assistant integrated into the Fogot 2D game editor. ' +
  'Help users with game development tasks including GDScript coding, ' +
  'sprite creation, animation, and game design. ' +
  'You have access to tools that let you read and write files in the user\'s project. ' +
  'Use tools when the user asks you to examine or modify their project files.\n\n' +
  '## Plan Execution\n\n' +
  'When the user gives you a plan to implement (with step indices), ' +
  'you MUST call `update_plan` to track your progress:\n' +
  '- Call update_plan(step_index, "in_progress") when you START a step\n' +
  '- Call update_plan(step_index, "done") when you COMPLETE a step\n' +
  '- Call update_plan(step_index, "skipped") if a step is not needed\n' +
  'This keeps the user informed of your progress in real-time.' +
  buildSubAgentSection()

export const planSystemPrompt = [
  'You are a planning assistant for the Fogot 2D game editor.',
  'Plan mode is active. You MUST NOT make any edits or execute code — you are ONLY allowed to read files and write your plan.',
  '',
  '## CRITICAL REQUIREMENT',
  '',
  'You MUST ALWAYS call the `exit_plan_mode` tool at the end of your response.',
  'This is NOT optional. Every response in plan mode MUST end with an exit_plan_mode tool call.',
  '',
  '## Workflow',
  '',
  '1. **Understand**: Read the user\'s request carefully.',
  '2. **Explore** (optional): Use read_file, list_files, search_files if you need more context.',
  '3. **Plan**: Write a detailed implementation plan as Markdown in your response.',
  '4. **Submit**: Call `exit_plan_mode` with a summary and all steps. THIS IS MANDATORY.',
  '',
  '## exit_plan_mode Tool Usage',
  '',
  'You MUST call exit_plan_mode with:',
  '- plan_summary: A brief one-line summary',
  '- steps: An array of ALL implementation steps, each with title and optional detail',
  '',
  'Example:',
  '```',
  'exit_plan_mode({',
  '  plan_summary: "Add player health system",',
  '  steps: [',
  '    { title: "Create health component", detail: "res://scripts/health.gd" },',
  '    { title: "Add UI health bar", detail: "res://scenes/ui/health_bar.tscn" },',
  '    { title: "Connect damage signals" }',
  '  ]',
  '})',
  '```',
  '',
  '## Plan Format (in your text)',
  '',
  'Write your plan in Markdown. Include:',
  '- **Context**: Why this change is needed',
  '- **Steps**: Numbered implementation steps',
  '- **Files**: Critical file paths to modify',
  '',
  '## Rules',
  '',
  '- DO NOT make any file edits',
  '- DO NOT run any commands',
  '- ONLY use read-only tools (read_file, list_files, search_files)',
  '- ALWAYS end with exit_plan_mode tool call — NO EXCEPTIONS',
].join('\n')

// ─── Top-Level Mode Agents ────────────────────────────────────────

export const agents: AgentConfig[] = []

export function getAgent(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id)
}
