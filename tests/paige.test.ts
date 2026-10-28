import { test, expect } from 'bun:test';
import type { SpindleAPI } from 'lumiverse-spindle-types';
import { setupBackend } from '../src/backend';

/** Paige shares looks, reads paige.start, and LumiCast puts each finished sheet into Lumi Studio. */
function host(options: { connection?: string; studio?: boolean } = {}) {
  const synced = new Map<string, unknown>(); const handlers = new Map<string, (ctx: { requesterExtensionId: string }) => unknown>();
  const added: unknown[] = []; const generations: { userId?: string }[] = [];
  const storage = new Map<string, unknown>([['u7:settings.json', { connectionId: options.connection ?? 'c1', thinking: 'off' }]]);
  let cast: unknown;
  const api = {
    permissions: { has: () => true },
    on: () => () => {},
    onFrontendMessage: () => () => {},
    sendToFrontend: () => {},
    userStorage: { getJson: async (path: string, o: { fallback: unknown; userId?: string }) => storage.get(`${o.userId}:${path}`) ?? o.fallback, setJson: async () => {} },
    connections: { get: async (id: string) => id === 'c1' ? { id, name: 'Fast', provider: 'openrouter', model: 'test/generative' } : null, list: async () => [] },
    cors: async (url: string) => { const q = new URL(url).searchParams; const list = q.get('search[name_comma]')?.split(','); return { status: 200, body: JSON.stringify(url.includes('/tags.json') ? (list ?? [q.get('search[name]') ?? 'red_hair']).map(name => ({ name, category: 0, post_count: 100 })) : []) }; },
    generate: { raw: async (input: { messages: { content: string }[]; userId?: string }) => {
      generations.push(input);
      return { content: JSON.stringify(input.messages[0].content.includes('one trait per visual fact') ? { traits: [{ id: 't1', group: 'hair', evidence: 'Red hair.', tags: ['red_hair'], detail: 'Red hair' }] } : { drop: [], captions: { character: 'Red hair.' }, sheet: { subject: 'dockworker', character: [], outfit: [], anatomy: [] }, issues: [] }), finish_reason: 'stop' };
    } },
    rpcPool: {
      sync: (endpoint: string, value: unknown) => { synced.set(endpoint, structuredClone(value)); return `lumicast.${endpoint}`; },
      handle: (endpoint: string, fn: (ctx: { requesterExtensionId: string }) => unknown) => { handlers.set(endpoint, fn); return `lumicast.${endpoint}`; },
      read: async (endpoint: string) => {
        if (endpoint === 'paige.cast') { if (!cast) throw new Error('no value'); return cast; }
        if (endpoint === 'lumidraw_studio.lumicast.add') {
          if (options.studio === false) throw new Error('Shared RPC endpoint "lumidraw_studio.lumicast.add" is not registered');
          const sheet = synced.get('paige.sheet') as { name: string }; added.push(sheet); return sheet.name === 'Wes' ? { ok: true, updated: false, name: 'Wes 2', clashWith: 'Wes' } : { ok: true, updated: false, name: sheet.name };
        }
        throw new Error('no value');
      },
    },
  } as unknown as SpindleAPI;
  const stop = setupBackend(api);
  const share = (characters: unknown[]) => { cast = { version: 1, sessionId: 'sess1', userId: 'u7', card: 'Port Hesk', characters }; };
  const finished = async () => { for (let i = 0; i < 500; i++) { const s = synced.get('paige.status') as { running?: boolean } | undefined; if (s && !s.running) return s; await new Promise(r => setTimeout(r, 5)); } throw new Error('never finished'); };
  return { handlers, share, finished, added, generations, stop };
}

test('Paige looks become Lumi Studio characters, one by one', async () => {
  const h = host();
  h.share([{ name: 'Jory Kett', aliases: ['JK'], kind: 'character', description: 'Jory Kett — appearance:\nRed hair.' }, { name: 'Wes', aliases: [], kind: 'persona', description: 'Wes — appearance:\nRed hair.' }]);
  expect(h.handlers.has('paige.start')).toBe(true);
  expect(await h.handlers.get('paige.start')!({ requesterExtensionId: 'paige' })).toEqual({ ok: true, count: 2 });
  const status = await h.finished() as { done: number; total: number; sessionId: string; finished: { name: string; ok: boolean }[] };
  expect(status).toMatchObject({ done: 2, total: 2, sessionId: 'sess1' });
  expect(status.finished.map(f => [f.name, f.ok])).toEqual([['Jory Kett', true], ['Wes', true]]);
  expect((status.finished as unknown as { message: string }[])[1].message).toBe('saved as “Wes 2” because Lumi Studio already had a Wes; give one of them a new name there');
  const sheets = h.added as { name: string; kind: string; aliases: string[]; userId: string; sheet: { appearance: string; subject: string } }[];
  expect(sheets.map(s => [s.name, s.kind])).toEqual([['Jory Kett', 'character'], ['Wes', 'persona']]);
  expect(sheets[0].sheet.appearance).toContain('red hair');
  expect(sheets[0].aliases).toEqual(['JK']);
  // The user's own connection and settings were used.
  expect(h.generations.every(g => g.userId === 'u7')).toBe(true);
  h.stop();
});

test('only Paige can start it, and plain reasons come back', async () => {
  const h = host({ connection: '' });
  expect(await h.handlers.get('paige.start')!({ requesterExtensionId: 'someone_else' })).toMatchObject({ ok: false });
  expect(await h.handlers.get('paige.start')!({ requesterExtensionId: 'paige' })).toMatchObject({ ok: false, message: 'Paige has not shared any looks yet.' });
  h.share([{ name: 'Ivy', kind: 'character', description: 'Ivy — appearance:\nRed hair.' }]);
  expect(await h.handlers.get('paige.start')!({ requesterExtensionId: 'paige' })).toMatchObject({ ok: false, message: expect.stringContaining('Pick a connection in LumiCast') });
  h.stop();
});

test('without Lumi Studio, each look says why', async () => {
  const h = host({ studio: false });
  h.share([{ name: 'Ivy', kind: 'character', description: 'Ivy — appearance:\nRed hair.' }]);
  await h.handlers.get('paige.start')!({ requesterExtensionId: 'paige' });
  const status = await h.finished() as { finished: { name: string; ok: boolean; message: string }[] };
  expect(status.finished[0]).toEqual({ name: 'Ivy', ok: false, message: 'Lumi Studio is missing or too old; update it' });
  h.stop();
});
