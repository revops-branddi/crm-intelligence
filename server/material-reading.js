import { createHash } from 'node:crypto';
import { buildSources } from './sources.js';
import { dealMaterials } from './materials.js';
import { readMaterial } from './material-reader.js';
import { checked } from './errors.js';

// Public material reads are versioned evidence, separate from the CRM response.
// The existing reader enforces permitted hosts, DNS pinning and bounded reads.
export async function readSavedMaterials(db, snapshot, pages, reader = readMaterial) {
  const materials = dealMaterials(buildSources(pages)).materials.slice(0, 8);
  const results = await Promise.all(
    materials.map(async (material) => {
      const existing = pages.find(
        (p) =>
          p.kind === 'materialText' &&
          p.payload?.data?.url === material.url &&
          Date.now() - Date.parse(p.payload.data.readAt) < 15 * 60 * 1000,
      );
      if (existing) return null;
      const readAt = new Date().toISOString();
      let data;
      try {
        const result = await reader(material.url);
        data = {
          name: material.title,
          url: material.url,
          readAt,
          textStatus: 'readable',
          text: result.text,
          recordedSource: material.sourceId,
        };
      } catch (error) {
        data = {
          name: material.title,
          url: material.url,
          readAt,
          textStatus: 'unreadable',
          text: '',
          note:
            error.code === 'restricted'
              ? 'Acesso restrito; conteúdo não consultado.'
              : 'Não foi possível ler este material; revisão manual necessária.',
          recordedSource: material.sourceId,
        };
      }
      const taskKey = createHash('sha256').update(JSON.stringify(data)).digest('hex');
      const page = {
        snapshot_id: snapshot.id,
        task_key: taskKey,
        kind: 'materialText',
        request: { url: material.url, readerVersion: 'public-material-v1' },
        payload: { data },
        failure: null,
      };
      checked(await db.from('crm_raw_pages').insert(page));
      return page;
    }),
  );
  pages.push(...results.filter(Boolean));
}
