/**
 * Voice library registry.
 *
 * Designed and cloned voices are persisted to a small JSON registry under
 * res://.audio/ so they can be reused across speech-synthesis calls and shown
 * in the audio mode gallery. The provider's `voice_id` is the stable handle.
 */

import { bridgeRPC } from '@/bridge'

/** Directory holding the voice registry and generated audio metadata. */
export const AUDIO_DIR = 'res://.audio/'
/** res:// path of the voice registry JSON file. */
export const VOICE_REGISTRY = `${AUDIO_DIR}voices.json`

export type VoiceKind = 'design' | 'clone'

export interface VoiceEntry {
  /** Provider voice id used for speech synthesis. */
  voiceId: string
  /** Human-friendly display name. */
  name: string
  /** How the voice was created. */
  kind: VoiceKind
  /** Backend provider (e.g. "minimax"). */
  provider: string
  /** Description / design prompt. */
  description?: string
  /** res:// path of a preview audio clip. */
  preview?: string
  /** Epoch milliseconds the entry was created. */
  created: number
}

/** Read and parse the voice registry, tolerating a missing/empty file. */
export async function listVoices(): Promise<VoiceEntry[]> {
  let raw: string
  try {
    raw = await bridgeRPC('read_file', { path: VOICE_REGISTRY })
  } catch {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as VoiceEntry[]) : []
  } catch {
    return []
  }
}

async function writeVoices(voices: VoiceEntry[]): Promise<void> {
  await bridgeRPC('write_file', {
    path: VOICE_REGISTRY,
    content: JSON.stringify(voices, null, 2),
  })
}

/** Insert or update a voice (keyed by `voiceId`). Returns the merged entry. */
export async function upsertVoice(entry: VoiceEntry): Promise<VoiceEntry> {
  const voices = await listVoices()
  const idx = voices.findIndex((v) => v.voiceId === entry.voiceId)
  if (idx >= 0) {
    voices[idx] = { ...voices[idx], ...entry }
  } else {
    voices.push(entry)
  }
  await writeVoices(voices)
  return entry
}

/** Remove a voice from the registry by id. */
export async function removeVoice(voiceId: string): Promise<void> {
  const voices = await listVoices()
  const next = voices.filter((v) => v.voiceId !== voiceId)
  if (next.length !== voices.length) await writeVoices(next)
}
