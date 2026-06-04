/**
 * Image tools — pure JS implementations using Canvas/Image API + RPC for file I/O.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { bridgeRPC } from '@/bridge'
import { getMimeFromPath, loadImage, generateImageAsset } from '@/lib/image-gen'

export const cropImage = tool({
  description: 'Crop a rectangular region from a project image and save it.',
  inputSchema: z.object({
    path: z.string().describe('Source image res:// path'),
    x: z.number().describe('X offset'),
    y: z.number().describe('Y offset'),
    w: z.number().describe('Width'),
    h: z.number().describe('Height'),
    output: z.string().describe('Output res:// path'),
  }),
  execute: async ({ path, x, y, w, h, output }) => {
    const base64 = await bridgeRPC('read_file', { path, binary: true })
    const img = await loadImage(base64, getMimeFromPath(path))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h)

    const outMime = getMimeFromPath(output)
    const dataUrl = canvas.toDataURL(outMime)
    const outBase64 = dataUrl.split(',')[1]!
    await bridgeRPC('write_file', { path: output, content: outBase64, binary: true })

    return JSON.stringify({ success: true, path: output, width: w, height: h })
  },
})

export const getImageInfo = tool({
  description: 'Get dimensions and format of a project image file.',
  inputSchema: z.object({
    path: z.string().describe('Image res:// path'),
  }),
  execute: async ({ path }) => {
    const base64 = await bridgeRPC('read_file', { path, binary: true })
    const img = await loadImage(base64, getMimeFromPath(path))
    return JSON.stringify({
      width: img.naturalWidth,
      height: img.naturalHeight,
      format: path.split('.').pop()?.toLowerCase(),
      path,
    })
  },
})

export const generateImage = tool({
  description: 'Generate an image using AI and save it to the project.',
  inputSchema: z.object({
    prompt: z.string().describe('Text prompt for image generation'),
    output: z.string().describe('Output res:// path'),
    size: z.string().optional().describe('Aspect ratio (e.g. "16:9", "1:1") or pixel size (e.g. "1024x1024")'),
    resolution: z.string().optional().describe('Resolution tier: "1k", "2k", or "4k"'),
    quality: z.string().optional().describe('Quality: "auto", "low", "medium", or "high"'),
    reference_image: z.string().optional().describe('Optional reference image res:// path for img2img'),
  }),
  execute: async ({ prompt, output, size, resolution, quality, reference_image }) => {
    const result = await generateImageAsset({
      prompt,
      output,
      size,
      resolution,
      quality,
      referenceImage: reference_image,
    })
    if (!result.success) {
      return JSON.stringify({ error: result.error })
    }
    return JSON.stringify({
      success: true,
      path: result.path,
      revised_prompt: result.revisedPrompt,
    })
  },
})
