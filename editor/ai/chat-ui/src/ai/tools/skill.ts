/**
 * use_skill — model calls this to load full SKILL.md content.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { getAvailableSkills, addInvokedSkill, hasInvokedSkill } from '@/bridge'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSkill(skill_id: string): any | undefined {
  return getAvailableSkills().find((s: any) => s.id === skill_id)
}

export const useSkill = tool({
  description: [
    'Load a skill guide to gain specialized knowledge for the current task.',
    'Call this when a task would benefit from domain expertise listed in the available skills.',
    'The skill content will be returned as detailed instructions.',
    'Each skill only needs to be loaded once per conversation.',
  ].join('\n'),
  inputSchema: z.object({
    skill_id: z.string().describe('The skill ID to load (from the available skills list)'),
  }),
  execute: async ({ skill_id }) => {
    const skills = getAvailableSkills()
    const skill = skills.find((s: any) => s.id === skill_id)

    if (!skill) {
      const available = skills.map((s: any) => s.id).join(', ')
      return JSON.stringify({ error: `Skill "${skill_id}" not found. Available: ${available || 'none'}` })
    }
    if (hasInvokedSkill(skill_id)) {
      return JSON.stringify({ info: `Skill "${skill.name}" already loaded in this conversation.` })
    }
    addInvokedSkill(skill_id)
    return `# Skill: ${skill.name}\n\n${skill.content}`
  },
})
