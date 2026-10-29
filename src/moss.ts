import { record, text } from './contracts';

/**
 * Writing for MOSS Image, from what worked in practice (Argon's notes, October 2026). Shared by the
 * translation's review step and by "Write the MOSS description" for a character sent from Lumi Studio.
 */
export const MOSS_RULES = `- MOSS Image is a plain-English image model that knows no booru tags. An image tool puts the character's name in front of this text ("Rory, " followed by it) and uses it word for word in every scene, so it must stand alone.
- Start with "a" or "an" and the kind of person, then the lasting look: apparent age, build and figure, skin, face, eyes, hair, marks, species features. Every fact the source states about these, each once, and nothing it does not state. No name.
- Face and body only: no clothing, accessories, pose, expression or setting; those come from the scene.
- Plain words only: no tags, underscores, weights, and no booru terms such as trap or otoko no ko. Say what they look like.
- A feminine man: describe the face and the figure separately. Match the face to the character's attitude. A sharp, haughty or dangerous one: "a devastatingly pretty, ultra-feminine adult man with the delicate facial bone structure of a noblewoman, high cheekbones, long dark eyelashes and sharp, half-lidded amber eyes". Only a sweet or innocent one gets a soft, cute face. Then anchor the figure and the chest together in their own sentence, so MOSS neither broadens the shoulders nor adds a bust: "His slender body has a feminine hourglass curve with narrow shoulders, a flat male chest, a narrow waist, wide feminine hips and soft thighs" (keep only what the source supports).
- Skin is living skin. Never porcelain, alabaster, chalk-white, pallid, ashen or plain white skin: MOSS draws grey, undead skin and black lips from those, worst of all beside ash, dust, scars, crimson or noble. Write "smooth fair skin", "warm ivory skin" or "fair skin", and when the source mentions pale skin or lips, give the lips a natural colour ("glossy pink-tinted lips").
- Eyes: patterns, rings or veins are "inside the irises", never "around" them, which MOSS paints on the skin around the eyes. Normal and cybernetic eyes are never "glowing" (MOSS draws giant doll eyes); write "sharp, expressive amber eyes with subtle golden tech-ring patterns inside the irises". "Glowing" is only for visors and lenses.
- Attitude goes into lasting eye shape and bone structure, never a mouth expression (no smirk, grin, smile, frown, sneer or pout, or the character wears it even while crying): calculating, haughty or dangerous means high cheekbones and sharp half-lidded eyes; gentle or sweet means soft round cheeks and big expressive eyes; tired or rugged means a strong square jaw and heavy-lidded eyes.
- It must be safe for an image service that refuses nudity and sexual content: no genitals, nipples or other explicit anatomy and no sexual words, whatever the source says. Body shape in neutral words ("wide hips and full thighs", not "a fat bubble butt").
- Concrete, drawable words, no figures of speech. One to three sentences, 35 to 95 words; a complex character (cybernetic eyes, scars, an unusual figure) needs the upper end so nothing is dropped.
- When the character's usual outfit has a helmet worn on the head, write "": the image tool hides the face and hair itself while the helmet is on.`;

export const OUTFIT_RULES = `- The image tool writes "He wears a [first], a [second]…" from this list, so every item is one whole garment or worn accessory, each once. Never a short tag beside a longer phrase for the same garment, or MOSS draws two coats.
- One complete phrase per garment, with its colour, material, fit and the parts attached to it: "crimson silk officer coat worn on the shoulders with heavy gold bullion epaulets", "fitted black flak corset with white lace cravat", "fitted high-waisted black breeches", "thigh-high black leather boots".
- Two to sixteen lowercase words each, no comma inside, no pronoun, no "a" or "the" in front.
- Never "sleeveless" on a corset, vest or bodice: it is sleeveless already, and the word spreads to other people in the picture.
- Fitted clothes say so: "fitted high-waisted black breeches", never bare "breeches", which draws loose period trousers.
- Armour keeps its silhouette pieces attached with "with": "full-sleeved bulky storm-grey ceramite power armor with oversized bronze-runed shoulder pauldrons and heavy dorsal exhaust backpack". A helmet is its own item with its visor or lenses: "angular storm-grey vox-grille helmet with glowing amber visor eye-lenses".
- Nothing explicit, no underwear unless it is all that is worn.`;

/** Lumi Studio's own test for a helmet that is on (1.17.0, mossHelmetOn), so both sides agree. */
export const helmetOn = (outfit: string[]) => outfit.some(item => /\bhelmet\b/i.test(item) && !/\b(?:no|removed?|off|holding|under (?:his|her|their|one) arm|tucked|carried|carrying|in hand)\b/i.test(item));

const EXPLICIT = /\b(?:penis|cock|dick|testicles?|scrotum|vagina|pussy|vulva|labia|clit\w*|nipples?|areolae?|genital\w*|erect\w*|precum|cum|semen|anus|anal|nude|naked|aroused|arousal|sexual\w*|smallclothes|underwear)\b/i;
const EXPRESSION = /\b(?:smirk\w*|grin\w*|smil\w*|frown\w*|sneer\w*|pout\w*|scowl\w*|laugh\w*)\b/i;
const DEAD_SKIN = /\b(?:porcelain(?:-pale| pale)?|alabaster(?:-pale| pale)?|chalk-white|chalky|pallid|ashen|deathly pale|bone-white|paper-white)\b/gi;

