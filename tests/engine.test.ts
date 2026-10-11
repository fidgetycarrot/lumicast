import { test, expect } from 'bun:test';
import { Translator, parseExtraction, removeConflicts } from '../src/engine';
import { assemble, cupSize, inScope, isGenerative, type TagDictionary, type TagRow, type TranslateOptions } from '../src/contracts';
import { cases, narratedFiller } from './fixtures';
const dictionary:TagDictionary={resolve:async name=>({name,source:'Danbooru',count:10,wiki:`Definition of ${name}`,url:'https://danbooru.donmai.us/wiki_pages/'+name}),search:async()=>[]};
const signal=()=>new AbortController().signal;
/** Engine fed fixed responses for the extraction call and then the review call. */
function run(source:string,extraction:unknown,review:unknown,options?:TranslateOptions,dict=dictionary) {
  let calls=0;const inputs:string[]=[];
  const engine=new Translator(async(_system,input)=>{inputs.push(input);const value=++calls===1?extraction:review;return typeof value==='string'?value:JSON.stringify(value);},dict);
  return engine.translate(source,signal(),'model',options).then(result=>({result,inputs,calls}));
}
const hair={traits:[{id:'1',group:'hair',evidence:'red hair',tags:['red_hair'],detail:'Red hair'}]};

