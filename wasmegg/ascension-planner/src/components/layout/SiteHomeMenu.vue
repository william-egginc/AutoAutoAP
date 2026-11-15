<!--
  HOME AND THE SITE MENU (UX review H1, Jordan 13 Nov 2026: "make the Tabs a little bit bigger to replace the header"):
  the dark top bar (ui/components/NavBar.vue) is no longer mounted; its two jobs live at the left end of the tab row
  (above it on a phone, App.vue). Home goes to the wasmegg home, the menu opens the shared sidebar of the other tools
  (ui/components/NavBarSidebar.vue, imported, not edited). Absolute links, as the bar had (App.navLinks.spec.ts): the
  planner is served alone, so a site-relative link would 404. 44 px buttons in the tabs' style.
-->
<template>
  <div class="flex flex-none items-center gap-2" data-testid="site-home-menu">
    <a
      href="https://wasmegg-carpet.netlify.app/"
      class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      aria-label="Home"
      title="Home"
      data-testid="site-home"
    >
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
    </a>
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      aria-label="Open the site menu"
      title="Related links"
      data-testid="site-menu"
      @click="open = true"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  </div>
  <NavBarSidebar v-model:open="open" active-entry-id="ascension-planner" use-absolute-urls />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import NavBarSidebar from 'ui/components/NavBarSidebar.vue';

const open = ref(false);
</script>
