/**
 * Plan-mode tools — plan creation and execution tracking.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { getActivePlan, updatePlanStep } from '@/bridge'

export const exitPlanMode = tool({
  description: [
    'Finish plan mode: hand the plan to the user for approval.',
    'In plan mode, end every turn with either this tool or ask_user — no exceptions.',
    'Put the full plan in plan_content (Markdown). Keep reply text to a 1–2 sentence summary.',
    'plan_content should cover: recommended approach, critical file paths, implementation steps, and how to verify.',
  ].join('\n'),
  inputSchema: z.object({
    plan_summary: z.string().describe('Brief one-line summary of the plan (shown in the card header)'),
    plan_content: z.string().describe(
      'Full plan Markdown for the plan card. Include approach, critical paths, steps, and verification.',
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
  description: [
    'Update progress on the active plan while executing it.',
    'Call update_plan(step_index, "in_progress") when starting a step,',
    '"done" when finished, or "skipped" if the step is not needed.',
  ].join(' '),
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
