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
  description:
    'Use this tool when you need to ask the user questions during execution. ' +
    'This allows you to: ' +
    '1. Gather user preferences or requirements ' +
    '2. Clarify ambiguous instructions ' +
    '3. Get decisions on implementation choices as you work ' +
    '4. Offer choices to the user about what direction to take.\n\n' +
    'Usage notes:\n' +
    '- When `custom` is enabled (default), a "Type your own answer" option is added automatically; don\'t include "Other" or catch-all options\n' +
    '- Answers are returned as arrays of labels; set `multiple: true` to allow selecting more than one\n' +
    '- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label',
  inputSchema: z.object({
    questions: z.array(questionSchema).min(1).describe('Questions to ask'),
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
