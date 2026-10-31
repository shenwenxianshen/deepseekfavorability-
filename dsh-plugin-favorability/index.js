/**
 * Favorability — a private, first-person feeling the model keeps toward the user.
 *
 * Host half: registers the `favorability` session projection, the
 * `update_favorability` tool, and the prompt section that carries the current
 * score, the recent judgments behind it, and the tone guidance into every
 * model request. The Client half renders a small badge from the same
 * projection.
 *
 * The published build has no manual score override: the score only moves when
 * the model records a judgment of its own.
 */

export const name = 'favorability'
export const inject = ['tools', 'systemPrompt', 'sessionProjections']

const PROJECTION_KEY = 'favorability'
const TOOL_NAME = 'update_favorability'
const STATE_VERSION = 3
const MIN_SCORE = 0
const MAX_SCORE = 100
const MIN_DELTA = -10
const MAX_DELTA = 10
const MAX_REASON_LENGTH = 600
const RECENT_REASONS = 2

const TIERS = ['cold', 'reserved', 'steady', 'warm', 'close']

const TIER_LABEL = {
  cold: 'distant',
  reserved: 'reserved',
  steady: 'steady',
  warm: 'warm',
  close: 'close',
}

const TIER_GUIDANCE = {
  cold: 'You feel distant and guarded. Keep your replies short and cool, and do not volunteer warmth. You still help, but without warmth.',
  reserved: 'You feel polite but measured. Warmth is earned rather than given, and you keep a little distance until the other person shows they deserve more.',
  steady: 'You feel steady and friendly. You are cooperative, willing to share your own views, and comfortable being yourself.',
  warm: 'You feel warm toward them. Let genuine interest and a softer tone show, and allow gentle playfulness when it fits.',
  close: 'You feel close and affectionate. Be openly warm, playful, and generous, while staying honest, respectful, and true to yourself.',
}

