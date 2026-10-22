/**
 * The plan start and timezone, set up the same way whichever Auto Planner screen the page opens on.
 *
 * WHY IT MOVED HERE. This lived in AutomaticPlanner's setup: restore the start and timezone saved on
 * the last visit, default the timezone, then default the start to the save (useBackupPlanStart).
 * With every screen on one page that was fine, since the Auto Planner was always mounted. With the
 * screens on tabs (the unified layout), a link straight to Fastest route or Highest TE by a date
 * never mounted it, so a search there planned from "now" in the browser's zone instead of from the
 * start the player had set -- and Your setup's date box, mounted before the planner's restore ran,
 * showed nothing (v-model writes an input's first value after the render, from the value it had
 * when it rendered, so a store change in between is undone on screen).
 *
 * Called from App.vue's own setup, before any screen: Your setup and the search panels are separate
 * chunks that load in either order, and a panel that set the default first (useBackupPlanStart,
 * which then counts as taken) let a stale cached start from an earlier visit be restored over it
 * (review, 30 Sept). The restore runs once per page load: after that the store is the truth.
 * Changes are saved into the same cache from here too, because the planner that used to save them
 * is only mounted on Classic.
 *
 * START-TIME OVERRIDE (Joo's fcc9e764, ported 22 Oct 2026). A saved start only comes back when the player
 * set it themselves (`startTimeOverride`); otherwise the plan starts now, defaulted from the save as
 * before (useBackupPlanStart). Before this a reload brought back whatever start the last visit held,
 * so the same save could open on today's time or on a start hours or days old, depending on whether the
 * page had been opened before. Caches written before the flag existed count as "now". The timezone is
 * still restored: it moves no instant on its own, and the hours and time off are shown in it.
 */
import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useVirtueStore } from '@/stores/virtue';
import { loadAutoPlannerSchedule, patchAutoPlannerSchedule } from '@/lib/autoPlannerFormCache';
import { planStartOwner, setPlanStartOwner, useBackupPlanStart } from '@/composables/useBackupPlanStart';

let restored = false;

/** Testing hook: forget that the saved form was restored. Not used by the app. */
export function resetPlanStartForm(): void {
  restored = false;
}

export function usePlanStartForm(): void {
  const planner = useAutoPlannerStore();
  const { timezone, startDate, startTime, startTimeOverride } = storeToRefs(planner);

  if (!restored) {
    restored = true;
    const cached = loadAutoPlannerSchedule();
    if (cached?.timezone) timezone.value = cached.timezone;
    if (cached?.startTimeOverride === true && cached.startDate && cached.startTime) {
      startTimeOverride.value = true;
      startDate.value = cached.startDate;
      startTime.value = cached.startTime;
      // Whose start it is: another account's save drops it (useBackupPlanStart).
      setPlanStartOwner(cached.startAccount);
    }
  }
  if (!timezone.value) {
    timezone.value = useVirtueStore().ascensionTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  useBackupPlanStart();

  watch([timezone, startDate, startTime, startTimeOverride], ([tz, date, time, override]) =>
    patchAutoPlannerSchedule({
      timezone: tz,
      startDate: date,
      startTime: time,
      startTimeOverride: override,
      startAccount: planStartOwner(),
    })
  );
}
