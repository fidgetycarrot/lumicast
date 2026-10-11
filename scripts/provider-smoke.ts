import {BooruDictionary} from '../src/dictionary';
import {Translator} from '../src/engine';
import {isGenerative} from '../src/contracts';
import {cases} from '../tests/fixtures';
const key=process.env.LUMICAST_SMOKE_API_KEY;
const model=process.env.LUMICAST_SMOKE_MODEL;
const endpoint=new URL(process.env.LUMICAST_SMOKE_URL ?? 'https://openrouter.ai/api/v1/chat/completions');
if(!key||!model||!isGenerative(model))throw new Error('Set LUMICAST_SMOKE_API_KEY and LUMICAST_SMOKE_MODEL to a generative text model.');
if(endpoint.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(endpoint.hostname)&&endpoint.protocol==='http:'))throw new Error('Use HTTPS, or localhost for a local test provider.');
const dictionary=new BooruDictionary(async url=> {
  const r=await fetch(url,{signal:AbortSignal.timeout(15_000),redirect:'error',headers:{Accept:'application/json','User-Agent':'LumiCast/0.1.3 (tag metadata client)'}});
  return{status:r.status,body:await r.text()};
});
const engine=new Translator(async(system,input,signal)=> {
  const r=await fetch(endpoint,{method:'POST',signal,redirect:'error',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:input}],max_tokens:6000})});
  if(!r.ok)throw new Error(`Provider HTTP ${r.status}. No response body printed.`);
  const value=await r.json() as {choices?:{message?:{content?:string};finish_reason?:string}[]};
  const c=value.choices?.[0];if(typeof c?.message?.content!=='string'||c.finish_reason==='length')throw new Error('Empty or truncated provider output.');
  return c.message.content;
},dictionary);
console.log(`Runs ${cases.length} synthetic descriptions; up to ${cases.length*2} paid generation calls. No automatic retries.`);
let failed=0;
for(const fixture of cases) {
  try {
    const result=await engine.translate(fixture.source,AbortSignal.timeout(240_000),model);
    // These are hard grounding checks, not a measurement of Anima image fidelity.
    if(!result.prompt.trim())throw new Error('Empty prompt.');
    // A fully covered fact can be absent from prose. Literal evidence remains
    // outside the assembled prompt; overlap checks do not prove completeness.
    for(const trait of fixture.traits)if(!result.evidence.some(t=>t.evidence.includes(trait.evidence)||trait.evidence.includes(t.evidence)))throw new Error('A fixture detail was not represented in the extracted evidence.');
    if(fixture.name.includes('sparse')&&result.issues.length)throw new Error('Sparse input produced uncertainty.');
    if(fixture.name.includes('negation')&&result.tags.some(t=>t.name==='wolf_ears'))throw new Error('Metaphor became anatomy.');
    if(fixture.name.includes('personality-heavy')&&(result.tags.some(t=>/(?:cup|breasts)/.test(t.name))||/know-it-all|you know\?|psych major/i.test(result.prompt)))throw new Error('Narration or a measurement became a visual tag.');
    console.log(`PASS: ${fixture.name} (${result.tags.length} tags, ${result.issues.length} issues)`);
  }catch{failed++;console.log(`FAIL: ${fixture.name}. Inspect with your provider; response and credentials are not logged.`);}
}
if(failed)throw new Error(`${failed} provider smoke cases need review.`);
