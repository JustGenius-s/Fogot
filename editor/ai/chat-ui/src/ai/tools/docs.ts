/**
 * Documentation & debugger tools.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { bridgeRPC, getDebuggerErrors as getDebuggerErrorBuffer, clearDebuggerErrors } from '@/bridge'

export const getClassDocs = tool({
  description: [
    'Query built-in Godot class documentation. Use this to look up API details for any engine class.',
    'Three modes:',
    '- list_classes=true: Returns all available class names',
    '- class_name + brief=true: Returns a compact overview (signatures only, no descriptions)',
    '- class_name only: Returns full documentation with descriptions',
    'Use brief mode first to get an overview, then query full docs if you need method details.',
  ].join('\n'),
  inputSchema: z.object({
    class_name: z.string().optional().describe('The class name to look up (e.g. "Node2D", "CharacterBody2D")'),
    list_classes: z.boolean().optional().describe('If true, returns a list of all available class names'),
    brief: z.boolean().optional().describe('If true, returns a compact overview without descriptions'),
  }),
  execute: async (args) => bridgeRPC('get_class_docs', args),
})

export const getDebuggerErrors = tool({
  description: 'Get runtime errors and warnings from the Godot debugger. Use this to diagnose issues when the game is running or has just crashed.',
  inputSchema: z.object({
    max_count: z.number().optional().describe('Maximum number of errors to return (default: 50)'),
    errors_only: z.boolean().optional().describe('If true, filter out warnings and return only errors'),
    clear: z.boolean().optional().describe('If true, clear the error buffer after reading'),
  }),
  execute: async ({ max_count, errors_only, clear }) => {
    let errors = getDebuggerErrorBuffer()
    if (errors_only) {
      errors = errors.filter((e) => e.type === 'error')
    }
    const limit = max_count ?? 50
    const result = errors.slice(-limit)
    if (clear) {
      clearDebuggerErrors()
    }
    return JSON.stringify({
      total: errors.length,
      returned: result.length,
      errors: result,
    })
  },
})
