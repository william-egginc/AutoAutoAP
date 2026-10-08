import { describe, expect, it } from 'vitest';
import { createShareExtras, CSV_KEY, DIAGNOSTICS_DEFAULT_KEY } from './useShareExtras';

function mem(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

describe('share extras', () => {
  it('round-trips the diagnostics default through localStorage', () => {
    const ls = fakeLocalStorage();
    createShareExtras(ls).diagnosticsByDefault.value = true;
    const b = createShareExtras(ls);
    expect(b.diagnosticsByDefault.value).toBe(true);
    expect(b.sendDiagnostics.value).toBe(true);
    b.diagnosticsByDefault.value = false;
    const c = createShareExtras(ls);
    expect(c.diagnosticsByDefault.value).toBe(false);
    expect(c.sendDiagnostics.value).toBe(false);
  });

  it('unticking diagnostics for one run leaves the saved default alone', () => {
    const ls = fakeLocalStorage();
    createShareExtras(ls).diagnosticsByDefault.value = true;
    const b = createShareExtras(ls);
    b.sendDiagnostics.value = false;
    expect(createShareExtras(ls).diagnosticsByDefault.value).toBe(true);
    b.sendDiagnostics.value = true;
    expect(createShareExtras(ls).diagnosticsByDefault.value).toBe(true);
  });

  it('starts with the CSV ticked and diagnostics unticked', () => {
    const x = createShareExtras(mem());
    expect(x.sendCsv.value).toBe(true);
    expect(x.sendDiagnostics.value).toBe(false);
    expect(x.diagnosticsByDefault.value).toBe(false);
  });

  it('remembers an unticked CSV per browser', () => {
    const st = mem();
    createShareExtras(st).sendCsv.value = false;
    expect(st.map.get(CSV_KEY)).toBe('0');
    expect(createShareExtras(st).sendCsv.value).toBe(false);
  });

  it('starts diagnostics ticked only when "from now on" was ticked', () => {
    const st = mem();
    const a = createShareExtras(st);
    a.sendDiagnostics.value = true;
    expect(createShareExtras(st).sendDiagnostics.value).toBe(false);
    a.diagnosticsByDefault.value = true;
    expect(st.map.get(DIAGNOSTICS_DEFAULT_KEY)).toBe('1');
    expect(createShareExtras(st).sendDiagnostics.value).toBe(true);
  });

  it('diagnostics do not depend on the CSV box', () => {
    const x = createShareExtras(mem());
    x.sendDiagnostics.value = true;
    expect(x.diagnosticsGo.value).toBe(true);
    x.sendCsv.value = false;
    expect(x.diagnosticsGo.value).toBe(true);
  });

  it('survives storage that throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const x = createShareExtras(bad);
    x.sendCsv.value = false;
    expect(x.sendCsv.value).toBe(false);
  });
});
