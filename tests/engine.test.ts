import { test, expect } from 'bun:test';
import { Translator, parseExtraction, removeConflicts } from '../src/engine';
import { assemble, isGenerative, type TagDictionary, type TagRow } from '../src/contracts';
import { cases } from './fixtures';
const dictionary:TagDictionary={resolve:async name=>({name,source:'Danbooru',count:10,wiki:`Definition of ${name}`,url:'https://danbooru.donmai.us/wiki_pages/'+name}),search:async()=>[]};
for(const fixture of cases)test(fixture.name,async()=> {
  let calls=0;
  const engine=new Translator(async()=>JSON.stringify(++calls===1 ? {traits:fixture.traits}:{keep:fixture.keep,issues:fixture.issues??[]}),dictionary);
  const result=await engine.translate(fixture.source,new AbortController().signal,'fixture generative model');
  expect(calls).toBe(2);expect(result.tags.map(t=>t.name)).toEqual(fixture.keep);
  for(const trait of fixture.traits)expect(result.prompt).toContain(trait.evidence);
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
test('invented uncertainty or absent-attribute checklist rejected',async()=> {
  for(const issue of [{kind:'ambiguity',evidence:['red hair'],message:'Age not specified.'},{kind:'contradiction',evidence:['blue eyes'],message:'Two colors.'}]) {
    let n=0;const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'1',evidence:'red hair',tag:null}]}:{keep:[],issues:[issue]}),dictionary);
    await expect(engine.translate('red hair',new AbortController().signal,'model')).rejects.toThrow();
  }
});
test('dictionary outage retains source wording without unverified tags',async()=> {
  let n=0;const engine=new Translator(async()=>JSON.stringify(++n===1?{traits:[{id:'1',evidence:'red hair',tag:'red_hair'}]}:{keep:[],issues:[]}),{...dictionary,resolve:async()=>{throw new Error('offline');}});
  const result=await engine.translate('red hair',new AbortController().signal,'model');expect(result.prompt).toBe('red hair');expect(result.notices.length).toBe(1);
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