/** Cuts every comma part or sentence that matches, keeping the rest readable. */
function cut(value: string, bad: RegExp): string {
  const kept = value.split(/(?<=[.;])\s+|,\s+(?=(?:and\s+)?[a-z])/).filter(part => !bad.test(part));
  let out = kept.join(', ').replace(/,\s*,/g, ',').replace(/[,;]\s*$/, '').replace(/,\s*(?=[A-Z])/g, '. ').trim();
  if (out && !/[.!?]$/.test(out)) out += '.';
  return out;
}

/**
 * The model's MOSS text, made safe and MOSS-shaped in code where a rule can be checked: no explicit words,
 * no mouth expressions, living skin, nothing "around the irises", no glowing eyes, empty under a helmet,
 * no number the source never gave, and a lower-case start so it reads after "Name, ".
 */
export function cleanMoss(raw: unknown, source: string, outfit: string[]): {moss: string; notices: string[]} {
  const notices: string[] = [];
  let moss = (() => { try { return text(raw, 'MOSS description', 1500); } catch { return ''; } })()
    .replace(/(?<=[a-z0-9])_(?=[a-z0-9])/gi, ' ').replace(/\s+/g, ' ').trim();
  if (helmetOn(outfit)) {
    if (moss) notices.push('The MOSS description is left empty because the outfit has a helmet on; Lumi Studio hides the face and hair while it is worn.');
    return {moss:'', notices};
  }
  if (moss && !(moss.match(/\d+/g) ?? []).every(n => source.includes(n))) return {moss:'', notices};
  if (EXPLICIT.test(moss)) { moss = cut(moss, EXPLICIT); notices.push('Explicit words were left out of the MOSS description, since NanoGPT refuses NSFW.'); }
  if (EXPRESSION.test(moss)) { moss = cut(moss, EXPRESSION); notices.push('A facial expression was left out of the MOSS description, so the character can still cry or laugh in a scene.'); }
  moss = moss.replace(DEAD_SKIN, 'fair').replace(/\bfair(?:[ -]fair)+\b/gi, 'fair')
    .replace(/\b(around|surrounding|circling|ringing)\s+(?:the|his|her|their)\s+irises\b/gi, 'inside the irises')
    .replace(/\bglowing\s+(?=(?:[\w-]+\s+){0,3}eyes\b)/gi, '');
  // Lumi Studio writes "Name, " in front of it, so it starts in lower case.
  return {moss:moss.replace(/^(A|An)\b/, m => m.toLowerCase()), notices};
}

/** Outfit items as whole garments: one per comma, no "sleeveless" on corsets and vests, each once. */
export function cleanOutfit(value: unknown, source: string): string[] {
  const out: string[] = [];
  for (const item of (Array.isArray(value) ? value : []).slice(0, 14)) {
    if (typeof item !== 'string') continue;
    let v = item.replace(/_/g, ' ').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim().toLowerCase()
      .replace(/^(?:(?:he|she|they) (?:wears?|has|have) |(?:a|an|the|his|her|their) )/, '');
    if (/\b(?:corset|vest|bodice|bustier|waistcoat)\b/.test(v)) v = v.replace(/\bsleeveless\s+/g, '');
    if (!v || v.length > 140 || EXPLICIT.test(v) || !(v.match(/\d+/g) ?? []).every(n => source.includes(n)) || out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

const SAME: Record<string, string> = {trousers:'pants', breeches:'pants', jeans:'pants', slacks:'pants', shorts:'pants', footwear:'boots', shoes:'boots', boot:'boots', epaulettes:'epaulets', epaulette:'epaulets', epaulet:'epaulets', jacket:'coat', greatcoat:'coat', overcoat:'coat', thighhighs:'stockings', socks:'stockings', legwear:'stockings', pantyhose:'stockings', vest:'corset', waistcoat:'corset', bodice:'corset', bustier:'corset'};
const nounOf = (word: string) => (SAME[word] ?? word).replace(/(?<=[a-z]{3})s$/, '');
/**
 * The outfit tags that no whole-garment phrase covers. A phrase covers a tag when it names the tag's garment
 * ("thigh-high black leather boots" covers thigh boots, leather boots and black footwear); the uncovered ones
 * stay, so a garment the phrases forgot is not lost.
 */
export function uncoveredTags(tags: string[], phrases: string[]): string[] {
  const nouns = new Set(phrases.flatMap(p => p.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(nounOf)));
  return tags.filter(tag => { const words = tag.toLowerCase().replace(/_/g, ' ').split(/[^a-z]+/).filter(Boolean); return !words.length || !nouns.has(nounOf(words[words.length - 1])); });
}

/** The answer to "Write the MOSS description": the text and the outfit, both cleaned. */
export function parseMoss(raw: Record<string, unknown>, source: string, fallbackOutfit: string[]): {moss: string; outfit: string[]; notices: string[]} {
  const phrases = cleanOutfit(record(raw).outfit, source);
  // Old items the new phrases do not cover are kept, so nothing the sheet wore is lost.
  const outfit = phrases.length ? [...phrases, ...uncoveredTags(fallbackOutfit, phrases)] : [];
  const used = outfit.length ? outfit : fallbackOutfit;
  const {moss, notices} = cleanMoss(record(raw).moss, source, used);
  return {moss, outfit, notices};
}
