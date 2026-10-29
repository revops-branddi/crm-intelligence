// Only list links explicitly recorded in deal fields. Existence of a URL is not
// evidence that a report is accessible, current, reviewed or sent.
export function dealMaterials(sources) {
  const materials = new Map();
  for (const source of sources.filter((item) => item.kind === 'deal'))
    for (const line of source.text.split('\n')) {
      if (
        !/relat[oó]rio|apresenta[çc][aã]o|link.*ppt|proposta|pescaria|monitoria|diagn[oó]stico/i.test(
          line,
        )
      )
        continue;
      for (const match of line.matchAll(/https?:\/\/[^\s<>"\]]+/g)) {
        const raw = match[0];
        let url;
        try {
          url = new URL(raw);
        } catch {
          continue;
        }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
        if (materials.has(url.href)) continue;
        materials.set(url.href, {
          title:
            line
              .slice(0, match.index)
              .replace(/^custom_fields\./, '')
              .replace(/[:\s]+$/, '') || 'Material registrado',
          url: url.href,
          sourceId: source.id,
          quote: line,
          date: source.date,
        });
      }
    }
  return { materials: [...materials.values()] };
}
