import { test, expect } from 'bun:test';
import { Translator, parseExtraction, removeConflicts } from '../src/engine';
import { assemble, cupSize, editList, heightCm, formatWeighted, inScope, isGenerative, parseWeighted, type TagDictionary, type TagRow, type TranslateOptions } from '../src/contracts';
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
  const traits=[{id:'1',group:'subject',evidence:'femboy',tags:['trap'],detail:'A feminine-presenting young man'},{id:'2',group:'hair',evidence:'silver hair',tags:['silver_hair'],detail:'Silver hair'}];
  const without=await run('He has silver hair.',{traits},{});
  expect(without.result.tags.map(t=>t.name)).toEqual(['silver_hair']);expect(JSON.parse(without.inputs[0])).toEqual({description:'He has silver hair.'});
  const withType=await run('He has silver hair.',{traits},{captions:{character:'A feminine-presenting young man with silver hair.'}},{stated:' femboy, android '});
  expect(withType.result.prompt).toBe('trap, silver hair\n\nA feminine-presenting young man with silver hair.');
  expect(JSON.parse(withType.inputs[0]).stated).toBe('femboy, android');expect(withType.result.notices.join(' ')).not.toContain('left out');
  await expect(run('x',{traits},{},{stated:'y'.repeat(301)})).rejects.toThrow('Invalid known facts');
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
  expect(result.tags.map(t=>t.name)).toEqual(['grey_hair']);expect(result.notices.join(' ')).toContain('“made_up_tag” is not a live booru tag');
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
test('weights parse, survive assembly, and reject nonsense',()=> {
  expect(parseWeighted('(trap:1.4)')).toEqual({name:'trap',weight:1.4});expect(parseWeighted('( Red Hair : 2 )')).toEqual({name:'red_hair',weight:2});
  expect(parseWeighted('(trap:1)')).toEqual({name:'trap'});expect(parseWeighted('trap_(object)')).toEqual({name:'trap_(object)'});
  expect(()=>parseWeighted('(trap:9)')).toThrow('between 0.1 and 3');expect(()=>parseWeighted('(trap:0)')).toThrow();
  expect(formatWeighted({name:'red_hair',weight:1.4})).toBe('(red_hair:1.4)');
  expect(assemble(['(red_hair:1.4)','red hair','score_7',{name:'blue_eyes',weight:2}],'A face.')).toBe('(red hair:1.4), score_7, (blue eyes:2)\n\nA face.');
});
test('a weight reaches the prompt only when the user\'s notes give that number',async()=> {
  const extraction={traits:[{id:'1',group:'hair',evidence:'red hair',tags:['(red_hair:1.4)','(short_hair:2)'],detail:'Red hair'}]};
  expect((await run('red hair',extraction,{})).result.prompt).toBe('red hair, short hair\n\nRed hair.');
  const noted=await run('red hair',extraction,{},{notes:'Weight red_hair at 1.4 for redheads.'});
  expect(noted.result.prompt).toBe('(red hair:1.4), short hair\n\nRed hair.');expect(noted.result.tags[0].weight).toBe(1.4);
  expect(JSON.parse(noted.inputs[0])).toEqual({notes:'Weight red_hair at 1.4 for redheads.',description:'red hair'});
  // A note is quotable evidence, so a tag the note asks for is grounded.
  const fromNote=await run('An android.',{traits:[{id:'1',group:'body',evidence:'add panel seams',tags:['panel_lines'],detail:'Visible panel seams'}]},{},{notes:'Androids: add panel seams.'});
  expect(fromNote.result.tags.map(t=>t.name)).toEqual(['panel_lines']);
});
const refineWith=(response:unknown,input:Partial<Parameters<Translator['refine']>[0]>={},dict=dictionary)=> {
  const inputs:string[]=[];
  return new Translator(async(_s,i)=>{inputs.push(i);return typeof response==='string'?response:JSON.stringify(response);},dict)
    .refine({tags:['1boy','(trap:1.4)','blue_eyes'],caption:'A slender young man.',feedback:'Reads too masculine and the eyes should be purple.',...input},signal(),'model').then(result=>({result,inputs}));
};
test('refine proposes only grounded changes: known tags to remove or weight, verified tags to add',async()=> {
  const dict={...dictionary,resolve:async(name:string)=>name==='very_feminine_boy'?null:{...(await dictionary.resolve(name==='violet_eyes'?'purple_eyes':name,signal()))!,wiki:'Eyes that are   coloured purple.'}};
  const {result,inputs}=await refineWith({reply:'The type tag is being outweighed.',
    remove:[{tag:'blue_eyes',why:'pulls the wrong colour'},{tag:'green_eyes',why:'not in the prompt'}],
    weight:[{tag:'trap',weight:1.8,why:'still ignored'},{tag:'1boy',weight:44,why:'bad number'},{tag:'not_here',weight:1.5}],
    add:[{tag:'violet_eyes',weight:1.3,why:'asked colour'},{tag:'purple_eyes',why:'duplicate after alias'},{tag:'very_feminine_boy',why:'guess'},{tag:'1boy',why:'already there'},{tag:'androgynous',weight:null,why:'softens the read'}],
    caption:'A slender, feminine young man with purple_eyes.'},{description:'desc',stated:'femboy',notes:'my notes'},dict);
  expect(JSON.parse(inputs[0])).toEqual({tags:['1boy','(trap:1.4)','blue_eyes'],caption:'A slender young man.',feedback:'Reads too masculine and the eyes should be purple.',description:'desc',stated:'femboy',notes:'my notes'});
  expect(result.reply).toBe('The type tag is being outweighed.');
  expect(result.proposals.map(p=>[p.kind,p.tag,p.weight])).toEqual([['remove','blue_eyes',undefined],['weight','trap',1.8],['add','purple_eyes',1.3],['add','androgynous',undefined],['caption',undefined,undefined]]);
  expect(result.proposals[2].definition).toBe('Eyes that are coloured purple.');expect(result.proposals[4].caption).toBe('A slender, feminine young man with purple eyes.');
  expect(result.notices.join(' ')).toContain('“very_feminine_boy” is not a live booru tag');
});
test('refine handles vague feedback, empty input and bad output without inventing changes',async()=> {
  const vague=await refineWith({reply:'Which part looked wrong: the face, the body or the clothing?',remove:[],add:[],weight:[],caption:null});
  expect(vague.result.proposals).toEqual([]);expect(vague.result.reply).toContain('Which part');
  expect((await refineWith({})).result.reply).toContain('no changes');
  expect((await refineWith({caption:'A slender young man.'})).result.proposals).toEqual([]);
  await expect(refineWith({}, {feedback:'  '})).rejects.toThrow('say what the image got wrong');
  await expect(refineWith('not json')).rejects.toThrow('valid translator JSON');
  await expect(refineWith({}, {tags:['(trap:9)']})).rejects.toThrow('between 0.1 and 3');
  const offline=await refineWith({add:[{tag:'purple_eyes',why:'x'}]},{},{...dictionary,resolve:async()=>{throw new Error('offline');}});
  expect(offline.result.proposals).toEqual([]);expect(offline.result.notices.join(' ')).toContain('tag service was unavailable');
});
test('Lumi Studio sheet: fields the character editor takes, with phrases only for what tags do not say',async()=> {
  const fixture=cases.find(c=>c.name.startsWith('type tags'))!;
  const {result}=await run(fixture.source,{traits:fixture.traits},{drop:[],captions:{},sheet:{
    subject:'Adult male android.',
    character:['Short hair','engineered hourglass silhouette, narrow shoulders','He has pale polymer skin.','silver_hair','a 99cm waist','x'.repeat(81),'very narrow waist','wide flared hips','choppy silver-white hair','a','b','c'],
    outfit:['sheer black thigh-high stockings','no shoes'],
  }},{scope:'character',notes:'Weight trap at 1.4.'});
  expect(result.sheet).toEqual({
    countTag:'1boy',subject:'adult male android',always:'android, trap',
    appearance:'narrow waist, wide hips, silver hair, short hair, engineered hourglass silhouette, narrow shoulders, pale polymer skin, choppy silver-white hair, a, b',
    outfit:'thighhighs, black thighhighs, no shoes, sheer black thigh-high stockings',anatomy:'',
  });
  // The sheet does not depend on the Include choice, and never carries solo or scene detail.
  expect((await run(fixture.source,{traits:fixture.traits},{},{scope:'scene'})).result.sheet).toEqual({countTag:'1boy',subject:'',always:'android, trap',appearance:'narrow waist, wide hips, silver hair, short hair',outfit:'thighhighs, black thighhighs, no shoes',anatomy:''});
  const weighted=await run('He is a femboy with silver hair.',{traits:[{id:'1',group:'subject',evidence:'femboy',tags:['1boy','(trap:1.4)'],detail:'A feminine young man'}]},{},{notes:'Weight trap at 1.4.'});
  expect(weighted.result.sheet.always).toBe('(trap:1.4)');expect(weighted.result.sheet.countTag).toBe('1boy');
});
test('sheet fields take the same tag edits as the tags box',()=> {
  const changes=[{kind:'remove',tag:'blue_eyes'},{kind:'weight',tag:'silver_hair',weight:1.5},{kind:'weight',tag:'trap',weight:1},{kind:'add',tag:'panel_lines'},{kind:'caption'}];
  expect(editList('silver hair, Blue Eyes, (trap:1.4), choppy silver-white hair',changes,true)).toBe('(silver hair:1.5), trap, choppy silver-white hair, panel lines');
  expect(editList('thighhighs',changes)).toBe('thighhighs');expect(editList('',changes)).toBe('');
});
test('gaps: missing anchors come from plain checks, vague traits from review, and neither changes the output',async()=> {
  const narrated=cases.find(c=>c.name.includes('character only'))!;
  expect((await run(narrated.source,{traits:narrated.traits},{})).result.gaps).toEqual([]);
  const traits=[{id:'s',group:'subject',evidence:'She',tags:['1girl'],detail:'A woman'},{id:'h',group:'hair',evidence:'near-black hair',tags:['black_hair'],detail:'Near-black hair'},{id:'l',group:'face',evidence:'gradient lips',tags:[],detail:'Full gradient lips'},{id:'m',group:'moment',evidence:'dark eyes',tags:[],detail:'Dark, tired eyes'}];
  const source='She has near-black hair, gradient lips and dark eyes.';
  const plain=await run(source,{traits},{});
  const flagged=await run(source,{traits},{vague:[{traitId:'l',what:'lips',why:'a gradient is named but no colours'},{traitId:'m',what:'eyes',why:'scene trait'},{traitId:'nope',what:'x',why:'y'},{traitId:'l',what:'lips',why:'again'}]});
  expect(flagged.result.gaps).toEqual([
    {kind:'missing',what:'hair length',note:'The image model will pick one, and not the same one each time.'},
    {kind:'missing',what:'eye colour',note:'The image model will pick one, and not the same one each time.'},
    {kind:'vague',what:'lips',note:'a gradient is named but no colours'}]);
  expect(flagged.result.prompt).toBe(plain.result.prompt);expect(flagged.result.sheet).toEqual(plain.result.sheet);expect(flagged.result.issues).toEqual([]);
  // A colour or length stated only in words counts, as does one supplied through Known facts.
  const worded=await run('Lavender hair cropped at the chin. Amber eyes.',{traits:[{id:'h',group:'hair',evidence:'Lavender hair cropped at the chin.',tags:[],detail:'Lavender hair cropped at the chin'},{id:'e',group:'face',evidence:'Amber eyes.',tags:[],detail:'Amber eyes'}]},{});
  expect(worded.result.gaps.map(g=>g.what)).toEqual(['man, woman or other']);
  const bald=await run('A bald man with a scarred jaw.',{traits:[{id:'s',group:'subject',evidence:'A bald man',tags:['1boy','bald'],detail:'A bald man'}]},{});
  expect(bald.result.gaps.map(g=>g.what)).toEqual(['eye colour']);
});
test('1other is flagged for a second look, never silently changed',async()=> {
  const {result}=await run('The android has silver hair cut short and amber eyes.',{traits:[{id:'s',group:'subject',evidence:'The android',tags:['1other','android'],detail:'An android'},{id:'h',group:'hair',evidence:'silver hair cut short',tags:['silver_hair','short_hair'],detail:'Short silver hair'},{id:'e',group:'face',evidence:'amber eyes',tags:[],detail:'Amber eyes'}]},{});
  expect(result.sheet.countTag).toBe('1other');expect(result.gaps).toEqual([{kind:'vague',what:'man, woman or other',note:expect.stringContaining('1boy or 1girl')}]);
});
test('a guess the boorus lack is kept as plain words in the sheet, not lost',async()=> {
  const traits=[{id:'s',group:'subject',evidence:'He',tags:['1boy','synthetic_humanoid'],detail:'A synthetic man'},
    {id:'h',group:'hair',evidence:'silver hair',tags:['silver_hair','short_hair'],detail:'Short silver hair'},
    {id:'e',group:'face',evidence:'violet eyes',tags:['violet_eyes'],detail:'Violet eyes'},
    {id:'k',group:'body',evidence:'porcelain skin',tags:['porcelain_skin'],detail:'Porcelain skin'},
    {id:'m',group:'moment',evidence:'overheating',tags:['overheating'],detail:'Overheating'},
    {id:'o',group:'outfit',evidence:'a maid collar',tags:['maid_collar'],detail:'A maid collar'}];
  const live=new Set(['1boy','short_hair']);
  const dict={...dictionary,resolve:async(name:string)=>live.has(name)?dictionary.resolve(name,signal()):null};
  const {result}=await run('He has silver hair, violet eyes, porcelain skin, a maid collar, overheating.',{traits},{sheet:{character:['choppy silver hair cut short','violet eyes']}},undefined,dict);
  expect(result.sheet.always).toBe('synthetic humanoid');expect(result.sheet.outfit).toBe('maid collar');
  // "silver hair" is inside the reviewer's longer phrase, so it is not repeated; "violet eyes" appears once.
  expect(result.sheet.appearance).toBe('short hair, porcelain skin, violet eyes, choppy silver hair cut short');
  expect(result.tags.map(t=>t.name)).toEqual(['1boy','short_hair']);expect(result.prompt).not.toContain('violet');
  expect(result.notices).toContain('“silver_hair” is not a live booru tag, so the sheet keeps it as the plain words “silver hair”.');
  expect(result.notices).toContain('“overheating” is not a live booru tag and was left out.');
  expect(result.gaps.map(g=>g.what)).toEqual([]);
});
test('refine never drops a defining tag unless the feedback names it, and passes the lock to the model',async()=> {
  const response={reply:'Android is diluted.',remove:[{tag:'trap',why:'pulls toward human'},{tag:'blue_eyes',why:'wrong colour'}],weight:[{tag:'android',weight:1.4,why:'weak'}],add:[],caption:null};
  const {result,inputs}=await refineWith(response,{tags:['1boy','android','trap','blue_eyes'],locked:['android','trap'],feedback:'Android features are weak.'});
  expect(JSON.parse(inputs[0]).locked).toEqual(['android','trap']);
  expect(result.proposals.map(p=>[p.kind,p.tag])).toEqual([['remove','blue_eyes'],['weight','android']]);
  expect(result.notices.join(' ')).toContain('A suggestion to remove “trap” was set aside');
  const named=await refineWith(response,{tags:['1boy','android','trap'],locked:['android','trap'],feedback:'Drop the trap look, he should read as a plain android.'});
  expect(named.result.proposals.map(p=>[p.kind,p.tag])).toEqual([['remove','trap'],['weight','android']]);
});
test('Known facts close a gap even when the model files the fact under the wrong group',async()=> {
  const traits=[{id:'s',group:'subject',evidence:'He is a massive man',tags:['1boy'],detail:'A massive man'},{id:'k',group:'subject',evidence:'brown hair, blue eyes',tags:[],detail:'Brown hair and blue eyes'}];
  const without=await run('He is a massive man.',{traits:[traits[0]]},{});
  expect(without.result.gaps.map(g=>g.what)).toEqual(['hair colour','hair length','eye colour']);
  const withFacts=await run('He is a massive man.',{traits},{},{stated:'short messy brown hair, blue eyes'});
  expect(withFacts.result.gaps).toEqual([]);
});
test('an unusual height becomes a tall tag; ordinary, mixed and absent heights add nothing',async()=> {
  expect(heightCm('24 years old, 6\'8" (203 cm), 285 lbs')).toBe(203);expect(heightCm('6 ft 2')).toBe(188);expect(heightCm('5\'4", petite')).toBe(163);
  expect(heightCm('180 cm, though her sister is 5\'1"')).toBe('mixed');expect(heightCm('a 9.6 inch blade, size-15 trainers')).toBeNull();
  const man=[{id:'s',group:'subject',evidence:'Jason Slatz',tags:['1boy'],detail:'A 24-year-old man'},{id:'b',group:'body',evidence:'Broad chest',tags:['broad_shoulders','muscular_male'],detail:'A broad chest'}];
  const source='Jason Slatz, 6\'8" (203 cm). Broad chest.';
  const {result}=await run(source,{traits:man},{});
  expect(result.sheet.appearance).toBe('broad shoulders, muscular male, tall male, very tall');expect(result.tags.map(t=>t.name)).toContain('tall_male');
  expect(result.notices).toContain('A height of 203 cm was converted to tall_male and “very tall”.');
  const woman=await run('She is 5\'11".',{traits:[{id:'s',group:'subject',evidence:'She',tags:['1girl'],detail:'A woman'}]},{});
  expect(woman.result.tags.map(t=>t.name)).toEqual(['1girl','tall_female']);expect(woman.result.sheet.appearance).toBe('');
  expect((await run('Jason Slatz is 5\'9". Broad chest.',{traits:man},{})).result.tags.map(t=>t.name)).not.toContain('tall_male');
});
test('explicit anatomy goes to its own sheet field and never into the saved look or a character-only prompt',async()=> {
  const traits=[{id:'s',group:'subject',evidence:'the man',tags:['1boy'],detail:'A man'},{id:'b',group:'body',evidence:'Broad chest',tags:['muscular_male'],detail:'A broad chest'},
    {id:'a',group:'anatomy',evidence:'packing',tags:['large_penis'],detail:'Large genitals'},{id:'h',group:'hair',evidence:'brown hair',tags:['brown_hair','short_hair'],detail:'Short brown hair'},{id:'e',group:'face',evidence:'blue eyes',tags:['blue_eyes'],detail:'Blue eyes'}];
  const {result}=await run('the man. Broad chest, packing, short brown hair, blue eyes.',{traits},{sheet:{anatomy:['uncut']}});
  expect(result.sheet.anatomy).toBe('large penis, uncut');expect(result.sheet.appearance).not.toContain('penis');
  expect(result.prompt).not.toContain('penis');expect(result.views.outfit.prompt).not.toContain('penis');expect(result.views.scene.prompt).toContain('large penis');
  expect(result.gaps).toEqual([]);
});
