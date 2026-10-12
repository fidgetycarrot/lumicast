import {BooruDictionary} from '../src/dictionary';
const dictionary=new BooruDictionary(async url=> {
  const response=await fetch(url,{signal:AbortSignal.timeout(15_000),redirect:'error',headers:{Accept:'application/json','User-Agent':'LumiCast/0.5.1 (tag metadata client)'}});
  return{status:response.status,body:await response.text()};
});
const signal=AbortSignal.timeout(60_000);
const blue=await dictionary.resolve('blue_eyes',signal);
if(blue?.name!=='blue_eyes'||!blue.wiki)throw new Error('Live blue_eyes lookup failed.');
const grey=await dictionary.resolve('gray_hair',signal);
if(grey?.name!=='grey_hair'||grey.aliasFrom!=='gray_hair')throw new Error('Live gray_hair alias lookup failed.');
const results=await dictionary.search('heterochromia',signal);
if(!results.some(r=>r.name==='heterochromia'))throw new Error('Live prefix search failed.');
const missing=await dictionary.resolve('lumicast_nonexistent_test_83d9',signal);
if(missing!==null)throw new Error('Unknown tag incorrectly accepted.');
console.log('PASS: live exact tag, wiki, active alias, prefix search and nonexistent-tag rejection.');
const gel=await fetch('https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&name=blue_eyes&limit=1',{signal:AbortSignal.timeout(15_000),redirect:'error'});
console.log(`Gelbooru without credentials: HTTP ${gel.status}. Authenticated Gelbooru not tested.`);
