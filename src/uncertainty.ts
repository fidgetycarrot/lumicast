import {record, text, type Issue, type Trait} from './contracts';

export interface UncertaintyReview {
  issues: Issue[];
  blockedTraits: Set<string>;
  withholdAll: boolean;
  notices: string[];
}

const ABSENT_ATTRIBUTE = /\b(?:not (?:given|specified|described|mentioned|provided)|unspecified|not stated|unknown (?:age|gender|hair|eye)|missing (?:details?|information|description|attributes?)|need.*(?:age|gender|hair|eye)|(?:age|gender|hair|eye).*missing|does(?: not|n't) (?:specify|describe|mention|provide))\b/i;

/** Optional model annotations cannot invalidate grounded extraction. If a
 * malformed note might flag a conflict, withhold its affected approvals. */
export function reviewUncertainty(value: unknown, source: string, traits: Trait[]): UncertaintyReview {
  const result: UncertaintyReview = {issues:[],blockedTraits:new Set(),withholdAll:false,notices:[]};
  const byId = new Map(traits.map(t => [t.id,t]));
  let malformed = false, absent = false;
  const notes = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
  if (notes.length > 12) {
    result.withholdAll = true; malformed = true;
  } else for (const value of notes) {
    const note = record(value);
    const kind = typeof note.kind === 'string' ? note.kind.trim().toLowerCase() : '';
    const quotes: string[] = []; let invalidAnchor = false;
    const add = (quote: string) => {if (!quotes.includes(quote)) quotes.push(quote);};
    // Prefer references to already grounded extraction, avoiding a second
    // round of literal-quote copying by the model.
    if (note.traitIds !== undefined) {
      const ids = typeof note.traitIds === 'string' ? [note.traitIds] : note.traitIds;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 32) invalidAnchor = true;
      else for (const id of ids) {
        const trait = typeof id === 'string' ? byId.get(id.trim()) : undefined;
        if (trait) add(trait.evidence); else invalidAnchor = true;
      }
    }
    if (note.evidence !== undefined) {
      const evidence = typeof note.evidence === 'string' ? [note.evidence] : note.evidence;
      if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > 32) invalidAnchor = true;
      else for (const item of evidence) {
        try {
          const quote = text(item, 'uncertainty quote', 3000);
          // Some models use trait IDs in the legacy evidence field.
          const trait = byId.get(quote);
          if (trait) add(trait.evidence);
          else if (quote && source.includes(quote)) add(quote);
          else invalidAnchor = true;
        } catch {invalidAnchor = true;}
      }
    }
    let message = '';
    try {message = text(note.message, 'uncertainty explanation', 600);} catch { /* Optional malformed annotation. */ }
    // An absent attribute is not an uncertainty. Discard this annotation;
    // never use it as a reason to invent or complete a missing trait.
    if (message && ABSENT_ATTRIBUTE.test(message)) {absent = true; continue;}
    if ((kind === 'ambiguity' || kind === 'contradiction') && message && quotes.length && !invalidAnchor) {
      result.issues.push({kind,evidence:quotes,message});
      continue;
    }
    malformed = true;
    const affected = traits.filter(t => quotes.some(q => q.includes(t.evidence) || t.evidence.includes(q)));
    affected.forEach(t => result.blockedTraits.add(t.id));
    // No trustworthy anchor means the suspect note cannot be localized.
    // Fail closed on approvals, but still return the exact source details.
    if (invalidAnchor || !affected.length) result.withholdAll = true;
  }
  if (malformed) result.notices.push(result.withholdAll
    ? 'Some uncertainty notes could not be grounded. Review approvals were withheld; exact source details are retained.'
    : 'An unsupported uncertainty note was omitted. Its affected tags and compact wording were withheld; exact source details are retained.');
  if (absent) result.notices.push('A missing-attribute note was ignored. Unmentioned attributes are not filled in.');
  return result;
}
