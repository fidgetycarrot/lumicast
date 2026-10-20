/** Identity groups describe the character in any scene; outfit and moment belong to one scene. */
export const GROUPS = ['subject','body','hair','face','anatomy','outfit','moment'] as const;
export type Group = typeof GROUPS[number];
/** character: body, hair and face only. outfit: plus clothing. scene: everything described. */
export type Scope = 'character' | 'outfit' | 'scene';
/** Each caption segment covers the groups its scope adds. */
/** Explicit anatomy shows only in images that show it, so like a moment it belongs to the scene, never to the saved look. */
export const segmentOf = (group: Group): Scope => group === 'moment' || group === 'anatomy' ? 'scene' : group === 'outfit' ? 'outfit' : 'character';
export const inScope = (group: Group, scope: Scope): boolean => scope === 'scene' || (segmentOf(group) !== 'scene' && (scope === 'outfit' || group !== 'outfit'));
export interface Trait { id: string; group: Group; evidence: string; tags: string[]; detail: string }
export interface Extraction { traits: Trait[]; skipped: number; weights: Map<string, number> }
/** stated: facts the user asserts about the character ("femboy, android"), true even if the description never says them. */
export interface TranslateOptions { scope?: Scope; stated?: string; /** The user's standing prompting guidance, saved in settings. */ notes?: string; /** Called as each stage starts, with a plain sentence for the status line. */ progress?: (stage: string) => void }
/** A prompt the user has generated from, and what they saw in the image. */
export interface RefineInput { tags: string[]; caption: string; feedback: string; description?: string; stated?: string; notes?: string; /** Tags that define the character (the sheet's Always include). Removable only when the feedback names them. */ locked?: string[]; /** Earlier rounds for this character, oldest first. */ history?: RefineRound[] }
/** One earlier round of Refine: what the user said, and which suggestions they took or turned down. */
export interface RefineRound { feedback: string; applied: string[]; declined: string[] }
/** One change the user can accept or decline. */
export interface Proposal { kind: 'add' | 'remove' | 'weight' | 'caption'; tag?: string; weight?: number; caption?: string; why: string; definition?: string; url?: string }
export interface Refinement { reply: string; proposals: Proposal[]; notices: string[]; model: string }
export interface VerifiedTag {
  name: string; source: 'Danbooru' | 'Gelbooru'; wiki: string; url: string;
  aliasFrom?: string; count: number;
}
export interface TagRow extends VerifiedTag { evidence: string; traitId: string; weight?: number }
export interface Issue { kind: 'ambiguity' | 'contradiction'; evidence: string[]; message: string }
export const SCOPES = ['character','outfit','scene'] as const;
/** One translation seen at one scope. */
export interface View { tags: TagRow[]; prose: string; prompt: string; notices: string[]; evidence: Trait[] }
/** The requested scope's view at the top level, plus every scope so the panel can switch without another run. */
/** The result laid out as Lumi Studio's character sheet fields: comma-separated, spaces for underscores, no sentences. */
export interface Sheet { countTag: string; subject: string; always: string; appearance: string; outfit: string; anatomy: string }
/** Something that leaves the character under-specified. Advisory only: a gap never changes tags, captions or the sheet. */
export interface Gap { kind: 'missing' | 'vague'; what: string; note: string }
/** What LumiCast shares with Lumi Studio through Lumiverse's shared RPC pool, at lumicast.sheet.latest. */
/** A character Lumi Studio sends back to be tweaked, with its Cast lorebook description when one is found. */
/** id and kind name the saved Lumi Studio entry (empty id: not saved there yet), so the revised sheet can go back to it. */
export interface StudioCharacter { sheet: Sheet; name: string; sentAt: number; description: string; book: string; id: string; kind: 'character' | 'persona' }
export interface SharedSheet { version: 1; sheet: Sheet; name: string; title: string; updatedAt: number; userId: string }
/** A likely character name from a description's first line, such as "Jason Slatz — physical description:". */
export function nameFrom(description: string): string {
  const first = (description.split('\n').find(l => l.trim()) ?? '').trim();
  const head = first.split(/\s+[—–-]\s+|:/)[0].replace(/[*_#"“”]/g, '').trim();
  return /^[A-Z][\p{L}\d'’.-]*(?:\s+[A-Z][\p{L}\d'’.-]*){0,3}$/u.test(head) && head.length <= 40 ? head : '';
}
/** Where a translation's time went, in milliseconds. */
export interface Timing { model: number; lookups: number; total: number }
export interface Translation extends View { issues: Issue[]; model: string; views: Record<Scope, View>; sheet: Sheet; gaps: Gap[]; timing: Timing }
/** quality: the user's own prefix (quality, score, year, safety tags) for the Anima prompt. Never verified or changed. */
/** How hard the model thinks: light is a short think, off skips it, inherit uses the connection's own reasoning setting. */
export type Thinking = 'light' | 'off' | 'inherit';
export const THINKING: Thinking[] = ['light', 'off', 'inherit'];
/** castConnectionId: the model that cleans up [ooc] replies; empty means the main connection. */
export interface Settings { connectionId: string; castConnectionId: string; gelUser: string; gelKey: string; notes: string; quality: string; thinking: Thinking }
export interface PublicSettings { connectionId: string; castConnectionId: string; gelUser: string; hasGelKey: boolean; notes: string; quality: string; thinking: Thinking }
export interface Snapshot {
  connections: { id: string; name: string; provider: string; model: string; supported: boolean }[];
  settings: PublicSettings; permissions: boolean;
}
export type GenerateText = (system: string, input: string, signal: AbortSignal) => Promise<string>;
export interface TagDictionary {
  resolve(name: string, signal: AbortSignal): Promise<VerifiedTag | null>;
  /** Many names at once, in input order; ok is false where a tag service failed. Optional; resolve() is used one by one without it. */
  resolveMany?(names: string[], signal: AbortSignal): Promise<{ok: boolean; resolved: VerifiedTag | null}[]>;
  search(query: string, signal: AbortSignal): Promise<VerifiedTag[]>;
}
/** Gelbooru's account page shows the two values as one string, "&api_key=…&user_id=…". Accept that pasted into either box. */
export function gelCredentials(user: string, key: string): {user: string; key: string} {
  const both = `${user} ${key}`;
  return {
    user: (/user_id=(\d+)/.exec(both)?.[1] ?? user).trim(),
    key: (/api_key=([^&\s]+)/.exec(both)?.[1] ?? key).trim(),
  };
}
export interface GelbooruTest { ok: boolean; message: string }
export const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function text(v: unknown, label: string, max: number): string {
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new Error(`Invalid ${label}.`);
  return v.trim();
}
export function tagName(v: unknown): string {
  const name = text(v, 'tag', 100).toLowerCase().replace(/\s+/g, '_');
  if (!/^[a-z0-9][a-z0-9_():.'\/-]*$/.test(name)) throw new Error('Use a plain booru tag name, without weights or wildcards.');
  return name;
}
export const BREAST_SIZE = /^(?:flat_chest|(?:small|medium|large|huge|gigantic)_breasts)$/;
// Anima knows no cup letters. This fixed table is the only conversion; edit it to taste.
const CUP_TAGS: Record<string,string> = {AA:'flat_chest',A:'small_breasts',B:'small_breasts',C:'medium_breasts',D:'large_breasts',DD:'large_breasts',DDD:'large_breasts',E:'large_breasts',F:'huge_breasts',G:'huge_breasts',H:'huge_breasts',I:'huge_breasts',J:'huge_breasts',K:'huge_breasts'};
/** The single cup size a description states, or 'mixed' when it states several (never guess whose is whose). */
export function cupSize(source: string): {label: string; tag: string} | 'mixed' | null {
  const found = new Map<string,string>();
  const letters = 'AA|A|B|C|DDD|DD|D|E|F|G|H|I|J|K';
  for (const m of source.matchAll(new RegExp(`(an? |\\d{2} ?)?\\b(${letters})([- ]?)cups?\\b(?! of\\b)`, 'gi'))) {
    const letter = m[2].toUpperCase();
    // "a cup" is crockery and "I cup" is a verb: those two letters need a hyphen, "an A cup" or a band size.
    if ((letter === 'A' || letter === 'I') && m[3] !== '-' && !m[1]) continue;
    if (m[2] !== letter && m[3] !== '-') continue;
    found.set(letter, m[0].replace(/^an? /i, ''));
  }
  for (const m of source.matchAll(new RegExp(`\\b(?:2[89]|3\\d|4[0-8])(${letters})\\b`, 'g'))) if (!found.has(m[1])) found.set(m[1], m[0]);
  if (!found.size) return null;
  if (found.size > 1) return 'mixed';
  const [letter, label] = [...found][0];
  return {label, tag: CUP_TAGS[letter]};
}
/** A stated height in centimetres, from 6'8", 6 ft 8, 6'8 or 203 cm; 'mixed' when several differ. */
export function heightCm(source: string): number | 'mixed' | null {
  const found = new Set<number>();
  for (const m of source.matchAll(/\b([4-8])\s*(?:'|’|ft\.?|feet|foot)\s*(\d{1,2})?\s*(?:"|”|''|in\.?|inches)?(?![\d'’])/gi)) found.add(Math.round((Number(m[1]) * 12 + Number(m[2] ?? 0)) * 2.54));
  for (const m of source.matchAll(/\b(1[2-9]\d|2[0-4]\d)\s*cm\b/gi)) found.add(Number(m[1]));
  const values = [...found];
  if (!values.length) return null;
  // 6'8" and 203 cm in one description are the same height written twice.
  return values.every(v => Math.abs(v - values[0]) <= 3) ? values[0] : 'mixed';
}
// A cup label is never itself a booru tag.
export function isCupSizeTag(name: string): boolean {
  return /^(?:(?:aa|a|b|c|ddd|dd|d|e|f|g|h|i|j|k)[_-]?cup|cup[_-](?:aa|a|b|c|ddd|dd|d|e|f|g|h|i|j|k))$/.test(name);
}
export function isGenerative(model: string): boolean {
  return !!model.trim() && !/(?:\bjev\b|decisions?|embedding|rerank|moderation)/i.test(model);
}
/** A tag with an optional emphasis weight, written "(tag:1.4)". */
export interface Weighted { name: string; weight?: number }
export function parseWeighted(v: unknown): Weighted {
  const raw = text(v, 'tag', 120);
  const m = raw.match(/^\(\s*(.+?)\s*:\s*(\d+(?:\.\d+)?)\s*\)$/);
  if (!m) return {name: tagName(raw)};
  const weight = Number(m[2]);
  if (!(weight >= 0.1 && weight <= 3)) throw new Error('Use a tag weight between 0.1 and 3.');
  return weight === 1 ? {name: tagName(m[1])} : {name: tagName(m[1]), weight};
}
/** Editor form keeps underscores; prompt form uses spaces, except score tags. */
export function formatWeighted(tag: Weighted, prompt = false): string {
  const name = prompt && !/^score_\d+$/.test(tag.name) ? tag.name.replaceAll('_', ' ') : tag.name;
  return tag.weight ? `(${name}:${tag.weight})` : name;
}
/** Apply tag changes to one comma-separated sheet field, matching names whether written with spaces or underscores. */
export function editList(value: string, changes: {kind: string; tag?: string; weight?: number}[], addHere = false): string {
  const key = (s: string) => s.replace(/^\((.+?):\s*[\d.]+\)$/, '$1').trim().toLowerCase().replace(/[\s_]+/g, ' ');
  let items = value.split(/[,;\n]+/).map(v => v.trim()).filter(Boolean);
  for (const c of changes) {
    if (!c.tag) continue;
    const name = key(c.tag); const written = formatWeighted({name: c.tag, weight: c.weight === 1 ? undefined : c.weight}, true);
    if (c.kind === 'remove') items = items.filter(i => key(i) !== name);
    if (c.kind === 'weight') items = items.map(i => key(i) === name ? written : i);
    if (c.kind === 'add' && addHere && !items.some(i => key(i) === name)) items.push(written);
  }
  return items.join(', ');
}
/** Put the user's quality prefix in front of a prompt: on the tag line when there is one, otherwise as its own line. */
export function withQuality(prompt: string, quality: string, hasTags: boolean): string {
  const prefix = quality.trim().replace(/[,\s]+$/, '');
  if (!prefix) return prompt;
  if (!prompt.trim()) return prefix;
  return hasTags ? `${prefix}, ${prompt}` : `${prefix}\n\n${prompt}`;
}
export const splitTags = (value: string): string[] => value.split(/[\n,]/).map(v => v.trim()).filter(Boolean);
export function assemble(tags: (string | Weighted)[], prose: string): string {
  const unique = new Map<string, Weighted>();
  for (const tag of tags.map(t => typeof t === 'string' ? parseWeighted(t) : {...t, name: tagName(t.name)})) if (!unique.has(tag.name)) unique.set(tag.name, tag);
  return [[...unique.values()].map(t => formatWeighted(t, true)).join(', '), prose.trim()].filter(Boolean).join('\n\n');
}
