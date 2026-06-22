/**
 * Design-mode tool — write a design document into res://.design/.
 *
 * Design docs are Markdown files with a YAML frontmatter header. The model
 * authors the full file content; this tool normalizes the slug into a
 * res://.design/<slug>.md path and persists it via the C++ write_file RPC.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { bridgeRPC } from '@/bridge'
import { DESIGN_DIR } from '@/lib/designs'

/** Old content before a design write, keyed by path (for inline diff/card). */
export const designOldContentCache = new Map<string, string>()

/** Normalize a user/LLM-supplied slug into a `res://.design/<slug>.md` path. */
export function designPathForSlug(slug: string): string {
  const base = slug
    .trim()
    .replace(/^res:\/\//, '')
    .replace(/^\.design\//, '')
    .replace(/\.md$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'untitled'
  return `${DESIGN_DIR}${base}.md`
}

export const writeDesign = tool({
  description: [
    'Create or overwrite a design document under res://.design/.',
    'A design doc is a Markdown file whose header is a YAML frontmatter block',
    '(name and type are required) followed by Markdown prose.',
    'Rules:',
    '- Use this tool (not write_file) for design documents.',
    '- To revise an existing design, read_file it first, then call write_design with the full updated content.',
    '- The slug must be a lowercase english kebab-case name without extension (e.g. "hero-knight").',
  ].join('\n'),
  inputSchema: z.object({
    slug: z.string().describe('Lowercase kebab-case file name without extension, e.g. "hero-knight"'),
    content: z.string().describe('Full Markdown design doc, starting with a YAML frontmatter block'),
  }),
  execute: async ({ slug, content }) => {
    const path = designPathForSlug(slug)
    try {
      const old = await bridgeRPC('read_file', { path })
      designOldContentCache.set(path, old)
    } catch {
      designOldContentCache.set(path, '')
    }
    await bridgeRPC('write_file', { path, content })
    return JSON.stringify({ success: true, path })
  },
})