for(const fixture of cases)test(fixture.name,async()=> {
  const {result,calls}=await run(fixture.source,{traits:fixture.traits},{drop:fixture.drop??[],captions:{character:fixture.caption??''},issues:fixture.issues??[]},{scope:fixture.scope});
  expect(calls).toBe(2);expect(result.tags.map(t=>t.name)).toEqual(fixture.tags);
  if(fixture.prose)expect(result.prose).toBe(fixture.prose);
  if(fixture.absent)expect(result.prompt).not.toMatch(fixture.absent);
  for(const trait of result.evidence)expect(fixture.source).toContain(trait.evidence);
  expect(result.issues.length).toBe(fixture.issues?.length??0);
  expect(result.prompt).not.toMatch(/masterpiece|best quality|score_7|looking at viewer|beautiful/);
});
test('one run yields every scope; character is the default and says what it hides',async()=> {
  const fixture=cases.find(c=>c.name.includes('character only'))!;
  const {result,calls}=await run(fixture.source,{traits:fixture.traits},{drop:[],captions:{character:fixture.caption,outfit:'She wears an oversized hoodie and thin leggings.',scene:'She looks bored, chin in her palm.'},issues:[]});
  expect(calls).toBe(2);expect(result.prompt).toBe(result.views.character.prompt);
  expect(result.evidence.every(t=>inScope(t.group,'character'))).toBe(true);
  expect(result.notices.join(' ')).toContain('6 clothing, pose or scene details are hidden');
  expect(result.prompt).not.toMatch(narratedFiller);expect(result.prompt).not.toMatch(/hoodie|leggings|bored|solo/);
  for(const scope of ['outfit','scene'] as const)expect(result.views[scope].tags.map(t=>t.name)).toEqual(cases.find(c=>c.scope===scope&&c.name.startsWith('narrated'))!.tags);
  expect(result.views.outfit.prose).toBe(`${fixture.caption} She wears an oversized hoodie and thin leggings.`);
  expect(result.views.scene.prose).toBe(`${fixture.caption} She wears an oversized hoodie and thin leggings. She looks bored, chin in her palm.`);
  expect(result.views.outfit.notices.join(' ')).toContain('4 pose or scene details are hidden');expect(result.views.scene.notices.join(' ')).not.toContain('hidden');
  // Shared tags are identical across views: the scopes cannot disagree with each other.
  expect(result.views.scene.tags.filter(t=>t.name!=='solo').slice(0,result.tags.length)).toEqual(result.tags);
});
test('a scope with nothing in it is an empty view with a notice, not a failed run',async()=> {
  const {result}=await run('A red scarf.',{traits:[{id:'1',group:'outfit',evidence:'A red scarf.',tags:['red_scarf'],detail:'A red scarf'}]},{});
  expect(result.prompt).toBe('');expect(result.notices.join(' ')).toContain('Nothing in this description is about the character');
  expect(result.views.outfit.prompt).toBe('red scarf\n\nA red scarf.');
});
test('a caption segment missing or unusable falls back for that segment only',async()=> {
  const traits=[{id:'1',group:'hair',evidence:'red hair',tags:[],detail:'Red hair'},{id:'2',group:'outfit',evidence:'a coat',tags:[],detail:'A long coat'}];
  const {result}=await run('red hair and a coat',{traits},{captions:{character:'Vivid red hair.',outfit:7,scene:'She waves.'}});
  expect(result.views.scene.prose).toBe('Vivid red hair. A long coat.');expect(result.views.scene.notices.join(' ')).toContain('no usable caption for part');expect(result.prose).toBe('Vivid red hair.');
});
test('stated character type is quotable evidence, reaches the model, and is absent by default',async()=> {
  const traits=[{id:'1',group:'subject',evidence:'femboy',tags:['otoko_no_ko'],detail:'A feminine-presenting young man'},{id:'2',group:'hair',evidence:'silver hair',tags:['silver_hair'],detail:'Silver hair'}];
  const without=await run('He has silver hair.',{traits},{});
  expect(without.result.tags.map(t=>t.name)).toEqual(['silver_hair']);expect(JSON.parse(without.inputs[0])).toEqual({description:'He has silver hair.'});
  const withType=await run('He has silver hair.',{traits},{captions:{character:'A feminine-presenting young man with silver hair.'}},{stated:' femboy, android '});
  expect(withType.result.prompt).toBe('otoko no ko, silver hair\n\nA feminine-presenting young man with silver hair.');
  expect(JSON.parse(withType.inputs[0]).stated).toBe('femboy, android');expect(withType.result.notices.join(' ')).not.toContain('left out');
  await expect(run('x',{traits},{},{stated:'y'.repeat(301)})).rejects.toThrow('Invalid character type');
  expect((await run('Silver hair.',{traits:[traits[1]]},{},{stated:'she is a D cup'})).result.tags.map(t=>t.name)).toEqual(['silver_hair','large_breasts']);
});
test('tags follow identity order however the model ordered its traits',async()=> {
  const traits=[{id:'a',group:'outfit',evidence:'a coat',tags:['coat']},{id:'b',group:'hair',evidence:'red hair',tags:['red_hair']},{id:'c',group:'subject',evidence:'She',tags:['1girl']}];
  expect((await run('She has red hair and a coat',{traits},{},{scope:'scene'})).result.tags.map(t=>t.name)).toEqual(['1girl','red_hair','coat']);
});
test('one ungrounded trait is skipped with a notice; wholly ungrounded output is rejected',async()=> {
  const mixed={traits:[...hair.traits,{id:'2',group:'face',evidence:'blue eyes',tags:['blue_eyes'],detail:'Blue eyes'}]};
  const {result}=await run('red hair',mixed,{});
  expect(result.tags.map(t=>t.name)).toEqual(['red_hair']);expect(result.prompt).not.toContain('blue');expect(result.notices.join(' ')).toContain('1 extracted detail was left out');
  expect(()=>parseExtraction(JSON.stringify({traits:[{id:'t1',evidence:'blue eyes',tags:['blue_eyes']}]}),'red hair')).toThrow('did not quote');
});
test('retyped quotes and dashes still ground; duplicate ids, bad tags and legacy single tags are repaired',()=> {
  const source='Dark—near-black—hair.  She’s “tiny”.';
  const parsed=parseExtraction(JSON.stringify({traits:[{id:'x',group:'hair',evidence:'Dark - near-black - hair',tag:'black_hair',detail:'Near-black hair'},{id:'x',group:'nonsense',evidence:'She\'s "tiny"',tags:['petite','{bad:1.2}',7,'petite']}]}),source);
  expect(parsed.skipped).toBe(0);expect(parsed.traits.map(t=>t.id)).toEqual(['x','trait-2']);
  expect(parsed.traits[0].tags).toEqual(['black_hair']);expect(parsed.traits[1].tags).toEqual(['petite']);
  expect(parsed.traits[1].group).toBe('body');expect(parsed.traits[1].detail).toBe('She\'s "tiny"');
});
test('review can only drop: unknown names and attempts to add tags are ignored',async()=> {
  const {result}=await run('red hair',hair,{drop:['blue_eyes',null],keep:['blue_eyes'],tags:['blue_eyes'],captions:{character:'Red hair.'}});
  expect(result.tags.map(t=>t.name)).toEqual(['red_hair']);expect(result.prompt).toBe('red hair\n\nRed hair.');
});
test('unusable review output keeps verified tags and first-pass wording instead of failing',async()=> {
  for(const review of ['Sure! Here is the prompt','[]']) {
    const {result}=await run('red hair',hair,review);
    expect(result.prompt).toBe('red hair\n\nRed hair.');
  }
  expect((await run('red hair',hair,'not json')).result.notices.join(' ')).toContain('review step returned unusable text');
});
test('caption citing a number the description never gave falls back to first-pass wording',async()=> {
  const {result}=await run('red hair',hair,{drop:[],captions:{character:'A 19-year-old with red_hair.'}});
  expect(result.prose).toBe('Red hair.');expect(result.notices.join(' ')).toContain('no usable caption for part');
  expect((await run('red hair',hair,{captions:{character:'Vivid red_hair worn loose.'}})).result.prose).toBe('Vivid red hair worn loose.');
});
test('extraction failure, cancellation and oversized input fail clearly',async()=> {
  await expect(run('red hair','not json',{})).rejects.toThrow('valid translator JSON');
  await expect(run('a'.repeat(12_001),hair,{})).rejects.toThrow('Invalid description');
  await expect(run('red hair',{traits:[]},{})).rejects.toThrow('No explicit visual traits');
  const c=new AbortController();c.abort();
  await expect(new Translator(async()=>{throw new Error('must not call');},dictionary).translate('red hair',c.signal,'model')).rejects.toThrow();
});
test('provider failure during review is not swallowed as bad output',async()=> {
  let n=0;const engine=new Translator(async()=>{if(++n===2)throw new Error('provider down');return JSON.stringify(hair);},dictionary);
  await expect(engine.translate('red hair',signal(),'model')).rejects.toThrow('provider down');
});
test('stated cup size becomes one fixed breast-size tag that the model cannot override or drop',async()=> {
  for(const guess of ['b_cup','medium_breasts','large_breasts']) {
    const lookedUp:string[]=[];
    const {result,inputs}=await run('B cup, slim waist.',{traits:[{id:'c',group:'body',evidence:'B cup, slim waist.',tags:[guess,'narrow_waist'],detail:'A slim waist'}]},{drop:['small_breasts'],captions:{character:'A slim waist.'}},undefined,{...dictionary,resolve:async name=>{lookedUp.push(name);return dictionary.resolve(name,signal());}});
    expect(lookedUp.sort()).toEqual(['narrow_waist','small_breasts']);expect(result.prompt).toBe('small breasts, narrow waist\n\nA slim waist.');
    expect(result.notices).toContain('B cup was converted to small_breasts.');expect(JSON.parse(inputs[1]).candidates.map((c:{name:string})=>c.name)).toEqual(['narrow_waist']);
  }
  const mixed=await run('Mara is a B cup; Sol is a D cup.',{traits:[{id:'c',group:'body',evidence:'Mara is a B cup',tags:['small_breasts'],detail:'Mara has a small bust'}]},{});
  expect(mixed.result.tags).toEqual([]);expect(mixed.result.notices.join(' ')).toContain('Several cup sizes');
});
test('cup labels are read as measurements, not crockery or verbs',()=> {
  expect(cupSize('Figure: B cup, 24-33 measurements.')).toEqual({label:'B cup',tag:'small_breasts'});
  expect(cupSize('she is an A cup')).toEqual({label:'A cup',tag:'small_breasts'});
  expect(cupSize('a generous d-cup')).toEqual({label:'d-cup',tag:'large_breasts'});
  expect(cupSize('wears a 32C')).toEqual({label:'32C',tag:'medium_breasts'});
  expect(cupSize('DD cups')).toEqual({label:'DD cups',tag:'large_breasts'});
  for(const text of ['A cup of coffee in hand.','A cup sits on the desk.','I cup her face.','holding a b cup','no chest described'])expect(cupSize(text)).toBeNull();
  expect(cupSize('B cup at 20, C cup now')).toBe('mixed');
});
test('without a cup label a described size passes through review like any tag',async()=> {
  const traits=[{id:'1',group:'body',evidence:'a small chest',tags:['small_breasts'],detail:'A small chest'}];
  expect((await run('a small chest',{traits},{})).result.tags.map(t=>t.name)).toEqual(['small_breasts']);
  expect((await run('a small chest',{traits},{drop:['small_breasts']})).result.tags).toEqual([]);
});
test('dictionary outage leaves the caption and no unverified tags',async()=> {
  const {result}=await run('red hair',hair,{captions:{character:'Red hair.'}},undefined,{...dictionary,resolve:async()=>{throw new Error('offline');}});
  expect(result.prompt).toBe('Red hair.');expect(result.notices.join(' ')).toContain('tag service was unavailable');
});
test('nonexistent tags are named in a notice; aliases collapse to one canonical tag',async()=> {
  const dict={...dictionary,resolve:async(name:string)=>name==='made_up_tag'?null:dictionary.resolve(name==='gray_hair'?'grey_hair':name,signal())};
  const {result}=await run('grey hair',{traits:[{id:'1',group:'hair',evidence:'grey hair',tags:['gray_hair','grey_hair','made_up_tag'],detail:'Grey hair'}]},{},undefined,dict);
  expect(result.tags.map(t=>t.name)).toEqual(['grey_hair']);expect(result.notices.join(' ')).toContain('“made_up_tag” is not a live Danbooru tag');
});
test('candidate tags are capped and wiki text is trimmed before review',async()=> {
  const words=Array.from({length:12},(_,i)=>`w${i}`);const source=words.join(' ');
  const traits=words.map((w,i)=>({id:w,group:'body',evidence:w,tags:[0,1,2,3].map(n=>`tag_${i}_${n}`),detail:w}));
  const {result,inputs}=await run(source,{traits},{},undefined,{...dictionary,resolve:async name=>({name,source:'Danbooru',count:1,wiki:'x'.repeat(4000),url:''})});
  expect(result.tags.length).toBe(40);expect(JSON.parse(inputs[1]).candidates.every((c:{definition:string})=>c.definition.length===300)).toBe(true);
});
test('conflicting global tags drop together',async()=> {
  const row=(name:string):TagRow=>({name,source:'Danbooru',count:1,wiki:'',url:'',traitId:'1',evidence:'x'});
  expect(removeConflicts(['blue_eyes','brown_eyes','black_hair','white_hair','small_breasts','flat_chest','smile'].map(row)).map(r=>r.name)).toEqual(['smile']);
  expect(assemble(['blue_eyes','blue eyes'],'A narrow face.')).toBe('blue eyes\n\nA narrow face.');
  const {result}=await run('Black hair. White hair.',{traits:[{id:'1',group:'hair',evidence:'Black hair.',tags:['black_hair'],detail:'Black hair'},{id:'2',group:'hair',evidence:'White hair.',tags:['white_hair'],detail:'White hair'}]},{});
  expect(result.tags).toEqual([]);expect(result.prose).toBe('Black hair. White hair.');expect(result.notices.join(' ')).toContain('Conflicting tags');
});
test('genuine uncertainty withholds only the affected trait\'s tags',async()=> {
  const traits=[{id:'eyes',group:'face',evidence:'Blue or grey eyes.',tags:['blue_eyes'],detail:'Blue or grey eyes'},{id:'hair',group:'hair',evidence:'Red hair.',tags:['red_hair'],detail:'Red hair'}];
  for(const anchor of [{traitIds:['eyes']},{evidence:'Blue or grey eyes.'}]) {
    const {result}=await run('Blue or grey eyes. Red hair.',{traits},{drop:[],captions:{character:'Red hair. Blue or grey eyes.'},issues:[{kind:'ambiguity',...anchor,message:'The source gives two eye-color alternatives.'}]});
    expect(result.tags.map(t=>t.name)).toEqual(['red_hair']);expect(result.prose).toContain('Blue or grey eyes');expect(result.issues[0].evidence).toEqual(['Blue or grey eyes.']);
  }
});
test('a malformed or invented uncertainty note no longer costs the whole result',async()=> {
  const traits=[{id:'hair',group:'hair',evidence:'Red hair.',tags:['red_hair'],detail:'Red hair'},{id:'face',group:'face',evidence:'A narrow face.',tags:['narrow_face'],detail:'A narrow face'}];
  const source='Red hair. A narrow face.';
  const located=await run(source,{traits},{captions:{character:source},issues:[{kind:'warning',evidence:['Red hair.'],message:'Review this interpretation.'}]});
  expect(located.result.tags.map(t=>t.name)).toEqual(['narrow_face']);expect(located.result.issues).toEqual([]);expect(located.result.notices.join(' ')).toContain('malformed uncertainty note');
  for(const issue of [{kind:'ambiguity or contradiction',evidence:[],message:'A possible conflict.'},{kind:'contradiction',evidence:['blue eyes'],message:'Two colors.'},{kind:'ambiguity',evidence:['Red hair.'],message:'Age not specified.'}]) {
    const {result}=await run(source,{traits},{captions:{character:source},issues:[issue]});
    expect(result.tags.map(t=>t.name)).toEqual(['red_hair','narrow_face']);expect(result.issues).toEqual([]);expect(result.notices.length).toBeGreaterThan(0);
  }
});
test('non-generative models blocked without guessed model IDs',()=> {
  expect(isGenerative('typesafe/jev-1.13')).toBe(false);expect(isGenerative('openai/luna-decisions')).toBe(false);expect(isGenerative('text-embedding')).toBe(false);expect(isGenerative('provider/generative-text')).toBe(true);
});
