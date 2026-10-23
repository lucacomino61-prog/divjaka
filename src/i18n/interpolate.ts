export type Vars = Record<string, string | number>;

/** "{n} netë" + {n: 2} → "2 netë". Unknown placeholders stay as written. */
export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
