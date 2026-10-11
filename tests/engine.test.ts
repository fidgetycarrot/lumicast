import { test, expect } from 'bun:test';
import { Translator, parseExtraction, removeConflicts } from '../src/engine';
import { assemble, isGenerative, type TagDictionary, type TagRow } from '../src/contracts';
import { cases } from './fixtures';
const dictionary:TagDictionary={resolve:async name=>({name,source:'Danbooru',count:10,wiki:`Definition of ${name}`,url:'https://danbooru.donmai.us/wiki_pages/'+name}),search:async()=>[]};
for(const fixture of cases)test(fixture.name,async()=> {
  let calls=0;
  const engine=new Translator(async()=>JSON.stringify(++calls===1 ? {traits:fixture.traits}:{keep:fixture.keep,safeDetails:fixture.traits.map(t=>t.id),covered:fixture.covered??[],issues:fixture.issues??[]}),dictionary);
  const result=await engine.translate(fixture.source,new AbortController().signal,'fixture generative model');
  expect(calls).toBe(2);expect(result.tags.map(t=>t.name)).toEqual(fixture.keep);
  for(const trait of fixture.traits)expect(result.evidence.find(t=>t.id===trait.id)?.evidence).toBe(trait.evidence);
  if(fixture.prose)expect(result.prose).toBe(fixture.prose);
  else for(const trait of fixture.traits)expect(result.prompt).toContain(trait.evidence);
  expect(result.issues.length).toBe(fixture.issues?.length??0);
  expect(result.prompt).not.toMatch(/masterpiece|best quality|score_7|looking at viewer|beautiful/);
});
test('fabricated evidence and duplicate IDs rejected',()=> {
  expect(()=>parseExtraction(JSON.stringify({traits:[{id:'t1',evidence:'blue eyes',tag:'blue_eyes'}]}),'red hair')).toThrow('exact source quote');
  expect(()=>parseExtraction(JSON.stringify({traits:[{id:'x',evidence:'red',tag:null},{id:'x',evidence:'hair',tag:null}]}),'red hair')).toThrow();
});
test('audit cannot introduce a new tag',async()=> {
  let n=0;const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'1',evidence:'red hair',tag:'red_hair'}]}:{keep:['blue_eyes'],issues:[]}),dictionary);
  await expect(engine.translate('red hair',new AbortController().signal,'model')).rejects.toThrow('unverified tag');
});
test('invented uncertainty or absent-attribute checklist cannot become displayed issues',async()=> {
  for(const issue of [{kind:'ambiguity',evidence:['red hair'],message:'Age not specified.'},{kind:'contradiction',evidence:['blue eyes'],message:'Two colors.'}]) {
    let n=0;const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'1',evidence:'red hair',tag:null}]}:{keep:[],issues:[issue]}),dictionary);
    const result=await engine.translate('red hair',new AbortController().signal,'model');
    expect(result.issues).toEqual([]);expect(result.prompt).toBe('red hair.');expect(result.notices.length).toBeGreaterThan(0);
  }
});
test('dictionary outage retains source wording without unverified tags',async()=> {
  let n=0;const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'1',evidence:'red hair',tag:'red_hair'}]}:{keep:[],issues:[]}),{...dictionary,resolve:async()=>{throw new Error('offline');}});
  const result=await engine.translate('red hair',new AbortController().signal,'model');expect(result.prompt).toBe('red hair.');expect(result.notices).toContain('A tag service was unavailable. Unverified details stay in prose.');
});
test('duplicate canonical tags collapse and global conflicts drop all sides',async()=> {
  const row=(name:string):TagRow=>({name,source:'Danbooru',count:1,wiki:'',url:'',traitId:'1',evidence:'x'});
  expect(removeConflicts(['blue_eyes','brown_eyes','black_hair','white_hair','smile'].map(row)).map(r=>r.name)).toEqual(['smile']);
  expect(assemble(['blue_eyes','blue eyes'],'A narrow face.')).toBe('blue eyes\n\nA narrow face.');
});
test('non-generative models blocked without guessed model IDs',()=> {
  expect(isGenerative('typesafe/jev-1.13')).toBe(false);expect(isGenerative('openai/luna-decisions')).toBe(false);expect(isGenerative('text-embedding')).toBe(false);expect(isGenerative('provider/generative-text')).toBe(true);
});
test('cancellation prevents output',async()=> {
  const c=new AbortController();c.abort();const engine=new Translator(async()=>{throw new Error('must not call');},dictionary);
  await expect(engine.translate('red hair',c.signal,'model')).rejects.toThrow();
});
test('malformed model response and oversized description fail clearly',async()=> {
  await expect(new Translator(async()=>'not json',dictionary).translate('red hair',new AbortController().signal,'model')).rejects.toThrow('valid translator JSON');
  await expect(new Translator(async()=>'{}',dictionary).translate('a'.repeat(12_001),new AbortController().signal,'model')).rejects.toThrow('Invalid description');
});
test('cup-label candidate never reaches the dictionary or becomes a visual size tag',async()=> {
  for(const tag of ['b_cup','small_breasts','medium_breasts']) {
    let n=0;const lookedUp:string[]=[];
    const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'cup',evidence:'B cup',tag,detail:'B-cup bust'}]}:{keep:[],safeDetails:['cup'],covered:[],issues:[]}),{...dictionary,resolve:async name=>{lookedUp.push(name);return dictionary.resolve(name,new AbortController().signal);}});
    const result=await engine.translate('B cup',new AbortController().signal,'model');
    expect(lookedUp).toEqual([]);expect(result.tags).toEqual([]);expect(result.prose).toBe('B-cup bust.');expect(result.prompt).not.toMatch(/small breasts|medium breasts|b_cup/);
  }
});
test('unapproved compact wording falls back to literal evidence',async()=> {
  let n=0;const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'1',evidence:'red hair',tag:null,detail:'Red hair and blue eyes'}]}:{keep:[],safeDetails:[],covered:[],issues:[]}),dictionary);
  const result=await engine.translate('red hair',new AbortController().signal,'model');expect(result.prompt).toBe('red hair.');expect(result.prompt).not.toContain('blue');
});
test('compact review cannot omit untagged facts or approve unknown IDs',async()=> {
  for(const audit of [{keep:[],safeDetails:['fake'],covered:[],issues:[]},{keep:[],safeDetails:['1'],covered:['1'],issues:[]}]) {
    let n=0;const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'1',evidence:'a narrow face',tag:null,detail:'A narrow face'}]}:audit),dictionary);
    await expect(engine.translate('a narrow face',new AbortController().signal,'model')).rejects.toThrow('Invalid compact-detail review');
  }
});
test('conflict guard restores prose even if reviewer marked conflicting tags covered',async()=> {
  let n=0;const source='Black hair. White hair.';
  const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'1',evidence:'Black hair.',tag:'black_hair',detail:'Black hair'},{id:'2',evidence:'White hair.',tag:'white_hair',detail:'White hair'}]}:{keep:['black_hair','white_hair'],safeDetails:['1','2'],covered:['1','2'],issues:[]}),dictionary);
  const result=await engine.translate(source,new AbortController().signal,'model');expect(result.tags).toEqual([]);expect(result.prose).toBe(source);
});
test('reviewer sees original quotes and proposed detail, while tag-only facts avoid duplicated prose',async()=> {
  let n=0;const engine=new Translator(async(_system,input)=> {
    if(++n===1)return JSON.stringify({traits:[{id:'1',evidence:'Red hair.',tag:'red_hair',detail:'Red hair'}]});
    const review=JSON.parse(input);expect(review.traits[0].evidence).toBe('Red hair.');expect(review.traits[0].detail).toBe('Red hair');expect(review.candidates[0].name).toBe('red_hair');
    return JSON.stringify({keep:['red_hair'],safeDetails:['1'],covered:['1'],issues:[]});
  },dictionary);
  const result=await engine.translate('Red hair.',new AbortController().signal,'model');expect(result.prose).toBe('');expect(result.prompt).toBe('red hair');expect(result.evidence[0].evidence).toBe('Red hair.');
});
test('string evidence no longer aborts review; genuine uncertainty still withholds affected tag and prose approval',async()=> {
  let n=0;const source='Blue or grey eyes. Red hair.';
  const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'eyes',evidence:'Blue or grey eyes.',tag:'blue_eyes',detail:'Blue eyes'},{id:'hair',evidence:'Red hair.',tag:'red_hair',detail:'Red hair'}]}:{keep:['blue_eyes','red_hair'],safeDetails:['eyes','hair'],covered:['eyes','hair'],issues:[{kind:'ambiguity',evidence:'Blue or grey eyes.',message:'The source gives two eye-color alternatives.'}]}),dictionary);
  const result=await engine.translate(source,new AbortController().signal,'model');
  expect(result.tags.map(t=>t.name)).toEqual(['red_hair']);expect(result.prose).toBe('Blue or grey eyes.');expect(result.issues[0].evidence).toEqual(['Blue or grey eyes.']);
});
test('unsupported note with known evidence withholds only affected approvals',async()=> {
  let n=0;const source='Red hair. A narrow face.';
  const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'hair',evidence:'Red hair.',tag:'red_hair',detail:'Bright red hair'},{id:'face',evidence:'A narrow face.',tag:null,detail:'A narrow face'}]}:{keep:['red_hair'],safeDetails:['hair','face'],covered:['hair'],issues:[{kind:'warning',evidence:['Red hair.'],message:'Review this interpretation.'}]}),dictionary);
  const result=await engine.translate(source,new AbortController().signal,'model');
  expect(result.tags).toEqual([]);expect(result.prose).toBe(source);expect(result.issues).toEqual([]);expect(result.notices.join(' ')).toContain('unsupported uncertainty note');
});
test('unlocatable malformed note returns grounded source-only fallback instead of accepting suspect approvals',async()=> {
  let n=0;const source='Red hair.';
  const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'hair',evidence:source,tag:'red_hair',detail:'Red hair and blue eyes'}]}:{keep:['red_hair'],safeDetails:['hair'],covered:['hair'],issues:[{kind:'ambiguity or contradiction',evidence:[],message:'A possible conflict.'}]}),dictionary);
  const result=await engine.translate(source,new AbortController().signal,'model');
  expect(result.tags).toEqual([]);expect(result.prompt).toBe(source);expect(result.issues).toEqual([]);expect(result.notices.join(' ')).toContain('approvals were withheld');
});
