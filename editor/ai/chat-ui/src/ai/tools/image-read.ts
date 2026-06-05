/**
 * Image-read tool — reads a project image and returns it as multimodal
 * content so the LLM can "see" it.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { bridgeRPC } from '@/bridge'

interface ReadImageResult {
  type: 'image'
  path: string
  mimeType: string
  width: number
  height: number
  base64: string
}

export const readImage = tool({
  description: [
    'Read an image file from the project and return it for visual analysis.',
    'The image is returned as actual pixel data the model can "see".',
    'Use this when you need to inspect textures, sprites, screenshots, or UI mockups.',
    'Accepted formats: png, jpg, jpeg, webp, gif, bmp, svg, tga.',
  ].join('\n'),
  inputSchema: z.object({
    path: z.string().describe('Absolute res:// path to the image file (e.g. "res://sprites/player.png").'),
  }),
  execute: async (args) => {
    const json = await bridgeRPC('read_image', args)
    const parsed: ReadImageResult & { error?: string } = JSON.parse(json)

    if (parsed.type !== 'image' || !parsed.base64) {
      return JSON.stringify({ error: 'Failed to read image', raw: json })
    }

    const dataUrl = `data:${parsed.mimeType};base64,${parsed.base64}`
    const textSummary = `Image: ${parsed.path} (${parsed.width}x${parsed.height}, ${parsed.mimeType})`

    return [
      { type: 'text' as const, text: textSummary },
      { type: 'image' as const, data: dataUrl, mimeType: parsed.mimeType },
    ]
  },
})
