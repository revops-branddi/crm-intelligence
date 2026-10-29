import { parentPort, workerData } from 'node:worker_threads';
import { unzipSync, strFromU8 } from 'fflate';
import { convert } from 'html-to-text';
import { spreadsheetText } from './spreadsheet.js';
const buffer = Buffer.from(workerData.buffer);
try {
  let text;
  if (workerData.format === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { isEvalSupported: false });
    try {
      text = (await extractText(pdf, { mergePages: true })).text;
    } finally {
      await pdf.loadingTask.destroy();
    }
  } else if (workerData.format === 'xlsx') {
    text = spreadsheetText(buffer);
  } else {
    let expanded = 0;
    const entries = unzipSync(buffer, {
      filter: (entry) => {
        if (
          !/^word\/(document|footnotes|endnotes|comments|header\d*|footer\d*)\.xml$/.test(
            entry.name,
          )
        )
          return false;
        expanded += entry.originalSize;
        if (expanded > 16 * 1024 * 1024)
          throw new Error('Arquivo expandido excede o limite de leitura.');
        return true;
      },
    });
    if (!entries['word/document.xml']) throw new Error('Documento sem conteúdo legível.');
    text = Object.entries(entries)
      .map(
        ([name, bytes]) =>
          `${name}\n${convert(
            strFromU8(bytes)
              .replace(/<w:(p|br|tab)(?:\s[^>]*)?\/?\s*>/g, '\n')
              .replace(/<\/w:p>/g, '\n'),
            { wordwrap: false },
          )}`,
      )
      .join('\n\n');
  }
  if (text.length > 4_000_000) throw new Error('Texto extraído excede o limite de processamento.');
  parentPort.postMessage({ text });
} catch {
  parentPort.postMessage({ error: 'Não foi possível interpretar o arquivo; original preservado.' });
}