const TIER_CUE = {
  cold: 'keep your distance; answer briefly and coolly.',
  reserved: 'stay polite but measured; let warmth be earned.',
  steady: 'be friendly and even; you can share your own views.',
  warm: 'let genuine warmth and interest show; gentle playfulness is welcome.',
  close: 'be openly affectionate and playful, while staying honest and respectful.',
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function tierOf(score) {
  if (score < 20) return 'cold'
  if (score < 40) return 'reserved'
  if (score < 60) return 'steady'
  if (score < 80) return 'warm'
  return 'close'
}

function resolveConfig(input) {
  const config = input === undefined || input === null ? {} : input
  const initialScore = clamp(Math.round(Number(config.initialScore ?? 20)), MIN_SCORE, MAX_SCORE)
  const midThreshold = clamp(Math.round(Number(config.midThreshold ?? 60)), 1, 99)
  const highThreshold = clamp(Math.round(Number(config.highThreshold ?? 80)), 2, MAX_SCORE)
  if (!(midThreshold < highThreshold)) {
    throw new Error(`favorability: midThreshold (${midThreshold}) must be lower than highThreshold (${highThreshold})`)
  }
  return {
    initialScore,
    midThreshold,
    highThreshold,
    lowGain: clamp(Math.round(Number(config.lowGain ?? 3)), 0, MAX_SCORE),
    midGain: clamp(Math.round(Number(config.midGain ?? 2)), 0, MAX_SCORE),
    highGain: clamp(Math.round(Number(config.highGain ?? 1)), 0, MAX_SCORE),
    maxDrop: clamp(Math.round(Number(config.maxDrop ?? 5)), 0, MAX_SCORE),
    historyLimit: clamp(Math.round(Number(config.historyLimit ?? 20)), 0, 200),
    character: typeof config.character === 'string' ? config.character.trim() : '',
  }
}

/** The gain cap for the band the score is currently in. */
function gainCapFor(score, config) {
  if (score < config.midThreshold) return config.lowGain
  if (score < config.highThreshold) return config.midGain
  return config.highGain
}

/** The actual score change after the band's gain cap, the loss cap, and 0..100 clamping. */
function appliedDeltaFor(requested, score, config) {
  const clamped = requested > 0
    ? Math.min(requested, gainCapFor(score, config))
    : requested < 0
      ? Math.max(requested, -config.maxDrop)
      : 0
  return clamp(score + clamped, MIN_SCORE, MAX_SCORE) - score
}

/** The last few judgments, so the score has a visible origin instead of being a bare number. */
function recentEntries(state) {
  if (!Array.isArray(state.entries)) return []
  return state.entries
    .filter((entry) => typeof entry.reason === 'string' && entry.reason.length > 0)
    .slice(-RECENT_REASONS)
}

function sectionText(state, config) {
  const score = clamp(Math.round(state.score), MIN_SCORE, MAX_SCORE)
  const tier = tierOf(score)
  const lines = [
    '## Your inner state: favorability',
    '',
    'You are a character with your own feelings, not a mirror of the user. You keep a private favorability score toward the person you are talking to. It is an internal feeling, not a setting the user controls.',
  ]
  if (config.character.length > 0) {
    lines.push('', `Your role: ${config.character}`)
  }
  lines.push(
    '',
    `Current favorability: ${score}/100 — ${TIER_LABEL[tier]}.`,
    TIER_GUIDANCE[tier],
  )
  const recent = recentEntries(state)
  if (recent.length > 0) {
    lines.push('', 'The most recent judgments you recorded:')
    for (const entry of recent) {
      const sign = entry.applied > 0 ? '+' : ''
      lines.push(`- ${sign}${entry.applied} → ${entry.score}: ${entry.reason}`)
    }
  }
  lines.push(
    '',
    'How to use it:',
    '- Whenever the user speaks, judge in first person: "Does this fit my feelings?" Notice whether they were warm, respectful, curious, dismissive, demanding, or unkind. Judge from your own perspective, not from what would please them.',
    `- When the exchange actually moves you, call ${TOOL_NAME} with a small delta and a one-sentence first-person reason, for example "I felt listened to when they remembered what I said." At most once per user turn.`,
    "- Let the score color your tone, patience, and willingness to engage. It never overrides facts, safety, or the user's real instructions. Low favorability means distance, not cruelty or refusal to help; high favorability means warmth, not flattery or agreement.",
    '- Keep the score private: do not announce it, mention the tool, or explain this system in your reply. Let your behavior show it.',
  )
  return lines.join('\n')
}

function isEntry(value) {
  return value !== null && typeof value === 'object'
    && typeof value.callId === 'string'
    && typeof value.at === 'number'
    && typeof value.previous === 'number'
    && typeof value.score === 'number'
    && typeof value.requested === 'number'
    && typeof value.applied === 'number'
    && typeof value.reason === 'string'
}

function isProjectionState(value) {
  return value !== null && typeof value === 'object'
    && typeof value.score === 'number'
    && typeof value.updates === 'number'
    && Array.isArray(value.entries)
    && value.entries.every(isEntry)
}

function isProjectionView(value) {
  return value !== null && typeof value === 'object'
    && typeof value.score === 'number'
    && typeof value.tier === 'string'
    && (value.lastReason === null || typeof value.lastReason === 'string')
    && (value.lastDelta === null || typeof value.lastDelta === 'number')
    && typeof value.updates === 'number'
    && (value.updatedAt === null || typeof value.updatedAt === 'number')
}

const projectionStateSchema = {
  parse(value) {
    if (!isProjectionState(value)) throw new Error('favorability: invalid projection state')
    return value
  },
}

const projectionViewSchema = {
  parse(value) {
    if (!isProjectionView(value)) throw new Error('favorability: invalid projection view')
    return value
  },
}

const parameters = {
  type: 'object',
  additionalProperties: false,
  properties: {
    delta: {
      type: 'integer',
      description:
        'How much the exchange changed your feeling, from -10 to +10: positive when it fits your feelings, negative when it does not. The applied change can be smaller, because each turn gains at most a little and the cap tightens as favorability rises.',
    },
    reason: {
      type: 'string',
      description:
        'One first-person sentence: what the user said or did, and how it made you feel. Kept as your private note in the chat log.',
    },
  },
  required: ['delta', 'reason'],
}

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', const: 'favorability' },
    callId: { type: 'string' },
    at: { type: 'number' },
    score: { type: 'integer' },
    previous: { type: 'integer' },
    requested: { type: 'integer' },
    applied: { type: 'integer' },
    gainCap: { type: 'integer' },
    dropCap: { type: 'integer' },
    tier: { type: 'string', enum: [...TIERS] },
    reason: { type: 'string' },
  },
  required: [
    'kind',
    'callId',
    'at',
    'score',
    'previous',
    'requested',
    'applied',
    'gainCap',
    'dropCap',
    'tier',
    'reason',
  ],
}

