/**
 * The routes "When should I start?" offers (StartTimeCard.vue): the instant answer's lead route first
 * (the default), the other routes it lists, the last search's best when there is one, and a route a
 * link asked for. Each route once.
 */
export interface StartTimeChoice {
  key: string;
  label: string;
  chain: number[];
}

const plural = (n: number) => `${n} ascension${n === 1 ? '' : 's'}`;

export function startTimeChoices(o: {
  instant: readonly (readonly number[])[];
  search?: readonly number[] | null;
  requested?: readonly number[] | null;
}): StartTimeChoice[] {
  const out: StartTimeChoice[] = [];
  const add = (chain: readonly number[], label: string) => {
    const key = chain.join(',');
    if (chain.length && !out.some(c => c.key === key)) out.push({ key, label, chain: [...chain] });
  };
  o.instant.forEach((c, i) =>
    add(c, `${i === 0 ? "Instant answer's best" : 'Instant answer'}: ${c.join(' ')} (${plural(c.length)})`)
  );
  if (o.search?.length) add(o.search, `Your search's best: ${o.search.join(' ')}`);
  if (o.requested?.length) add(o.requested, `This route: ${o.requested.join(' ')}`);
  return out;
}
