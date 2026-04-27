import { Brain, Zap, Sparkles, Atom } from 'lucide-react';

export const OFFICIAL_CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type ClaudeEffortLevel = (typeof OFFICIAL_CLAUDE_EFFORT_LEVELS)[number];

export const thinkingModes = [
  {
    id: 'low',
    name: 'Low',
    description: 'Fastest official effort level',
    icon: null,
    color: 'text-gray-600'
  },
  {
    id: 'medium',
    name: 'Medium',
    description: 'Balanced official effort level',
    icon: Brain,
    color: 'text-blue-600'
  },
  {
    id: 'high',
    name: 'High',
    description: 'Default official effort level',
    icon: Zap,
    color: 'text-purple-600'
  },
  {
    id: 'xhigh',
    name: 'XHigh',
    description: 'Deeper official effort level',
    icon: Sparkles,
    color: 'text-indigo-600'
  },
  {
    id: 'max',
    name: 'Max',
    description: 'Maximum official effort level',
    icon: Atom,
    color: 'text-red-600'
  }
];
