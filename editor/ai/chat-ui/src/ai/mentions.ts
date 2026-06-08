/**
 * @ mention extraction, classification, and context injection.
 *
 * Directives in user messages follow the `:type[label]{name=id}` format.
 * This module extracts node/scene/script mentions and builds lightweight
 * context strings to prepend to the user message before sending to the LLM.
 */

import { unstable_defaultDirectiveFormatter } from '@assistant-ui/react'
import { bridgeRPC } from '@/bridge'

export type MentionKind = 'node' | 'scene' | 'script'

export interface Mention {
  kind: MentionKind
  label: string
  id: string
}

const MENTION_TYPES = new Set<string>(['node', 'scene', 'script'])

/**
 * Extract all @ mention directives from a message text string.
 */
export function extractMentions(text: string): Mention[] {
  const segments = unstable_defaultDirectiveFormatter.parse(text)
  const mentions: Mention[] = []
  for (const seg of segments) {
    if (seg.kind === 'mention' && MENTION_TYPES.has(seg.type)) {
      mentions.push({
        kind: seg.type as MentionKind,
        label: seg.label,
        id: seg.id,
      })
    }
  }
  return mentions
}

/**
 * Resolve a single node mention into a lightweight context summary.
 * Calls the C++ `scene_get_node` RPC to get node details.
 */
async function resolveNodeContext(nodePath: string): Promise<string> {
  try {
    const json = await bridgeRPC('scene_get_node', { path: nodePath })
    const data = JSON.parse(json)
    const parts = [`Node "${data.name}" (${data.type}) at ${data.path}`]
    if (data.script) parts.push(`script: ${data.script}`)
    const props = data.properties
    if (props) {
      if (props.position) parts.push(`position: ${JSON.stringify(props.position)}`)
      if (props.size) parts.push(`size: ${JSON.stringify(props.size)}`)
      if (props.scale) parts.push(`scale: ${JSON.stringify(props.scale)}`)
    }
    return `[Context: ${parts.join(', ')}]`
  } catch {
    return `[Context: Node "${nodePath}" (failed to resolve details)]`
  }
}

/**
 * Build context lines for a file mention (scene or script).
 * Does not read the file — just provides the path hint.
 */
function buildFileContext(filePath: string): string {
  return `[Context: The user referenced file ${filePath}. Use read_file to view its contents if needed.]`
}

/**
 * Resolve all mentions in a message and return the combined context string.
 * Nodes are resolved via RPC; files get path-only hints.
 */
export async function resolveMentionContext(mentions: Mention[]): Promise<string> {
  if (mentions.length === 0) return ''

  const lines: string[] = []
  const nodePromises: Promise<string>[] = []

  for (const m of mentions) {
    if (m.kind === 'node') {
      nodePromises.push(resolveNodeContext(m.id))
    } else {
      lines.push(buildFileContext(m.id))
    }
  }

  const nodeContexts = await Promise.all(nodePromises)
  return [...nodeContexts, ...lines].join('\n')
}
