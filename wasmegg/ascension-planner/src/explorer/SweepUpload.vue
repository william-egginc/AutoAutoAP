<!--
  Upload a finished sweep from its two files: the chain CSV and the diagnostics JSON.

  Everything is read and checked in the browser before anything is sent, and what WILL be sent is
  shown in full before the button is live. The checks are in upload.ts; this is the form around
  them. The one thing asked for that the files cannot answer is the machine: cores are guessable
  from this browser (but this may not be the machine that ran it), RAM is not -- browsers cap what
  they report at 8 GB -- so both are typed.
-->
<template>
  <div class="space-y-4">
    <div class="space-y-1.5">
      <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
        The two files from the planner's Insane panel
      </label>
      <input
        type="file"
        multiple
        accept=".csv,.gz,.json,application/json,text/csv,application/gzip"
        class="block w-full text-[11px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:text-white"
        @change="onFiles"
      />
      <p class="text-[10px] text-slate-400">
        <b>chain-search-*.csv</b> (or a .csv.gz) and <b>chain-search-diagnostics-*.json</b>, from the two download
        buttons under the results. Pick both at once.
      </p>
      <p class="text-[10px] font-semibold text-slate-500">
        CSV: {{ csvName || '—' }} · diagnostics: {{ diagName || '—' }}
      </p>
    </div>

    <p v-if="readError" class="rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{{ readError }}</p>

    <template v-if="csv && diag && check">
      <div class="grid gap-2 sm:grid-cols-3 text-[11px]">
        <div class="rounded-lg bg-slate-50 px-3 py-2">
          <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Run</div>
          <div class="font-bold text-slate-800">{{ csv.currentTE }} → {{ csv.finalTE }} TE</div>
          <div class="text-slate-500">
            best {{ csv.best?.chain.join(' ') }} · {{ csv.best?.days.toFixed(2) }} d · {{ csv.chainsFound.toLocaleString() }}
            chains
          </div>
        </div>
        <div class="rounded-lg bg-slate-50 px-3 py-2">
          <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Plan start</div>
          <div class="font-bold text-slate-800">{{ preview?.startLocal }} ({{ preview?.startWeekday }})</div>
          <div class="text-slate-500">{{ csv.timezone }} · backup {{ preview?.backupAgeHours ?? '?' }} h old</div>
        </div>
        <div class="rounded-lg bg-slate-50 px-3 py-2">
          <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Gear</div>
          <div class="font-bold text-slate-800">
            delivery {{ preview?.deliveryScore ? (preview.deliveryScore.score * 100).toFixed(1) + '%' : '—' }} · Clothed TE
            {{ preview?.clothedTE ?? '—' }}
          </div>
          <div class="text-slate-500">
            final leg {{ check.rate ? `${check.rate.measuredQph.toFixed(2)} of ~${check.rate.expectedQph.toFixed(2)} q/hr` : 'not checkable' }}
          </div>
        </div>
      </div>

      <ul v-if="check.errors.length" class="space-y-1 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
        <li v-for="e in check.errors" :key="e">✕ {{ e }}</li>
      </ul>
      <ul v-if="check.warnings.length" class="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
        <li v-for="w in check.warnings" :key="w">! {{ w }}</li>
      </ul>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="space-y-1">
          <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Which sweep</span>
          <select v-model="presetId" class="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]">
            <option v-for="p in SWEEP_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </label>
        <label class="space-y-1">
          <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Bands as typed</span>
          <input v-model="bands" class="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-[12px]" />
        </label>
        <label class="space-y-1">
          <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Minimum gap</span>
          <input v-model.number="minGap" type="number" min="0" class="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]" />
        </label>
        <label class="space-y-1">
          <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nickname (optional)</span>
          <input v-model="nickname" maxlength="40" class="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]" />
        </label>
        <label class="space-y-1">
          <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
            CPU threads on the machine that ran it
          </span>
          <input v-model.number="cores" type="number" min="1" class="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]" />
        </label>
        <label class="space-y-1">
          <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">RAM, GB</span>
          <input
            v-model.number="ramGB"
            type="number"
            min="1"
            placeholder="browsers can't tell us this"
            class="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]"
          />
        </label>
        <label class="space-y-1">
          <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Workers (jobs) the run used</span>
          <input v-model.number="workers" type="number" min="1" class="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]" />
        </label>
      </div>

      <details class="text-[11px] text-slate-500">
        <summary class="cursor-pointer font-bold">Exactly what gets sent</summary>
        <p class="mt-1">
          This record, plus the CSV (compressed, player ids swept out). No player id and no in-game name: those are in
          neither. The artifact set and time zone do narrow down who you are among people who know each other.
        </p>
        <pre class="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] text-slate-100">{{ previewJson }}</pre>
      </details>

      <div class="flex items-center gap-3">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white disabled:opacity-40"
          :disabled="!!check.errors.length || sending || sent"
          @click="send"
        >
          {{ sending ? 'Sending…' : sent ? 'Sent' : 'Submit this sweep' }}
        </button>
        <span v-if="sendMessage" class="text-[11px] font-semibold" :class="sendOk ? 'text-emerald-700' : 'text-rose-700'">
          {{ sendMessage }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { afterPaint, scrubIdentifiers, tooManySubmissionsMessage, type Submission } from '@/search/submission';
import type { CollectorRow } from './collector';
import { inflateIfGzip } from './collector';
import {
  SWEEP_PRESETS,
  buildUploadSubmission,
  checkUpload,
  readDiagnostics,
  readUploadCsv,
  type Diagnostics,
  type UploadCsv,
} from './upload';

const props = defineProps<{ base: string; rows: CollectorRow[] }>();
const emit = defineEmits<{ submitted: [id: string] }>();

const csvName = ref('');
const diagName = ref('');
const csvText = ref('');
const csv = shallowRef<UploadCsv | null>(null);
const diag = shallowRef<Diagnostics | null>(null);
const readError = ref('');

const presetId = ref('custom');
const bands = ref('');
const minGap = ref(10);
const nickname = ref('');
const cores = ref<number | undefined>(typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || undefined : undefined);
const ramGB = ref<number | undefined>();
const workers = ref<number | undefined>();

const sending = ref(false);
const sent = ref(false);
const sendMessage = ref('');
const sendOk = ref(false);

async function onFiles(e: Event): Promise<void> {
  const files = [...((e.target as HTMLInputElement).files ?? [])];
  readError.value = '';
  sent.value = false;
  sendMessage.value = '';
  try {
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (/\.json$/i.test(f.name)) {
        diag.value = readDiagnostics(new TextDecoder().decode(bytes));
        diagName.value = f.name;
      } else {
        let text: string;
        try {
          text = await inflateIfGzip(bytes);
        } catch {
          throw new Error(`${f.name} is a damaged gzip file: it ends before the data does. Download it again.`);
        }
        csv.value = readUploadCsv(text);
        csvText.value = text;
        csvName.value = f.name;
      }
    }
  } catch (err) {
    readError.value = err instanceof Error ? err.message : 'That file could not be read.';
  }
}

