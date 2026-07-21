/**
 * Question tool — ask the user clarifying questions during execution.
 *
 * Mirrors opencode's question tool pattern: the execute function awaits
 * user answers via question-store, while the tool UI renders the form
 * during the "running" status.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { enqueueQuestions } from '@/ai/question-store'

const optionSchema = z.object({
  label: z.string().describe('Display text (1-5 words, concise)'),
  description: z.string().describe('Explanation of choice'),
})

const questionSchema = z.object({
  question: z.string().describe('Complete question'),
  header: z.string().max(30).describe('Very short label (max 30 chars)'),
  options: z.array(optionSchema).min(1).describe('Available choices'),
  multiple: z.boolean().optional().default(false).describe('Allow selecting multiple choices'),
})

export const askUser = tool({
  description: [
    'Ask the user clarifying questions when intent is ambiguous or a decision is needed.',
    'Usage:',
    '- Ask 1–3 questions at a time; each with 2–4 short options (1–5 words).',
    '- Put the recommended option first and suffix its label with "(Recommended)".',
    '- Do not include an "Other" option — a custom answer field is added automatically.',
    '- After answers return, continue; do not re-ask what is already clear.',
    '- In plan mode, a turn may end with ask_user instead of exit_plan_mode when clarification is required.',
  ].join('\n'),
  inputSchema: z.object({
    questions: z.array(questionSchema).min(1).max(3).describe('1–3 questions to ask'),
  }),
  execute: async ({ questions }) => {
    const answers = await enqueueQuestions(questions)
    const formatted = questions
      .map((q, i) => {
        const answerLabels = answers[i]?.length ? answers[i].join(', ') : 'Unanswered'
        return `"${q.header}"="${answerLabels}"`
      })
      .join(', ')
    return `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`
  },
})
