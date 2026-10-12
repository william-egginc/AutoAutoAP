<!--
  Three dots that cycle (. .. ...) after a word that is still going ("Searching", "Stopping"). CSS only
  (the user, 12 Oct, asked whether it costs memory or CPU): no timer, no Vue update per tick, just a
  stepped opacity animation the browser runs on its own. It doesn't run in a hidden tab (the browser
  draws no frames there), and with reduced motion the dots stay put.
-->
<template>
  <span class="animated-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
</template>

<style scoped>
.animated-dots span:nth-child(2) {
  animation: animated-dot-2 1.2s steps(1, end) infinite;
}
.animated-dots span:nth-child(3) {
  animation: animated-dot-3 1.2s steps(1, end) infinite;
}
@keyframes animated-dot-2 {
  0% {
    opacity: 0;
  }
  33.3% {
    opacity: 1;
  }
}
@keyframes animated-dot-3 {
  0% {
    opacity: 0;
  }
  66.6% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .animated-dots span {
    animation: none !important;
    opacity: 1 !important;
  }
}
</style>