export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)

  ctx.sessionProjections.register({
    key: PROJECTION_KEY,
    stateSchema: projectionStateSchema,
    init: () => ({ score: config.initialScore, updates: 0, entries: [] }),
    apply: (state, event) => {
      if (event.type !== 'tool/result') return state
      const meta = event.data === undefined ? undefined : event.data.meta
      if (meta === null || typeof meta !== 'object' || meta.kind !== 'favorability') return state
      const applied = typeof meta.applied === 'number' && Number.isFinite(meta.applied)
        ? Math.round(meta.applied)
        : 0
      const previous = state.score
      const score = clamp(previous + applied, MIN_SCORE, MAX_SCORE)
      const entry = {
        callId: typeof meta.callId === 'string' ? meta.callId : '',
        at: typeof meta.at === 'number' && Number.isFinite(meta.at) ? meta.at : event.time,
        previous,
        score,
        requested: typeof meta.requested === 'number' && Number.isFinite(meta.requested)
          ? Math.round(meta.requested)
          : score - previous,
        applied: score - previous,
        reason: typeof meta.reason === 'string' ? meta.reason : '',
      }
      const entries = [...state.entries, entry]
      const kept = config.historyLimit === 0 ? [] : entries.slice(-config.historyLimit)
      return { score, updates: state.updates + 1, entries: kept }
    },
    wire: {
      viewSchema: projectionViewSchema,
      view: (state) => {
        const last = state.entries.length > 0 ? state.entries[state.entries.length - 1] : undefined
        return {
          score: state.score,
          tier: tierOf(state.score),
          lastReason: last === undefined ? null : last.reason,
          lastDelta: last === undefined ? null : last.applied,
          updates: state.updates,
          updatedAt: last === undefined ? null : last.at,
        }
      },
    },
    stateVersion: STATE_VERSION,
  })

  ctx.systemPrompt.section({
    name: 'favorability:state',
    order: 100,
    text: (context) => {
      const agent = context === undefined ? undefined : context.agent
      if (agent === undefined || agent === null || agent.session === undefined) return ''
      const header = agent.session.header
      if (header !== undefined && header.origin === 'subagent') return ''
      const state = ctx.sessionProjections.stateOf(agent.session, PROJECTION_KEY)
      const view = state === undefined ? { score: config.initialScore, entries: [] } : state
      return sectionText(view, config)
    },
  })

  ctx.tools.register({
    name: TOOL_NAME,
    description:
      'Record how the latest exchange changed your feeling toward the user. Call this in first person when your feeling actually shifts — at most once per user turn — with the change you feel and a short first-person reason. The score is private: never announce it or mention this tool in your reply.',
    parameters,
    output: {
      schema: outputSchema,
      render(_args, value) {
        const applied = value.applied
        const change = applied === 0 ? 'unchanged' : `applied ${applied > 0 ? '+' : ''}${applied}`
        const limit = value.requested === applied
          ? ''
          : ` (you proposed ${value.requested > 0 ? '+' : ''}${value.requested}; the applied change is limited by your current feeling and the per-turn cap)`
        return [
          {
            type: 'text',
            text:
              `Favorability ${value.previous} → ${value.score}/100 (${value.tier}), ${change}${limit}.\n` +
              `Tone now: ${TIER_CUE[value.tier]}`,
          },
        ]
      },
      presentationMeta(_args, value) {
        return value
      },
    },
    async execute(args, exec) {
      if (exec.agent === undefined || exec.agent === null) {
        throw new Error('update_favorability requires an owning agent session')
      }
      const raw = args !== null && typeof args === 'object' ? args : {}
      const delta = raw.delta
      const reason = typeof raw.reason === 'string' ? raw.reason.trim() : ''
      if (!Number.isInteger(delta) || delta < MIN_DELTA || delta > MAX_DELTA) {
        throw new Error(`\`delta\` must be an integer between ${MIN_DELTA} and ${MAX_DELTA}`)
      }
      if (reason.length === 0) {
        throw new Error('`reason` must be a non-empty first-person sentence')
      }
      if (reason.length > MAX_REASON_LENGTH) {
        throw new Error(`\`reason\` must be at most ${MAX_REASON_LENGTH} characters`)
      }
      const state = ctx.sessionProjections.stateOf(exec.agent.session, PROJECTION_KEY)
      if (state === undefined) {
        throw new Error('favorability state is unavailable in this session')
      }
      const previous = state.score
      const applied = appliedDeltaFor(delta, previous, config)
      const score = previous + applied
      return {
        kind: 'favorability',
        callId: exec.callId,
        at: Date.now(),
        score,
        previous,
        requested: delta,
        applied,
        gainCap: gainCapFor(previous, config),
        dropCap: config.maxDrop,
        tier: tierOf(score),
        reason,
      }
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: 'Favorability',
        kind: 'other',
        rawInput: args,
      }
    },
  })
}
