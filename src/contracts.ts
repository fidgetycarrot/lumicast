export interface Trait { id: string; evidence: string; tag: string | null; detail?: string }
export interface Extraction { traits: Trait[] }
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
// A bra cup label is a clothing measurement, not a reliable visual tag.
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
