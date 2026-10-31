/**
 * Favorability — browser half.
 *
 * Renders a compact badge in the composer dock, below the composer card, and
 * reads the live score from the Host-computed `favorability` session
 * projection. All copy goes through the Client locale service.
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-favorability',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'favorability'

    const DICT = {
      en: {
        'badge.label': 'Favorability',
        'badge.none': 'No shift yet.',
        'tier.cold': 'Distant',
        'tier.reserved': 'Reserved',
        'tier.steady': 'Steady',
        'tier.warm': 'Warm',
        'tier.close': 'Close',
      },
      zh: {
        'badge.label': '好感度',
        'badge.none': '还没有变化。',
        'tier.cold': '疏离',
        'tier.reserved': '克制',
        'tier.steady': '平稳',
        'tier.warm': '亲近',
        'tier.close': '依恋',
      },
    }

    const FALLBACK = DICT.en

    const TIER_ORDER = ['cold', 'reserved', 'steady', 'warm', 'close']

    function tierOf(score) {
      if (score < 20) return 'cold'
      if (score < 40) return 'reserved'
      if (score < 60) return 'steady'
      if (score < 80) return 'warm'
      return 'close'
    }

    function text(t, key) {
      if (typeof t === 'function') {
        const value = t(key)
        if (typeof value === 'string' && value.length > 0) return value
      }
      return FALLBACK[key] === undefined ? key : FALLBACK[key]
    }

    const pill = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '1px 9px',
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: '999px',
      background: 'var(--dsw-alias-bg-layer-1)',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '11px',
      lineHeight: '18px',
      whiteSpace: 'nowrap',
      userSelect: 'none',
      cursor: 'default',
    }

    const labelStyle = {
      color: 'var(--dsw-alias-label-secondary)',
    }

    const scoreStyle = {
      color: 'var(--dsw-alias-label-primary)',
      fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
    }

    const tierStyle = {
      color: 'var(--dsw-alias-label-secondary)',
      opacity: 0.85,
    }

    function Badge(props) {
      const projection = props.useProjection(NS)
      const t = props.t

      if (projection === undefined || projection === null || typeof projection.score !== 'number') {
        return null
      }

      const score = Math.max(0, Math.min(100, Math.round(projection.score)))
      const tier = TIER_ORDER.includes(projection.tier) ? projection.tier : tierOf(score)
      const warm = score >= 60
      const rawReason = typeof projection.lastReason === 'string' ? projection.lastReason : ''
      const reason = rawReason.length > 0 ? rawReason : text(t, 'badge.none')
      const title = `${text(t, 'badge.label')} ${score}/100 · ${text(t, 'tier.' + tier)}\n${reason}`

      return h(
        'div',
        {
          style: pill,
          title,
          'data-dsh-favorability': String(score),
          'aria-label': `${text(t, 'badge.label')} ${score}/100 ${text(t, 'tier.' + tier)}`,
        },
        h(
          'svg',
          {
            width: 12,
            height: 12,
            viewBox: '0 0 24 24',
            'aria-hidden': true,
            style: { display: 'block', flex: 'none' },
          },
          h('path', {
            d: 'M12 20.5 4.6 13.1a5 5 0 0 1 7.1-7.1l.3.3.3-.3a5 5 0 0 1 7.1 7.1Z',
            fill: warm ? 'var(--dsw-alias-brand-primary)' : 'none',
            stroke: warm ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
            strokeWidth: 1.8,
            strokeLinejoin: 'round',
          }),
        ),
        h('span', { style: labelStyle }, text(t, 'badge.label')),
        h('span', { style: scoreStyle }, String(score)),
        h('span', { style: tierStyle }, text(t, 'tier.' + tier)),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const disposeEn = ctx.locale.register(NS, 'en', DICT.en)
          const disposeZh = ctx.locale.register(NS, 'zh', DICT.zh)
          return () => {
            disposeZh()
            disposeEn()
          }
        }, 'favorability: dictionaries')

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
          {
            name: 'conversation.composer.dock',
            id: 'favorability',
            order: 2,
            locale: NS,
          },
          Badge,
        ))
      },
    }
  },
})
