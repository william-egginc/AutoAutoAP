/**
 * Never nothing for the instant answer (lib/renderGuard.ts; Jordan's Safari shot, 24 Oct 2026: the Hide pill
 * with no card under it). The card (InstantRoute) goes in the default slot. If it can't be drawn (its setup, render
 * or update throws, which a production build of Vue draws as nothing), this says so, with Show it again: a fresh
 * card, which puts a saved answer back at once. The card stays mounted beside the message: one that draws again by
 * itself shows as usual.
 *
 * A render function, not a single-file component, so its spec can draw it with Vue's own renderer and throw at it
 * (InstantGuard.spec.ts): component specs otherwise render on the server, where an error after the first render
 * never shows.
 *
 * What threw is kept (lib/renderGuard.ts `cardErrorOf`: name, message, where, 3 stack lines, no ID, no URL query):
 * one tagged console line, and a closed "Details" fold in the message (crash2, 26 Oct 2026).
 */
import { defineComponent, getCurrentInstance, h, onErrorCaptured, ref } from 'vue';
import { INSTANT_FAILED, cardErrorLog, cardErrorOf, cardErrorText, isRenderFailure, type CardError } from '@/lib/renderGuard';

export default defineComponent({
  name: 'InstantGuard',
  setup(_props, { slots }) {
    const failed = ref(false);
    const caught = ref<CardError | null>(null);
    const mounts = ref(0);
    const self = getCurrentInstance()?.proxy ?? null;

    onErrorCaptured((err, instance, info) => {
      // Only the card in the slot failing to draw itself; a part inside it (its own component) blanks only that part.
      if (!self || instance?.$parent !== self || !isRenderFailure(info)) return;
      const e = cardErrorOf(err, info);
      console.error(cardErrorLog(e));
      caught.value = e;
      failed.value = true;
      return false;
    });

    function again(): void {
      failed.value = false;
      caught.value = null;
      mounts.value++;
    }

    return () =>
      h('div', { class: 'space-y-3' }, [
        failed.value
          ? h(
              'section',
              { class: 'rounded-2xl border border-emerald-200 bg-white p-4 space-y-3', 'data-testid': 'instant-failed' },
              [
                h('h3', { class: 'text-title font-bold text-slate-900' }, 'Instant answer'),
                h(
                  'p',
                  { class: 'rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-body text-amber-900' },
                  INSTANT_FAILED
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class:
                      'min-h-[44px] px-4 rounded-lg border border-emerald-700 text-emerald-800 label hover:bg-emerald-50',
                    'data-testid': 'instant-failed-again',
                    onClick: again,
                  },
                  'Show it again'
                ),
                caught.value
                  ? h('details', { class: 'text-small text-slate-600', 'data-testid': 'instant-failed-details' }, [
                      h('summary', { class: 'cursor-pointer font-bold text-slate-700' }, 'Details'),
                      h(
                        'pre',
                        {
                          class: 'mt-1 whitespace-pre-wrap break-words rounded bg-slate-50 border border-slate-200 p-2 text-small text-slate-700',
                          'data-testid': 'instant-failed-error',
                        },
                        cardErrorText(caught.value)
                      ),
                    ])
                  : null,
              ]
            )
          : null,
        h('div', { key: mounts.value }, slots.default?.()),
      ]);
  },
});
