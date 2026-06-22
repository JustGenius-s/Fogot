/**
 * Audio-mode tools — voice design, voice cloning, character dubbing (TTS) and
 * background-music generation. All synthesized audio is saved into the project
 * via the binary write_file RPC; designed/cloned voices are registered in the
 * voice library so they can be reused.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  designVoice,
  cloneVoice,
  synthesizeSpeech,
  generateMusic,
  saveAudioBase64,
} from '@/lib/audio-gen'
import { listVoices, upsertVoice } from '@/lib/voices'
import { getSelectedAudioModel } from '@/bridge'

/** Normalize an output path, ensuring it lives under res:// and has an ext. */
function normalizeOutput(output: string, fallbackExt = 'mp3'): string {
  let p = output.trim()
  if (!p.startsWith('res://')) p = `res://${p.replace(/^\/+/, '')}`
  if (!/\.[a-z0-9]+$/i.test(p)) p = `${p}.${fallbackExt}`
  return p
}

export const designVoiceTool = tool({
  description: [
    'Design a brand-new voice (音色生成) from a natural-language description.',
    'Returns a reusable voice_id and saves a preview clip. Use the voice_id',
    'with generate_speech to dub character lines.',
  ].join(' '),
  inputSchema: z.object({
    name: z.string().describe('Display name for the voice, e.g. "骑士艾伦"'),
    description: z.string().describe('Voice description: tone, age, pace, emotion, scenario'),
    preview_text: z.string().describe('Short line to speak in the preview (≤ 500 chars)'),
    output: z.string().describe('Output res:// path for the preview audio, e.g. res://assets/audio/voices/hero.mp3'),
    voice_id: z.string().optional().describe('Optional custom voice id; auto-generated if omitted'),
  }),
  execute: async ({ name, description, preview_text, output, voice_id }) => {
    const result = await designVoice({ prompt: description, previewText: preview_text, voiceId: voice_id })
    if (!result.success || !result.audioBase64 || !result.voiceId) {
      return JSON.stringify({ error: result.error ?? 'Voice design failed' })
    }
    const path = normalizeOutput(output)
    await saveAudioBase64(result.audioBase64, path)
    await upsertVoice({
      voiceId: result.voiceId,
      name,
      kind: 'design',
      provider: getSelectedAudioModel()?.provider ?? 'minimax',
      description,
      preview: path,
      created: Date.now(),
    })
    return JSON.stringify({ success: true, voice_id: result.voiceId, name, preview: path })
  },
})

export const cloneVoiceTool = tool({
  description: [
    'Clone a voice (音色克隆) from a reference audio file already in the project.',
    'Reference must be mp3/m4a/wav, 10s–5min, ≤ 20MB. Returns a reusable voice_id',
    'and saves a preview clip when preview_text is provided.',
  ].join(' '),
  inputSchema: z.object({
    name: z.string().describe('Display name for the cloned voice'),
    reference_audio: z.string().describe('res:// path of the reference audio to clone from'),
    voice_id: z.string().describe('Custom voice id to assign (letters/digits, must be unique)'),
    preview_text: z.string().optional().describe('Line to synthesize as a preview (also activates the voice)'),
    output: z.string().optional().describe('Output res:// path for the preview audio'),
  }),
  execute: async ({ name, reference_audio, voice_id, preview_text, output }) => {
    const result = await cloneVoice({ referenceAudio: reference_audio, voiceId: voice_id, previewText: preview_text })
    if (!result.success) {
      return JSON.stringify({ error: result.error ?? 'Voice clone failed' })
    }
    let preview: string | undefined
    if (result.audioBase64 && output) {
      preview = normalizeOutput(output)
      await saveAudioBase64(result.audioBase64, preview)
    }
    await upsertVoice({
      voiceId: voice_id,
      name,
      kind: 'clone',
      provider: getSelectedAudioModel()?.provider ?? 'minimax',
      preview,
      created: Date.now(),
    })
    return JSON.stringify({ success: true, voice_id, name, preview, note: result.error })
  },
})

export const generateSpeechTool = tool({
  description: [
    'Synthesize a character voice line (角色配音) from text using a voice_id',
    'produced by design_voice or clone_voice (or a system voice). Saves an audio',
    'file to the project.',
  ].join(' '),
  inputSchema: z.object({
    text: z.string().describe('The line of dialogue to speak'),
    voice_id: z.string().describe('Voice id to speak with'),
    output: z.string().describe('Output res:// path, e.g. res://assets/audio/lines/hero-001.mp3'),
    speed: z.number().optional().describe('Speech speed 0.5–2.0 (default 1.0)'),
    volume: z.number().optional().describe('Volume 0–10 (default 1.0)'),
    pitch: z.number().optional().describe('Pitch -12–12 (default 0)'),
    emotion: z.string().optional().describe('Emotion tag, e.g. "happy", "sad", "angry"'),
  }),
  execute: async ({ text, voice_id, output, speed, volume, pitch, emotion }) => {
    const result = await synthesizeSpeech({ text, voiceId: voice_id, speed, volume, pitch, emotion })
    if (!result.success || !result.audioBase64) {
      return JSON.stringify({ error: result.error ?? 'Speech synthesis failed' })
    }
    const path = normalizeOutput(output)
    await saveAudioBase64(result.audioBase64, path)
    return JSON.stringify({ success: true, path, voice_id })
  },
})

export const generateMusicTool = tool({
  description: [
    'Generate background music (背景音乐) from a style prompt and optional lyrics.',
    'Set instrumental for vocals-free music. Saves an audio file to the project.',
  ].join(' '),
  inputSchema: z.object({
    prompt: z.string().describe('Style/mood/scenario description (≤ 2000 chars)'),
    output: z.string().describe('Output res:// path, e.g. res://assets/audio/music/battle.mp3'),
    lyrics: z.string().optional().describe('Lyrics with [Verse]/[Chorus] tags (≤ 3500 chars)'),
    instrumental: z.boolean().optional().describe('Generate instrumental music with no vocals'),
    lyrics_optimizer: z.boolean().optional().describe('Auto-write lyrics from the prompt'),
  }),
  execute: async ({ prompt, output, lyrics, instrumental, lyrics_optimizer }) => {
    const result = await generateMusic({ prompt, lyrics, instrumental, lyricsOptimizer: lyrics_optimizer })
    if (!result.success || !result.audioBase64) {
      return JSON.stringify({ error: result.error ?? 'Music generation failed' })
    }
    const path = normalizeOutput(output)
    await saveAudioBase64(result.audioBase64, path)
    return JSON.stringify({ success: true, path })
  },
})

export const listVoicesTool = tool({
  description: 'List voices in the project voice library (designed and cloned).',
  inputSchema: z.object({}),
  execute: async () => {
    const voices = await listVoices()
    return JSON.stringify({
      voices: voices.map((v) => ({
        voice_id: v.voiceId,
        name: v.name,
        kind: v.kind,
        description: v.description,
        preview: v.preview,
      })),
    })
  },
})
