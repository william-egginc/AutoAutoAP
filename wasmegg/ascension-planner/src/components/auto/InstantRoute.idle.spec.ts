/**
 * The instant answer's card never shows nothing (Jordan's Safari reload, 23 Oct 2026: the answer gone after a
 * reload, with no word why). With no answer, nothing loading, no error and nothing waited for, one line says where
 * it stands (search/instantDeferral.ts `idleLine`), with "Work it out" when there is a save to work it out from.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IDLE_LOADING, IDLE_NOT_YET, IDLE_NO_SAVE, idleLine } from '@/search/instantDeferral';

const instant = fs.readFileSync(path.resolve(__dirname, 'InstantRoute.vue'), 'utf8');
const template = instant.slice(0, instant.indexOf('<script setup'));
/** The first section (the card with an answer or on its way to one), up to the no-table card. */
const card = template.slice(0, template.indexOf('data-testid="instant-no-table"'));

describe('idleLine', () => {
  it('loading while a run is due or Your setup is still being read', () => {
    expect(idleLine({ due: true, setupLoaded: true, te: 250 })).toEqual({
      text: IDLE_LOADING,
      spin: true,
      button: false,
    });
    expect(idleLine({ due: false, setupLoaded: false, te: 250 })).toEqual({
      text: IDLE_LOADING,
      spin: true,
      button: false,
    });
  });

  it('waits for a save, and otherwise offers to work it out', () => {
    expect(idleLine({ due: false, setupLoaded: true, te: 0 })).toEqual({
      text: IDLE_NO_SAVE,
      spin: false,
      button: false,
    });
    expect(idleLine({ due: false, setupLoaded: true, te: 250 })).toEqual({
      text: IDLE_NOT_YET,
      spin: false,
      button: true,
    });
  });

  it('player words: no "table", curly apostrophe', () => {
    for (const t of [IDLE_LOADING, IDLE_NO_SAVE, IDLE_NOT_YET]) expect(t).not.toMatch(/table|'/i);
  });
});

describe('InstantRoute: the line closes the chain of states', () => {
  it('comes after the error line, for no answer and nothing waited for, with Work it out', () => {
    const error = card.indexOf(`v-else-if="status === 'error'"\n`);
    const idle = card.indexOf('v-else-if="!result && !waiting"');
    expect(error).toBeGreaterThan(0);
    expect(idle).toBeGreaterThan(error);
    const line = card.slice(idle, card.indexOf('</p>', idle));
    expect(line).toContain('data-testid="instant-idle"');
    expect(line).toContain('{{ idle.text }}');
    expect(line).toContain(`@click="pressRun(false, 'again')"`);
    expect(instant).toContain(
      'idleLine({ due: runDue.value || tablesWait.value, setupLoaded: store.setupLoaded, te: Math.floor(store.currentTE) })'
    );
  });
});
