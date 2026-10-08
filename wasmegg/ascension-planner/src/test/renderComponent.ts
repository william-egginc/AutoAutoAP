/**
 * Component specs without a DOM library: render a component to HTML on the server and read its text.
 * Enough to check what a shared component shows for each screen's props and slots; behaviour lives in
 * composables, which have their own specs.
 */
import { createSSRApp, h, type Component, type Plugin } from 'vue';
import { renderToString } from 'vue/server-renderer';

export async function renderHtml(
  comp: Component,
  props: Record<string, unknown> = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slots: Record<string, (props: any) => unknown> = {},
  /** E.g. the test's pinia, for a component that reads a store. */
  plugins: Plugin[] = []
): Promise<string> {
  const app = createSSRApp({ render: () => h(comp, props, slots as never) });
  for (const p of plugins) app.use(p);
  return renderToString(app);
}

/** The visible text: tags dropped, entities for the few characters the components use decoded,
 *  whitespace collapsed. */
export function textOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
