import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { convert } from 'html-to-text';
import { HttpError } from './errors.js';

export async function extractAttachment(buffer, mime, name) {
  const extension = name.toLowerCase().split('.').at(-1);
  if (
    /^text\//.test(mime) ||
    ['txt', 'csv', 'tsv', 'json', 'xml', 'html', 'md'].includes(extension)
  ) {
    const text = buffer.toString('utf8');
    return {
      text:
        mime.includes('html') || extension === 'html' ? convert(text, { wordwrap: false }) : text,
      textStatus: 'readable',
    };
  }
  const format =
    mime === 'application/pdf' || extension === 'pdf'
      ? 'pdf'
      : extension === 'xlsx' ||
          mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ? 'xlsx'
        : extension === 'docx'
          ? 'docx'
          : null;
  if (!format)
    return {
      text: '',
      textStatus: 'unsupported',
      note: 'Original preservado. Este formato requer leitura manual ou um extrator adicional (incluindo OCR para imagens).',
    };
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./attachment-worker.js', import.meta.url), {
      workerData: { buffer, format },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish({
          text: '',
          textStatus: 'unreadable',
          note: 'Limite de leitura atingido; original preservado.',
        }),
      15000,
    );
    worker.once('message', (result) =>
      finish(
        result.error
          ? { text: '', textStatus: 'unreadable', note: result.error }
          : {
              text: result.text,
              textStatus: result.text.trim() ? 'readable' : 'needs_ocr',
              note: result.text.trim()
                ? ''
                : 'Sem texto legível; pode exigir OCR. Original preservado.',
            },
      ),
    );
    worker.once('error', () =>
      finish({
        text: '',
        textStatus: 'unreadable',
        note: 'Falha no extrator; original preservado.',
      }),
    );
    worker.once('exit', () =>
      finish({
        text: '',
        textStatus: 'unreadable',
        note: 'Extrator encerrado; original preservado.',
      }),
    );
  });
}
export async function collectAttachment(task, snapshot, client, db) {
  const { buffer, mime } = await client.download(task.fileId);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const path = `${snapshot.user_id}/${snapshot.id}/${task.fileId}/${sha256}`;
  const { error } = await db.storage
    .from('crm-originals')
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (error && String(error.statusCode) !== '409' && error.code !== 'Duplicate')
    throw new HttpError(
      503,
      'Não foi possível preservar o anexo. A coleta pode ser retomada.',
      'storage_unavailable',
    );
  const extracted = await extractAttachment(buffer, mime, task.name);
  return {
    success: true,
    data: {
      fileId: task.fileId,
      name: task.name,
      mime,
      bytes: buffer.length,
      sha256,
      storagePath: path,
      ...extracted,
    },
  };
}
