import {test,expect} from 'bun:test';
import {BooruDictionary,testGelbooru} from '../src/dictionary';
import {gelCredentials} from '../src/contracts';
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
  // Danbooru lacks the tag, so Gelbooru is asked, and refuses.
  const d=new BooruDictionary(async url=>new URL(url).hostname==='gelbooru.com'?{status:401,body:'secret-test-key'}:{status:200,body:'[]'},{user:'1',key:'secret-test-key'},0);
  expect(await d.resolve('silver_hair',signal())).toBeNull();expect([...d.notices].join(' ')).not.toContain('secret-test-key');expect(d.notices.size).toBe(1);expect([...d.notices][0]).toContain('HTTP 401: it rejected the user ID or API key');
});
test('Gelbooru is asked only when Danbooru lacks a tag or knows it by another name',async()=> {
  const hosts:string[]=[];
  const d=new BooruDictionary(async url=>{const u=new URL(url);hosts.push(`${u.hostname}${u.pathname}`);
    if(u.hostname==='gelbooru.com')return{status:200,body:JSON.stringify({tag:[{name:u.searchParams.get('name'),type:0,count:9,ambiguous:0}].filter(t=>t.name==='silver_hair')})};
    return{status:200,body:JSON.stringify(u.pathname==='/tags.json'&&u.searchParams.get('search[name]')==='blue_eyes'?[{name:'blue_eyes',category:0,post_count:5}]:[])};},{user:'1',key:'k'},0);
  expect((await d.resolve('blue_eyes',signal()))?.source).toBe('Danbooru');expect(hosts.some(h=>h.startsWith('gelbooru'))).toBe(false);
  const silver=await d.resolve('silver_hair',signal());expect(silver?.source).toBe('Gelbooru');expect(silver?.name).toBe('silver_hair');
});
test('each site has its own queue, so a slow site does not hold up the other',async()=> {
  const order:string[]=[];let release:()=>void=()=>{};
  const d=new BooruDictionary(async url=>{const host=new URL(url).hostname;
    if(host==='danbooru.donmai.us'&&url.includes('wiki_pages'))await new Promise<void>(r=>{release=r;});
    order.push(host);return{status:200,body:JSON.stringify(url.includes('/tags.json')?[{name:'red_hair',category:0,post_count:1}]:host==='gelbooru.com'?{tag:[]}:[])};},{user:'1',key:'k'},0);
  const slow=d.resolve('red_hair',signal());
  await Bun.sleep(5);
  const gel=await (d as unknown as {request(b:string,q:Record<string,string>,s:AbortSignal):Promise<unknown>}).request('https://gelbooru.com/index.php',{name:'x'},signal());
  expect(gel).toEqual({tag:[]});expect(order).toContain('gelbooru.com');release();await slow;
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
test('Gelbooru test names the cause without leaking the key, the ID or the reply body',async()=> {
  const creds={user:'123456',key:'abcdef0123456789secret'};const seen:string[]=[];
  const reply=(status:number,body:string)=>testGelbooru(async url=>{seen.push(url);return{status,body};},creds);
  const ok=await reply(200,JSON.stringify({'@attributes':{count:1},tag:[{name:'blue_eyes',count:2100000,type:0}]}));
  expect(ok).toEqual({ok:true,message:'Gelbooru accepted these credentials and returned blue_eyes (2100000 posts).'});
  const u=new URL(seen[0]);expect(u.hostname).toBe('gelbooru.com');expect(u.searchParams.get('user_id')).toBe('123456');expect(u.searchParams.get('api_key')).toBe(creds.key);expect(u.searchParams.get('name')).toBe('blue_eyes');
  expect((await reply(200,JSON.stringify([{name:'blue_eyes',count:5}]))).ok).toBe(true);
  const cases:[number,string,string][]=[
    [401,'<html><title>Unauthorized for abcdef0123456789secret user 123456</title>private body text</html>','rejected these credentials (HTTP 401)'],
    [403,'<html><title>Just a moment...</title></html>','refused the request (HTTP 403)'],
    [429,'','too many requests'],[503,'down','HTTP 503'],
    [200,'','the reply was empty'],[200,'<html><title>Gelbooru</title>login</html>','not with tag data'],
    [200,JSON.stringify({'@attributes':{count:0}}),'without the tag that was asked for (top-level fields: @attributes)'],
  ];
  for(const [status,body,expected] of cases) {
    const result=await reply(status,body);
    expect(result.ok).toBe(false);expect(result.message).toContain(expected);
    expect(result.message).not.toContain(creds.key);expect(result.message).not.toContain('123456');expect(result.message).not.toContain('private body text');
  }
  expect((await reply(403,'<html><title>Just a moment...</title></html>')).message).toContain('titled “Just a moment...”');
  expect((await testGelbooru(async()=>{throw new Error('ECONNREFUSED 10.0.0.1 key=abcdef');},creds)).message).toBe('The request never reached Gelbooru. This is the Lumiverse server’s network or its CORS proxy, not your credentials.');
  const none:string[]=[];
  expect((await testGelbooru(async url=>{none.push(url);return{status:200,body:'[]'};},{user:'',key:'k'})).message).toContain('Enter your Gelbooru user ID');
  expect((await testGelbooru(async url=>{none.push(url);return{status:200,body:'[]'};},{user:'eric',key:'k'})).message).toContain('must be the number');expect(none).toEqual([]);
});
test('Gelbooru\'s combined credential line is accepted in either box',()=> {
  expect(gelCredentials('','&api_key=abc123&user_id=42')).toEqual({user:'42',key:'abc123'});
  expect(gelCredentials('&api_key=abc123&user_id=42','')).toEqual({user:'42',key:'abc123'});
  expect(gelCredentials(' 42 ',' abc123 ')).toEqual({user:'42',key:'abc123'});
  expect(gelCredentials('7','&api_key=abc123&user_id=42')).toEqual({user:'42',key:'abc123'});
  expect(gelCredentials('','')).toEqual({user:'',key:''});
});