// Pick the preset that matches the run's ascension count, once, when a new CSV arrives.
watch(csv, c => {
  const n = c?.best?.chain.length ?? 0;
  const match = SWEEP_PRESETS.find(p => p.ascensions === n);
  presetId.value = match?.id ?? 'custom';
});
watch(presetId, id => {
  const p = SWEEP_PRESETS.find(x => x.id === id);
  if (p && p.id !== 'custom') {
    bands.value = p.bands;
    minGap.value = p.minGap;
  }
});

const check = computed(() => (csv.value && diag.value ? checkUpload(csv.value, diag.value, props.rows) : null));

const preview = computed<Submission | null>(() => {
  if (!csv.value || !diag.value || !check.value || !csv.value.best || !diag.value.schedule?.planStart) return null;
  return buildUploadSubmission(csv.value, diag.value, {
    nickname: nickname.value,
    sweep: {
      preset: presetId.value,
      ...(bands.value.trim() ? { bands: bands.value.trim() } : {}),
      ...(Number.isFinite(minGap.value) ? { minGap: minGap.value } : {}),
    },
    machine: { cores: cores.value, ramGB: ramGB.value, workers: workers.value },
  });
});

const previewJson = computed(() => (preview.value ? JSON.stringify(preview.value, null, 2) : ''));

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function send(): Promise<void> {
  // Clicks made while the page was busy arrive afterwards; each one would send another copy.
  if (sending.value || !preview.value || check.value?.errors.length) return;
  sending.value = true;
  sendOk.value = true;
  sendMessage.value = 'Preparing the upload…';
  try {
    // Let the button's "Sending…" reach the screen before scrubbing a multi-megabyte table.
    await afterPaint();
    const res = await fetch(`${props.base}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(preview.value),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      uploadToken?: string;
      problems?: string[];
      error?: string;
      retryAfter?: number;
    };
    if (res.status === 429) {
      sendOk.value = false;
      const msg = tooManySubmissionsMessage(body.retryAfter);
      sendMessage.value = msg.charAt(0).toUpperCase() + msg.slice(1);
      return;
    }
    if (!res.ok || !body.id) {
      sendOk.value = false;
      sendMessage.value = `The collector said ${res.status}${body.problems?.length ? `: ${body.problems.join('; ')}` : body.error ? `: ${body.error}` : ''}`;
      return;
    }
    if (!body.uploadToken) {
      // The collector signs a one-time token for the CSV; without one it would refuse the table.
      sent.value = true;
      sendOk.value = false;
      sendMessage.value = `Stored as ${body.id}, but this collector does not accept tables.`;
      emit('submitted', body.id);
      return;
    }
    const csvRes = await fetch(`${props.base}/csv?id=${encodeURIComponent(body.id)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/gzip', 'x-upload-token': body.uploadToken },
      body: await gzip(scrubIdentifiers(csvText.value)),
    });
    sent.value = true;
    sendOk.value = csvRes.ok;
    sendMessage.value = csvRes.ok
      ? `Stored as ${body.id}, with its table.`
      : `Stored as ${body.id}, but the table was refused (${csvRes.status}).`;
    emit('submitted', body.id);
  } catch (err) {
    sendOk.value = false;
    sendMessage.value = err instanceof Error ? err.message : 'Could not reach the collector.';
  } finally {
    sending.value = false;
  }
}
</script>
