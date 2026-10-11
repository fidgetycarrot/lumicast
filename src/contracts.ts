/** Identity groups describe the character in any scene; outfit and moment belong to one scene. */
export const GROUPS = ['subject','body','hair','face','outfit','moment'] as const;
export type Group = typeof GROUPS[number];
/** character: body, hair and face only. outfit: plus clothing. scene: everything described. */
export type Scope = 'character' | 'outfit' | 'scene';
export const inScope = (group: Group, scope: Scope): boolean => scope === 'scene' || (group !== 'moment' && (scope === 'outfit' || group !== 'outfit'));
export interface Trait { id: string; group: Group; evidence: string; tags: string[]; detail: string }
export interface Extraction { traits: Trait[]; skipped: number }
export interface TranslateOptions { scope?: Scope }
export interface VerifiedTag {
  name: string; source: 'Danbooru' | 'Gelbooru'; wiki: string; url: string;
  aliasFrom?: string; count: number;
}
export interface TagRow extends VerifiedTag { evidence: string; traitId: string }
export interface Issue { kind: 'ambiguity' | 'contradiction'; evidence: string[]; message: string }
export interface Translation {
  tags: TagRow[]; prose: string; issues: Issue[]; notices: string[];
  prompt: string; model: string; evidence: Trait[];
}
export interface Settings { connectionId: string; gelUser: string; gelKey: string }
export interface PublicSettings { connectionId: string; gelUser: string; hasGelKey: boolean }
export interface Snapshot {
  connections: { id: string; name: string; provider: string; model: string; supported: boolean }[];
  settings: PublicSettings; permissions: boolean;
}
export type GenerateText = (system: string, input: string, signal: AbortSignal) => Promise<string>;
export interface TagDictionary {
  resolve(name: string, signal: AbortSignal): Promise<VerifiedTag | null>;
  search(query: string, signal: AbortSignal): Promise<VerifiedTag[]>;
}
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
// A cup label is never itself a booru tag.
export function isCupSizeTag(name: string): boolean {
  return /^(?:(?:aa|a|b|c|ddd|dd|d|e|f|g|h|i|j|k)[_-]?cup|cup[_-](?:aa|a|b|c|ddd|dd|d|e|f|g|h|i|j|k))$/.test(name);
}
export function isGenerative(model: string): boolean {
  return !!model.trim() && !/(?:\bjev\b|decisions?|embedding|rerank|moderation)/i.test(model);
}
export function assemble(names: string[], prose: string): string {
  const tags = [...new Set(names.map(tagName))].map(n => /^score_\d+$/.test(n) ? n : n.replaceAll('_', ' '));
  return [tags.join(', '), prose.trim()].filter(Boolean).join('\n\n');
}
