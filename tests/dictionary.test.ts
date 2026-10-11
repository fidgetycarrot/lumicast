import {test,expect} from 'bun:test';
import {BooruDictionary} from '../src/dictionary';
const signal=()=>new AbortController().signal;
test('active alias resolves, fetches wiki and caches metadata',async()=> {
  const seen:string[]=[];
  const d=new BooruDictionary(async url=> {
    seen.push(url);const u=new URL(url);let value:unknown=[];
    if(u.pathname==='/tag_aliases.json'&&u.searchParams.get('search[antecedent_name]')==='gray_hair')value=[{antecedent_name:'gray_hair',consequent_name:'grey_hair',status:'active'}];
    if(u.pathname==='/tags.json')value=[{name:'grey_hair',category:0,post_count:100}];
    if(u.pathname==='/wiki_pages.json')value=[{title:'grey_hair',body:'Grey colored hair.'}];
    return {status:200,body:JSON.stringify(value)};
  },undefined,0);
  const r=await d.resolve('gray hair',signal());expect(r?.name).toBe('grey_hair');expect(r?.aliasFrom).toBe('gray_hair');expect(r?.wiki).toBe('Grey colored hair.');
  const count=seen.length;await d.resolve('gray_hair',signal());expect(seen.length).toBe(count);
  expect(seen.every(v=>new URL(v).hostname==='danbooru.donmai.us')).toBe(true);
});
test('Gelbooru spelling preferred only after alias equivalence and live exact match',async()=> {
  const d=new BooruDictionary(async url=> {
    const u=new URL(url);let value:unknown=[];
    if(u.pathname==='/tag_aliases.json'&&u.searchParams.get('search[antecedent_name]')==='large_breasts')value=[{antecedent_name:'large_breasts',consequent_name:'big_breasts',status:'active'}];
    if(u.pathname==='/tags.json')value=[{name:'big_breasts',category:0,post_count:100}];
    if(u.hostname==='gelbooru.com'){expect(u.searchParams.get('api_key')).toBe('test-key');value={tag:[{name:'large_breasts',type:0,count:100,ambiguous:0}]};}
    return {status:200,body:JSON.stringify(value)};
  },{user:'123',key:'test-key'},0);
  expect((await d.resolve('large_breasts',signal()))?.name).toBe('large_breasts');
});
test('bad Gelbooru credentials keep Danbooru with clear notice',async()=> {
  const d=new BooruDictionary(async url=>new URL(url).hostname==='gelbooru.com'?{status:401,body:'secret-test-key'}:{status:200,body:JSON.stringify(url.includes('/tags.json')?[{name:'blue_eyes',category:0,post_count:1}]:[])},{user:'1',key:'secret-test-key'},0);
  expect((await d.resolve('blue_eyes',signal()))?.source).toBe('Danbooru');expect([...d.notices].join(' ')).not.toContain('secret-test-key');expect(d.notices.size).toBe(1);expect([...d.notices][0]).toContain('HTTP 401: it rejected the user ID or API key');
});
test('deprecated, nonexistent and artist tags cannot auto-verify',async()=> {
  for(const row of [null,{name:'x',category:1,post_count:1},{name:'x',category:0,post_count:1,is_deprecated:true},{name:'x',category:0,post_count:0}]) {
    const d=new BooruDictionary(async url=>({status:200,body:JSON.stringify(url.includes('/tags.json')&&row?[row]:[])}),undefined,0);
    expect(await d.resolve('x',signal())).toBeNull();
  }
});
test('search is metadata only and escapes wildcard injection',async()=> {
  const seen:string[]=[];const d=new BooruDictionary(async url=>{seen.push(url);return{status:200,body:'[]'};},undefined,0);
  await d.search('blue hair',signal());expect(new URL(seen[0]).searchParams.get('search[name_matches]')).toBe('blue_hair*');
  await expect(d.search('x*',signal())).rejects.toThrow();expect(seen.some(v=>v.includes('posts'))).toBe(false);
});
test('bad network response does not become a verified tag',async()=> {
  const d=new BooruDictionary(async()=>({status:200,body:'<html>challenge</html>'}),undefined,0);
  await expect(d.resolve('blue_eyes',signal())).rejects.toThrow('Invalid tag service');
});
test('cup labels cannot be verified manually or appear in tag search',async()=> {
  const seen:string[]=[];const d=new BooruDictionary(async url=>{seen.push(url);return{status:200,body:JSON.stringify([{name:'b_cup',category:0,post_count:100},{name:'tea_cup',category:0,post_count:100}])};},undefined,0);
  for(const name of ['B cup','B-cup','cup_b','ddd_cup'])expect(await d.resolve(name,signal())).toBeNull();
  expect(seen).toEqual([]);expect((await d.search('b',signal())).map(t=>t.name)).toEqual(['tea_cup']);
});
test('a live tag skips the alias lookup: two requests, not three',async()=> {
  const seen:string[]=[];
  const d=new BooruDictionary(async url=>{seen.push(new URL(url).pathname);return{status:200,body:JSON.stringify(url.includes('/tags.json')?[{name:'blue_eyes',category:0,post_count:1}]:url.includes('/wiki_pages.json')?[{title:'blue_eyes',body:'Blue eyes.'}]:[])};},undefined,0);
  expect((await d.resolve('blue_eyes',signal()))?.wiki).toBe('Blue eyes.');expect(seen).toEqual(['/tags.json','/wiki_pages.json']);
});
