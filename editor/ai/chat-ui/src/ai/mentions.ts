/**
 * @ mention extraction, classification, and context injection.
 *
 * Directives in user messages follow the `:type[label]{name=id}` format.
 * This module extracts node/scene/script mentions and builds lightweight
 * context strings to prepend to the user message before sending to the LLM.
 */

import { unstable_defaultDirectiveFormatter } from '@assistant-ui/react'
import { bridgeRPC } from '@/bridge'

export type MentionKind = 'node' | 'scene' | 'script' | 'folder' | 'design'

export interface Mention {
  kind: MentionKind
  label: string
  id: string
}

const MENTION_TYPES = new Set<string>(['node', 'scene', 'script', 'folder', 'design'])

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
 * Resolve a design mention into its full document content so the model has the
 * referenced design at hand without an extra tool round-trip.
 */
async function resolveDesignContext(path: string): Promise<string> {
  try {
    const content = await bridgeRPC('read_file', { path })
    return `[Referenced design ${path}]\n${content}`
  } catch {
    return `[Context: The user referenced design ${path}. Use read_file to view its contents if needed.]`
  }
}

/**
 * Build context lines for a folder mention.
 * Does not list the folder — just provides the path hint.
 */
function buildFolderContext(folderPath: string): string {
  return `[Context: The user referenced folder ${folderPath}. Use list_files to view its contents if needed.]`
}

/**
 * Resolve all mentions in a message and return the combined context string.
 * Nodes are resolved via RPC; files and folders get path-only hints.
 */
export async function resolveMentionContext(mentions: Mention[]): Promise<string> {
  if (mentions.length === 0) return ''

  const lines: string[] = []
  const asyncContexts: Promise<string>[] = []

  for (const m of mentions) {
    if (m.kind === 'node') {
      asyncContexts.push(resolveNodeContext(m.id))
    } else if (m.kind === 'design') {
      asyncContexts.push(resolveDesignContext(m.id))
    } else if (m.kind === 'folder') {
      lines.push(buildFolderContext(m.id))
    } else {
      lines.push(buildFileContext(m.id))
    }
  }

  const resolved = await Promise.all(asyncContexts)
  return [...resolved, ...lines].join('\n')
}
