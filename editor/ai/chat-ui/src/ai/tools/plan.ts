/**
 * Plan-mode tools — plan creation and execution tracking.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { getActivePlan, updatePlanStep } from '@/bridge'

export const exitPlanMode = tool({
  description:
    'Signal that the plan is complete and ready for user approval. ' +
    'You MUST call this tool after composing your plan. ' +
    'Pass the full plan markdown content — it will be displayed in a plan card for user review. ' +
    'Do NOT write the full plan in your reply text; keep your reply concise.',
  inputSchema: z.object({
    plan_summary: z.string().describe('Brief one-line summary of the plan (shown in the card header)'),
    plan_content: z.string().describe(
      'The full plan markdown content. Include all sections: background, design decisions, file paths, implementation steps, verification.',
    ),
    steps: z.array(
      z.string().describe('Step title (concise, actionable)'),
    ).min(1).describe('Implementation steps from the plan, in execution order'),
  }),
  execute: async ({ plan_summary, plan_content, steps }) => {
    return JSON.stringify({ summary: plan_summary, content: plan_content, steps })
  },
})

export const updatePlan = tool({
  description: 'Update the progress of the active plan. Call this after completing or starting each step.',
  inputSchema: z.object({
    step_index: z.number().describe('Zero-based index of the step to update'),
    status: z.enum(['in_progress', 'done', 'skipped']).describe('New status for the step'),
  }),
  execute: async ({ step_index, status }) => {
    const plan = getActivePlan()
    if (!plan) return JSON.stringify({ error: 'No active plan' })
    if (step_index < 0 || step_index >= plan.steps.length) {
      return JSON.stringify({ error: `Invalid step index: ${step_index}. Plan has ${plan.steps.length} steps.` })
    }
    updatePlanStep(step_index, status)
    const updated = getActivePlan()!
    const done = updated.steps.filter((s) => s.status === 'done').length
    return JSON.stringify({
      success: true,
      step: updated.steps[step_index].title,
      progress: `${done}/${updated.steps.length} steps done`,
    })
  },
})
