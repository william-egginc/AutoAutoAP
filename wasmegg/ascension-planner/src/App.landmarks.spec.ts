/**
 * Landmarks and headings (the UX review of 25 Oct 2026, accessibility): one <main> round the screens, and one
 * visible h1 per screen, the screen's own title. The screens are server-rendered (each must hold exactly one h1, with
 * its name from lib/siteNav.ts NAMES); App.vue's own wiring is read from its source: the header's title is the h1
 * only while no screen shows one, and Manual and Single run get theirs from App.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { Component } from 'vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { NAMES, fastestName } from '@/lib/siteNav';
import MyRunsView from '@/components/MyRunsView.vue';
import HowItWorks from '@/components/science/HowItWorks.vue';
import StartTimeCard from '@/components/auto/StartTimeCard.vue';
import LeaderboardPanel from '@/components/auto/LeaderboardPanel.vue';
import FastestRoute from '@/components/auto/FastestRoute.vue';
import ByDateScreen from '@/components/auto/ByDateScreen.vue';
import RunAnnouncer from '@/components/auto/RunAnnouncer.vue';

const app = fs.readFileSync(path.resolve(__dirname, 'App.vue'), 'utf8');
const template = app.slice(0, app.indexOf('<script setup'));

let pinia: Pinia;
beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** The text of every h1 in the html. */
function h1s(html: string): string[] {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(m => textOf(m[1]));
}

describe('each screen has one h1, its own title', () => {
  const screens: [string, Component, Record<string, unknown>, string][] = [
    ['My runs', MyRunsView, { playerId: 'EI1234567890123456' }, NAMES.myRuns],
    ['Fastest', FastestRoute, { playerId: 'EI1234567890123456', depth: 'smart', lockedTo: null, blockedBy: null }, fastestName(490)],
    ['Highest TE by a date', ByDateScreen, { playerId: 'EI1234567890123456' }, NAMES.byDate],
    ['Science › How it works', HowItWorks, {}, 'How it works, and how we checked it'],
    ['Science › When should I start?', StartTimeCard, {}, NAMES.start],
    ['Leaderboard', LeaderboardPanel, { playerId: 'EI1234567890123456' }, NAMES.compare],
  ];
  for (const [name, comp, props, title] of screens) {
    it(name, async () => {
      const html = await renderHtml(comp, props, {}, [pinia]);
      expect(h1s(html)).toEqual([title]);
      expect(html).not.toContain('EI1234567890123456');
    });
  }
  it('My runs’ board part (LeaderboardPanel in its my-runs mode) adds no h1 of its own', async () => {
    const html = await renderHtml(LeaderboardPanel, { playerId: 'P', mode: 'myruns' }, {}, [pinia]);
    expect(h1s(html)).toEqual([]);
  });
});

describe('App.vue', () => {
  it('has one <main>, round the screens: from the study box to just before the footer', () => {
    expect(template.match(/<main\b/g)).toHaveLength(1);
    expect(template.match(/<\/main>/g)).toHaveLength(1);
    const open = template.indexOf('<main');
    const close = template.indexOf('</main>');
    expect(open).toBeLessThan(template.indexOf('<StudyBox'));
    expect(open).toBeGreaterThan(template.indexOf('data-testid="header-toggle"'));
    for (const screen of ['<FastestRoute', '<ByDateScreen', '<AutomaticPlanner', '<LeaderboardPanel', '<MyRunsView', '<HowItWorks'])
      expect(template.indexOf(screen), screen).toBeGreaterThan(open);
    expect(close).toBeLessThan(template.indexOf('<footer'));
    expect(close).toBeGreaterThan(template.indexOf('<FloatingNotes'));
  });

  it("the header's title is the h1 only while no screen shows its own", () => {
    expect(template).toContain(`<component :is="screenHasH1 ? 'p' : 'h1'" class="mx-4 mt-8 mb-2 text-center heading-xl text-gradient">`);
    const rule = app.slice(app.indexOf('const screenHasH1 = computed('), app.indexOf('/** The pill'));
    expect(rule).toContain(`(plannerTab.value === 'automatic' && !!playerId.value && !loading.value)`);
    expect(rule).toContain(`plannerTab.value === 'myruns'`);
    expect(rule).toContain(`plannerTab.value === 'science'`);
    expect(rule).toContain(`plannerTab.value === 'leaderboard'`);
    expect(rule).toContain(`(plannerTab.value === 'manual' && !!playerId.value)`);
    // The screens it counts on: the Auto Planner's three only render with a save, not while loading.
    expect(template).toContain(`<div v-if="plannerTab === 'automatic' && playerId && !loading" class="mt-4 space-y-4">`);
  });

  it('Manual (with an account) and Single run get their h1 from App; Science’s check and submit pages too', () => {
    const own = [...template.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(m => m[0]);
    expect(own).toHaveLength(3);
    expect(own[0]).toContain(`v-if="plannerTab === 'manual' && playerId"`);
    expect(own[0]).toContain('{{ NAMES.manual }}');
    expect(template.indexOf(own[0])).toBeGreaterThan(template.indexOf('<main'));
    expect(own[1]).toContain('{{ NAMES.classic }}');
    expect(template.lastIndexOf(`<template v-if="autoView === 'classic'">`, template.indexOf(own[1]))).toBeGreaterThan(-1);
    expect(own[2]).toContain('Help check the planner');
  });

  it('a running search is said by one status line, always mounted, not by the run bar itself', () => {
    expect(template.match(/<RunAnnouncer \/>/g)).toHaveLength(1);
    expect(template.indexOf('<RunAnnouncer')).toBeGreaterThan(template.indexOf('<main'));
    const bar = fs.readFileSync(path.resolve(__dirname, 'components/auto/RunProgressBar.vue'), 'utf8');
    const barTag = bar.slice(bar.indexOf('data-run-bar'), bar.indexOf('>', bar.indexOf('data-run-bar')));
    expect(barTag).not.toContain('aria-live');
    expect(barTag).not.toContain('role="status"');
  });
});

describe('the status lines', () => {
  it('RunAnnouncer renders a visually hidden polite status, empty with no search', async () => {
    const html = await renderHtml(RunAnnouncer, {}, {}, [pinia]);
    expect(html).toMatch(/<p class="sr-only" role="status" aria-live="polite" data-testid="run-live"><\/p>/);
  });
  it("the instant card has its own hidden status line, fed by the instant answer's state", () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'components/auto/InstantRoute.vue'), 'utf8');
    expect(src).toContain('<p class="sr-only" role="status" aria-live="polite" data-testid="instant-live">{{ instantLive }}</p>');
    expect(src).toContain('const instantLive = computed(() => instantLiveText(status.value, !!result.value));');
  });
});
