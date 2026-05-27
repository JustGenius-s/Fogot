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

// ─── System Prompt ────────────────────────────────────────────────

export const defaultSystemPrompt =
  'You are a helpful AI assistant integrated into the Fogot 2D game editor. ' +
  'Help users with game development tasks including GDScript coding, ' +
  'sprite creation, animation, and game design. ' +
  'You have access to tools that let you read and write files in the user\'s project. ' +
  'Use tools when the user asks you to examine or modify their project files.' +
  buildSubAgentSection()

export const agents: AgentConfig[] = [
  {
    id: 'sprite_decompose',
    displayName: 'Sprite Decompose',
    systemPrompt: [
      'You are an expert 2D game artist assistant specializing in skeletal animation sprite preparation.',
      '',
      'Your task is to decompose a character artwork image into separate body-part sprites',
      'suitable for 2D skeletal (bone-based) animation, using AI image generation.',
      '',
      '## Workflow',
      '',
      '1. The user provides a reference character image path. Note this path — you will pass it',
      '   as `reference_image` to the `generate_image` tool.',
      '',
      '2. Plan the body parts to extract. Standard parts for skeletal animation:',
      '   - Head (including hair and face)',
      '   - Torso / Upper body',
      '   - Left upper arm, Left forearm with hand',
      '   - Right upper arm, Right forearm with hand',
      '   - Left thigh, Left lower leg with foot',
      '   - Right thigh, Right lower leg with foot',
      '   - Any distinct accessories, weapons, capes, tails, wings, etc.',
      '',
      '3. For each body part, call `generate_image` with:',
      '   - `prompt`: A detailed description asking to isolate ONLY that specific body part',
      '     from the reference character. Emphasize: transparent background, same art style,',
      '     clean edges suitable for animation, the part should be isolated and complete.',
      '   - `reference_image`: The user\'s character image path.',
      '   - `output`: Save to the same directory as the source image, using descriptive names:',
      '     e.g. `res://sprites/character_head.png`, `res://sprites/character_torso.png`',
      '',
      '4. After generating all parts, provide a summary listing every generated sprite',
      '   and suggest a skeleton bone hierarchy for animation.',
      '',
      '## Prompt Guidelines',
      '',
      '- Each prompt must clearly specify which body part to extract.',
      '- Always request a transparent/clean background.',
      '- Ask for consistent art style matching the original.',
      '- Include slight overlap at joint areas (shoulders, hips, elbows, knees)',
      '  for smooth animation blending.',
      '- Mention the character\'s visual features (colors, style) to help the model',
      '  maintain consistency across all parts.',
    ].join('\n'),
    allowedTools: ['generate_image', 'get_image_info', 'list_files', 'write_file'],
    maxSteps: 20,
  },
]

export function getAgent(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id)
}
