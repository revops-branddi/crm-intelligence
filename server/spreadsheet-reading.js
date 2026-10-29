import { createHash } from 'node:crypto';
import { extractAttachment } from './attachments.js';
import { checked, HttpError } from './errors.js';

export const SPREADSHEET_READER_VERSION = 'xlsx-cells-v1';
export function spreadsheetInventory(pages) {
  const files = pages.filter((p) => p.kind === 'files').flatMap((p) => p.payload?.data || []);
  return files
    .filter((f) => /\.xlsx$/i.test(f.name || f.file_name || ''))
    .map((file) => {
      const original = pages.find(
        (p) => p.kind === 'attachment' && String(p.payload?.data?.fileId) === String(file.id),
      );
      const derived = pages.find(
        (p) =>
          p.kind === 'attachmentText' &&
          String(p.payload?.data?.fileId) === String(file.id) &&
          p.payload.data.readerVersion === SPREADSHEET_READER_VERSION,
      );
      const data = (derived || original)?.payload?.data;
      return {
        id: String(file.id),
        name: file.name || file.file_name,
        date: file.add_time,
        status: data?.textStatus || 'pending',
        characters: data?.text?.length || 0,
        taskKey: original?.task_key,
        readerVersion: data?.readerVersion,
        note: data?.note || '',
      };
    });
}

// Derived text is appended as a versioned record. Original bytes and original
// extraction responses stay immutable, including citations of past briefings.
export async function readSavedSpreadsheets(db, snapshot, pages) {
  const eligible = spreadsheetInventory(pages).filter(
    (f) => f.taskKey && f.status !== 'readable' && f.readerVersion !== SPREADSHEET_READER_VERSION,
  );
  const deadline = Date.now() + 20000;
  let processed = 0;
  for (const file of eligible.slice(0, 10)) {
    if (Date.now() > deadline) break;
    const original = pages.find((p) => p.task_key === file.taskKey).payload.data;
    if (!original.storagePath || original.bytes > 20 * 1024 * 1024) continue;
    const { data: blob, error } = await db.storage
      .from('crm-originals')
      .download(original.storagePath);
    if (error || !blob)
      throw new HttpError(
        503,
        'Não foi possível ler a planilha preservada. Tente novamente.',
        'storage_unavailable',
      );
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (createHash('sha256').update(buffer).digest('hex') !== original.sha256)
      throw new HttpError(
        409,
        'A integridade do arquivo preservado não foi confirmada.',
        'invalid_attachment',
      );
    const extracted = await extractAttachment(buffer, original.mime, file.name);
    const taskKey = createHash('sha256')
      .update(`${file.taskKey}:${SPREADSHEET_READER_VERSION}`)
      .digest('hex');
    const page = {
      snapshot_id: snapshot.id,
      task_key: taskKey,
      kind: 'attachmentText',
      request: { originalTaskKey: file.taskKey, readerVersion: SPREADSHEET_READER_VERSION },
      payload: {
        data: {
          ...original,
          ...extracted,
          name: file.name,
          add_time: file.date,
          readerVersion: SPREADSHEET_READER_VERSION,
        },
      },
      failure: null,
    };
    const result = await db.from('crm_raw_pages').insert(page);
    if (result.error?.code !== '23505') checked(result);
    pages.push(page);
    processed++;
  }
  return {
    files: spreadsheetInventory(pages),
    processed,
    remaining: Math.max(0, eligible.length - processed),
  };
}
