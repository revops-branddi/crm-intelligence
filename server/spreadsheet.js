import { unzipSync, strFromU8 } from 'fflate';
import path from 'node:path';

const decode = (value = '') =>
  value.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (all, code, name) => {
    if (code) {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd';
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name.toLowerCase()];
  });
const attributes = (text) =>
  Object.fromEntries(
    [...text.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)].map((m) => [m[1], decode(m[3])]),
  );
const tags = (xml, name) => [
  ...xml.matchAll(new RegExp(`<${name}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${name}>)`, 'g')),
];
const plain = (text = '') => decode(text.replace(/<[^>]+>/g, '')).replace(/[\r\n\t]+/g, ' ');

// Read saved cell values only. Formulas, macros, links and external connections
// are never executed. Size and time limits also apply in the isolated worker.
export function spreadsheetText(buffer) {
  let expanded = 0;
  const entries = unzipSync(buffer, {
    filter(entry) {
      if (
        !/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/sheet\d+\.xml)$/.test(
          entry.name,
        )
      )
        return false;
      expanded += entry.originalSize;
      if (expanded > 32 * 1024 * 1024) throw new Error('Planilha expandida excede o limite.');
      return true;
    },
  });
  const xml = (name) => {
    const text = entries[name] ? strFromU8(entries[name]) : '';
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Entidades XML não permitidas.');
    return text;
  };
  const workbook = xml('xl/workbook.xml');
  if (!workbook) throw new Error('Planilha sem workbook.');
  const relationships = new Map(
    tags(xml('xl/_rels/workbook.xml.rels'), 'Relationship').map((m) => {
      const a = attributes(m[1]);
      return [
        a.Id,
        a.TargetMode === 'External'
          ? ''
          : path.posix.normalize(a.Target?.startsWith('/') ? a.Target.slice(1) : `xl/${a.Target}`),
      ];
    }),
  );
  const strings = tags(xml('xl/sharedStrings.xml'), 'si').map((m) =>
    tags(m[2] || '', 't')
      .map((t) => plain(t[2]))
      .join(''),
  );
  const styles = xml('xl/styles.xml');
  const formats = new Map(
    tags(styles, 'numFmt').map((m) => {
      const a = attributes(m[1]);
      return [Number(a.numFmtId), a.formatCode];
    }),
  );
  const cellStyles = tags(tags(styles, 'cellXfs')[0]?.[2] || '', 'xf').map((m) =>
    Number(attributes(m[1]).numFmtId),
  );
  const date1904 = /date1904=["'](?:1|true)["']/.test(workbook);
  function numeric(value, style) {
    if (!value || !Number.isFinite(Number(value))) return value;
    const id = cellStyles[Number(style)] || 0;
    const format = formats.get(id);
    const normalized = (format || '').replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
    const isDate = (id >= 14 && id <= 22) || /[yd]/i.test(normalized);
    if (isDate) {
      const serial = Number(value);
      const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
      const millis = epoch + (serial + (!date1904 && serial < 60 ? 1 : 0)) * 86400000;
      if (!Number.isFinite(millis) || Math.abs(millis) > 8.64e15)
        return `${value} [data Excel fora do intervalo]`;
      return `${new Date(Math.round(millis))
        .toISOString()
        .replace('T', ' ')
        .replace(/\.000Z$/, '')} [sem fuso; serial Excel ${value}]`;
    }
    if (format && format !== 'General') return `${value} [formato: ${format}]`;
    if (id === 9 || id === 10) return `${Number(value) * 100}% [valor ${value}]`;
    return value;
  }
  const sheets = tags(workbook, 'sheet');
  if (!sheets.length || sheets.length > 100) throw new Error('Quantidade de abas não suportada.');
  const lines = [
    'Planilha XLSX: valores preservados por aba e célula. Fórmulas usam o resultado salvo no arquivo, sem recálculo.',
  ];
  let characters = lines[0].length,
    cells = 0;
  const summaryFirst = [...sheets].sort(
    (a, b) =>
      Number(/summary|resumo|sumario|evid[eê]ncia/i.test(attributes(b[1]).name || '')) -
      Number(/summary|resumo|sumario|evid[eê]ncia/i.test(attributes(a[1]).name || '')),
  );
  for (const sheet of summaryFirst) {
    const attrs = attributes(sheet[1]);
    const target = relationships.get(attrs['r:id']);
    if (!target || !/^xl\/worksheets\/sheet\d+\.xml$/.test(target) || !entries[target])
      throw new Error('Aba sem conteúdo disponível.');
    const name = attrs.name || 'Sem nome';
    lines.push(
      `Aba: ${name}${attrs.state && attrs.state !== 'visible' ? ' (oculta no arquivo)' : ''}`,
    );
    for (const cell of tags(xml(target), 'c')) {
      if (++cells > 200000) throw new Error('Planilha excede o limite de células.');
      const a = attributes(cell[1]);
      const body = cell[2] || '';
      const raw = tags(body, 'v')[0]?.[2];
      const formula = tags(body, 'f')[0]?.[2];
      let value =
        a.t === 'inlineStr'
          ? tags(body, 't')
              .map((t) => plain(t[2]))
              .join('')
          : a.t === 's'
            ? strings[Number(raw)]
            : a.t === 'b'
              ? raw === '1'
                ? 'verdadeiro'
                : 'falso'
              : plain(raw);
      if ((!a.t || a.t === 'n') && value) value = numeric(value, a.s);
      if (a.t === 's' && value === undefined) throw new Error('Texto compartilhado ausente.');
      if (formula !== undefined)
        value = `${value || 'resultado não salvo'} [fórmula: ${plain(formula)}; sem recálculo]`;
      if (!value) continue;
      const line = `${name}!${a.r || '?'}: ${value}`;
      characters += line.length + 1;
      if (characters > 4_000_000) throw new Error('Texto da planilha excede o limite.');
      lines.push(line);
    }
  }
  return lines.join('\n');
}
