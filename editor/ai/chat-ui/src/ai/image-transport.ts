/**
 * Custom chat transport for the "Image" mode.
 *
 * Unlike the normal chat transport (an LLM agent that may call tools), this
 * transport sends the user's prompt directly to the configured image model,
 * saves the result into the project asset directory, and streams the generated
 * image back as an assistant message (via a `file` UI chunk).
 */

import type { DirectChatTransport } from 'ai'
import { getSelectedImageModel, getImageSize, getAttachments, clearAttachments } from '@/bridge'
import { generateImageData } from '@/lib/image-gen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lastUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    const parts = m.parts ?? m.content ?? []
    return parts
      .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('\n')
      .trim()
  }
  return ''
}

/**
 * Create a {@link DirectChatTransport}-compatible transport that generates
 * images directly from the configured image model.
 */
export function createImageChatTransport(): DirectChatTransport {
  const transport = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async sendMessages({ messages }: any): Promise<ReadableStream> {
      const prompt = lastUserText(messages)
      const attachments = getAttachments()
      // Prefer the data URL (works for both uploaded files and asset-library
      // previews); fall back to the res:// path when no preview is available.
      const referenceImage = attachments[0]?.dataUrl || attachments[0]?.path
      clearAttachments()
      const model = getSelectedImageModel()

      // The stream is returned immediately and generation runs inside `start`,
      // so the assistant message enters its `running` state right away and the
      // UI can show a "generating" placeholder while we wait for the model.
      return new ReadableStream({
        async start(controller) {
          controller.enqueue({ type: 'start' })
          controller.enqueue({ type: 'start-step' })

          // On success we only stream the image (no text note). A text note is
          // emitted only for the empty-prompt / no-model / error cases.
          let note = ''
          let dataUrl: string | undefined
          let mediaType = 'image/png'

          if (!prompt) {
            note = 'Please describe the image you want to generate.'
          } else if (!model) {
            note = 'No image model configured. Add one in Settings → Image Models.'
          } else {
            try {
              const result = await generateImageData({
                prompt,
                size: getImageSize(),
                referenceImage,
                model,
              })
              if (result.success && result.dataUrl) {
                dataUrl = result.dataUrl
                mediaType = result.mediaType ?? 'image/png'
              } else {
                note = `Generation failed: ${result.error ?? 'Unknown error'}`
              }
            } catch (err) {
              note = `Generation failed: ${err instanceof Error ? err.message : String(err)}`
            }
          }

          if (dataUrl) {
            controller.enqueue({ type: 'file', url: dataUrl, mediaType })
          }
          if (note) {
            const textId = `txt-${Date.now()}`
            controller.enqueue({ type: 'text-start', id: textId })
            controller.enqueue({ type: 'text-delta', id: textId, delta: note })
            controller.enqueue({ type: 'text-end', id: textId })
          }
          controller.enqueue({ type: 'finish-step' })
          controller.enqueue({ type: 'finish' })
          controller.close()
        },
      })
    },
    async reconnectToStream(): Promise<ReadableStream | null> {
      return null
    },
  }

  return transport as unknown as DirectChatTransport
}
