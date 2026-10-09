<!--
  In place of "Carry on" when the unfinished run is still going in another tab or window of this
  browser (store `runElsewhere`, search/stepAway.ts `runAliveElsewhere`): carrying it on here would run
  the same search twice -- twice the workers and memory, both writing its checkpoint, and two final
  sends racing to replace the same best so far. Carry on comes back by itself once that tab is closed
  or has been quiet for two minutes.
-->
<template>
  <p class="text-[11px] font-bold leading-relaxed" data-testid="run-going-elsewhere" role="status">
    This run is still going in another tab or window. Switch to that one to see it; carrying it on here would run the
    same search twice. If that tab is closed or stops answering for 2 minutes, Carry on comes back here.
  </p>
</template>
