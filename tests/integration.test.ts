import {test,expect,afterEach} from 'bun:test';
import {Window} from 'happy-dom';
import type {SpindleAPI,SpindleFrontendContext} from 'lumiverse-spindle-types';
import {setupBackend} from '../src/backend';
import {setup,createRpc} from '../src/frontend';
import type {Snapshot,Translation} from '../src/contracts';

function harness(provider='openrouter',model='test/generative') {
  const listeners=new Set<(payload:unknown)=>void>();
  let handler:((payload:unknown,user?:string,session?:string)=>void)|undefined;
  const storage=new Map<string,unknown>();const calls:unknown[]=[];const replies:{payload:unknown;user?:string;session?:string}[]=[];
  let fail=false,block=false;let latestSignal:AbortSignal|undefined;let responses:unknown[]|undefined;
  let gel:{status:number;body:string}|undefined;
  const api={
    permissions:{has:()=>true},
    userStorage:{getJson:async(path:string,o:{fallback:unknown;userId?:string})=>storage.get(`${o.userId}:${path}`)??o.fallback,setJson:async(path:string,value:unknown,o:{userId?:string})=>{storage.set(`${o.userId}:${path}`,value);}},
    connections:{list:async()=>[{id:'c1',name:'Fast text',provider,model},{id:'c2',name:'Classifier',provider:'openrouter',model:'typesafe/jev-1.13'}],get:async(id:string,user?:string)=>{calls.push(['connection',id,user]);return id==='c1'?{id,name:'Fast text',provider,model}:null;}},
    cors:async(url:string)=>{calls.push(['cors',url]);if(gel&&new URL(url).hostname==='gelbooru.com')return gel;return{status:200,body:JSON.stringify(url.includes('/tags.json')?[{name:new URL(url).searchParams.get('search[name]')??'red_hair',category:0,post_count:100}]:url.includes('/wiki_pages.json')?[{title:'red_hair',body:'Hair colored red.'}]:[])};},
    generate:{raw:async(input:{messages:{content:string}[];signal:AbortSignal;userId?:string;provider?:string;model?:string;connection_id?:string})=> {
      calls.push(['generation',input]);latestSignal=input.signal;
      // Mirror prepareRawCall: connection supplies credentials, input supplies model.
      if(input.model!==model||input.provider!==provider||input.connection_id!=='c1')throw new Error('API error 400: missing or invalid model');
      if(fail)throw new Error('Invalid API key SECRET-DO-NOT-LEAK');
      if(block)await new Promise((_,reject)=>input.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
      return{content:JSON.stringify(responses ? responses.shift() : input.messages[0].content.includes('one trait per visual fact')?{traits:[{id:'t1',group:'hair',evidence:'Short red hair.',tags:['red_hair'],detail:'Short red hair'}]}:{drop:[],captions:{character:'Short red hair.'},issues:[]}),finish_reason:'stop'};
    }},
    onFrontendMessage:(fn:typeof handler)=>{handler=fn;return()=>{handler=undefined;};},
    sendToFrontend:(payload:unknown,user?:string,options?:{frontendSessionId?:string})=>{replies.push({payload,user,session:options?.frontendSessionId});if(user==='u1'&&options?.frontendSessionId==='s1')listeners.forEach(fn=>fn(payload));},
  } as unknown as SpindleAPI;
  const root=document.createElement('div');document.body.append(root);
  const ctx={sendToBackend:(payload:unknown)=>handler?.(payload,'u1','s1'),onBackendMessage:(fn:(payload:unknown)=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},ui:{registerDrawerTab:()=>({root,destroy:()=>root.remove()})},dom:{addStyle:()=>()=>{}}} as unknown as SpindleFrontendContext;
  const stop=setupBackend(api);
  return{ctx,root,calls,replies,storage,stop,emit:(payload:unknown,user='u1',session='s1')=>handler?.(payload,user,session),setFail:()=>{fail=true;},setBlock:()=>{block=true;},setResponses:(values:unknown[])=>{responses=values;},setGel:(value:{status:number;body:string})=>{gel=value;},signal:()=>latestSignal};
}
const named=(root:Element,name:string)=>(root.querySelector(`[data-lc="${name}"]`)??root.querySelector(`[data-sheet="${name}"]`)) as HTMLTextAreaElement;
/** [description, tags, caption, appearance, outfit, prompt] */
const areasOf=(root:Element)=>['source','tags','prose','appearance','outfit','prompt'].map(name=>named(root,name));
const cleanups:(()=>void)[]=[];
afterEach(()=>{while(cleanups.length)cleanups.pop()!();});
function dom(){const window=new Window();Object.assign(globalThis,{document:window.document,navigator:window.navigator,Event:window.Event});cleanups.push(()=>{void window.happyDOM.abort();});}
async function until(predicate:()=>boolean){const start=Date.now();while(!predicate()){if(Date.now()-start>6000)throw new Error('UI did not settle');await Bun.sleep(10);}}
test('full panel → RPC → backend → editor smoke, copy and disposal',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const buttons=()=>Array.from(h.root.querySelectorAll('button'));const b=(name:string)=>buttons().find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);
  const select=h.root.querySelector('select')!;expect(select.options[2].disabled).toBe(true);select.value='c1';
  const areas=areasOf(h.root);areas[0].value='Short red hair.';b('Translate').click();
  await until(()=>!b('Translate').disabled);
  expect(areas[1].value).toBe('red_hair');expect(areas[2].value).toContain('Short red hair.');expect(areas[5].value).toBe('red hair\n\nShort red hair.');
  expect(h.calls.filter(v=>(v as unknown[])[0]==='generation').length).toBe(2);
  expect(h.replies.every(r=>r.user==='u1'&&r.session==='s1')).toBe(true);
  areas[1].value='blue_eyes';areas[1].dispatchEvent(new Event('input'));expect(b('Rebuild from tags + detail').disabled).toBe(true);
  let copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async(value:string)=>{copied=value;}},configurable:true});
  areas[5].value='My edited final prompt.';areas[5].dispatchEvent(new Event('input'));b('Copy prompt').click();await until(()=>!b('Copy prompt').disabled);expect(copied).toBe('My edited final prompt.');
});
test('provider error does not leak credentials and failed translation preserves edits',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const translate=Array.from(h.root.querySelectorAll('button')).find(b=>b.textContent==='Translate')!;
  await until(()=>!translate.disabled);h.root.querySelector('select')!.value='c1';
  const areas=areasOf(h.root);areas[0].value='Short red hair.';areas[5].value='Keep this edit.';h.setFail();translate.click();await until(()=>!translate.disabled);
  expect(h.root.textContent).not.toContain('SECRET-DO-NOT-LEAK');expect(h.root.textContent).toContain('AUTHENTICATION');expect(h.root.textContent).toContain('trait extraction');expect(areas[5].value).toBe('Keep this edit.');
});
test('per-user settings and secret never echoed in snapshot',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const rpc=createRpc(h.ctx);cleanups.push(()=>rpc.destroy());
  await rpc.request('save',{connectionId:'c1',gelUser:'123',gelKey:'private-gel-key'});
  const snapshot=await rpc.request<Snapshot>('snapshot');expect(snapshot.settings.hasGelKey).toBe(true);expect(JSON.stringify(snapshot)).not.toContain('private-gel-key');
  h.emit({type:'lumicast:request',id:'other-user',action:'snapshot'},'u2','s2');await until(()=>h.replies.some(r=>r.session==='s2'));
  const other=h.replies.find(r=>r.session==='s2')!.payload as {result:Snapshot};expect(other.result.settings.hasGelKey).toBe(false);
});
test('cancel only its own frontend session and generation scoped to authenticated user',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const rpc=createRpc(h.ctx);cleanups.push(()=>rpc.destroy());h.setBlock();
  const pending=rpc.request<Translation>('translate',{description:'Short red hair.',connectionId:'c1'}).catch(e=>e as Error);
  await until(()=>!!h.signal());
  const request=(h.calls.find(v=>(v as unknown[])[0]==='generation') as unknown[])[1] as {userId:string};expect(request.userId).toBe('u1');
  h.emit({type:'lumicast:request',id:'foreign-cancel',action:'cancel'},'u1','s2');expect(h.signal()!.aborted).toBe(false);
  await rpc.request('cancel');expect(h.signal()!.aborted).toBe(true);expect((await pending as Error).message).toContain('cancelled');
});
test('RPC expires and ignores unrelated response IDs',async()=> {
  let listener:((value:unknown)=>void)|undefined;
  const rpc=createRpc({sendToBackend:()=>{},onBackendMessage:fn=>{listener=fn;return()=>{};}},15);
  const pending=rpc.request('snapshot');listener?.({type:'lumicast:response',id:'foreign',result:true});await expect(pending).rejects.toThrow('did not respond');rpc.destroy();
});
test('direct DeepSeek v4 pro passes the saved provider/model on both raw calls',async()=> {
  dom();const h=harness('deepseek','deepseek-v4-pro');cleanups.push(h.stop);const rpc=createRpc(h.ctx);cleanups.push(()=>rpc.destroy());
  const result=await rpc.request<Translation>('translate',{description:'Short red hair.',connectionId:'c1'});
  expect(result.prompt).toContain('Short red hair.');
  const requests=h.calls.filter(v=>(v as unknown[])[0]==='generation').map(v=>(v as unknown[])[1] as {provider:string;model:string;connection_id:string;userId:string});
  expect(requests.length).toBe(2);
  for(const r of requests){expect(r.provider).toBe('deepseek');expect(r.model).toBe('deepseek-v4-pro');expect(r.connection_id).toBe('c1');expect(r.userId).toBe('u1');}
});
test('panel prompt omits narration and scene while the source passages stay visible; Include widens it',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const extraction={traits:[{id:'1',group:'hair',evidence:'Red hair, obviously!',tags:['red_hair'],detail:'Red hair'},{id:'2',group:'outfit',evidence:'a red hair ribbon',tags:['red_hair'],detail:'A ribbon'}]};
  h.setResponses([extraction,{drop:[],captions:{character:'Red hair.',outfit:'She wears a ribbon.'},issues:[]}]);
  const translate=Array.from(h.root.querySelectorAll('button')).find(b=>b.textContent==='Translate')!;
  await until(()=>!translate.disabled);h.root.querySelector('select')!.value='c1';
  const areas=areasOf(h.root);areas[0].value='Red hair, obviously! And a red hair ribbon.';translate.click();await until(()=>!translate.disabled);
  expect(areas[1].value).toBe('red_hair');expect(areas[2].value).toBe('Red hair.');expect(areas[5].value).toBe('red hair\n\nRed hair.');
  // The sources list covers what the sheet holds: the character and the outfit, whatever Include says.
  expect(h.root.querySelector('[data-lc="sources"]')?.textContent).toContain('Red hair, obviously!');expect(h.root.querySelector('[data-lc="sources"]')?.textContent).toContain('ribbon');expect(areas[5].value).not.toContain('ribbon');
  const scope=h.root.querySelectorAll('select')[1];expect(scope.value).toBe('character');areas[2].value='my edit';areas[2].dispatchEvent(new Event('input'));scope.value='outfit';scope.dispatchEvent(new Event('change'));
  expect(areas[2].value).toBe('Red hair. She wears a ribbon.');expect(h.calls.filter(v=>(v as unknown[])[0]==='generation').length).toBe(2);expect(h.root.textContent).toContain('manual edits there were replaced');expect(h.root.querySelector('[data-lc="sources"]')?.textContent).toContain('ribbon');
});
test('direct DeepSeek adapter tolerates string evidence without discarding the panel result',async()=> {
  dom();const h=harness('deepseek','deepseek-v4-pro');cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  h.setResponses([{traits:[{id:'1',group:'hair',evidence:'Short red hair.',tags:['red_hair'],detail:'Short red hair'}]},{drop:[],captions:{character:'Short red hair.'},issues:[{kind:'ambiguity',evidence:'Short red hair.',message:'Age not specified.'}]}]);
  const translate=Array.from(h.root.querySelectorAll('button')).find(b=>b.textContent==='Translate')!;
  await until(()=>!translate.disabled);h.root.querySelector('select')!.value='c1';
  const areas=areasOf(h.root);areas[0].value='Short red hair.';translate.click();await until(()=>!translate.disabled);
  expect(areas[1].value).toBe('red_hair');expect(areas[5].value).toBe('red hair\n\nShort red hair.');expect(h.root.textContent).not.toContain('Invalid uncertainty evidence');expect(h.root.textContent).toContain('missing-attribute note was ignored');
});
test('refine: typed feedback becomes verified, selectable changes; weights and notes carry through; copy buttons work',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  const [notes,source,tags,prose,appearance,outfit,prompt,feedback]=['notes','source','tags','prose','appearance','outfit','prompt','feedback'].map(name=>named(h.root,name));
  notes.value='Redheads: weight red_hair at 1.4.';b('Save notes').click();await until(()=>!b('Translate').disabled);
  expect(h.storage.get('u1:settings.json')).toMatchObject({notes:'Redheads: weight red_hair at 1.4.',connectionId:''});
  h.root.querySelector('select')!.value='c1';
  h.setResponses([{traits:[{id:'1',group:'hair',evidence:'Short red hair.',tags:['(red_hair:1.4)'],detail:'Short red hair'}]},{drop:[],captions:{character:'Short red hair.'},issues:[]},
    {reply:'The hair read as orange.',remove:[{tag:'made_up',why:'x'}],weight:[{tag:'red_hair',weight:1.8,why:'still too weak'}],add:[{tag:'red_hair',why:'dup'},{tag:'short_hair',weight:null,why:'length was lost'}],caption:'Short, vivid red hair.'}]);
  source.value='Short red hair.';b('Translate').click();await until(()=>!b('Translate').disabled);
  expect(tags.value).toBe('(red_hair:1.4)');expect(prompt.value).toBe('(red hair:1.4)\n\nShort red hair.');
  const sheetValue=(key:string)=>(h.root.querySelector(`[data-sheet="${key}"]`) as HTMLInputElement).value;
  expect(appearance.value).toBe('(red hair:1.4)');expect(outfit.value).toBe('');expect(sheetValue('countTag')).toBe('');
  expect(h.root.querySelector('.lc-gaps')!.textContent).toContain('Not stated: eye colour.');expect(h.root.querySelector('.lc-gaps')!.textContent).not.toContain('hair colour');
  (h.root.querySelector('[aria-label="Copy permanent appearance tags"]') as HTMLButtonElement).click();await until(()=>!b('Translate').disabled);expect(h.root.textContent).toContain('Permanent appearance tags copied.');
  const sent=h.calls.filter(v=>(v as unknown[])[0]==='generation').map(v=>((v as unknown[])[1] as {messages:{content:string}[]}).messages[1].content);
  expect(JSON.parse(sent[0]).notes).toBe('Redheads: weight red_hair at 1.4.');
  let copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async(value:string)=>{copied=value;}},configurable:true});
  b('Copy tags').click();await until(()=>!b('Translate').disabled);expect(copied).toBe('(red hair:1.4)');
  b('Copy detail').click();await until(()=>!b('Translate').disabled);expect(copied).toBe('Short red hair.');
  expect(b('Apply selected').disabled).toBe(true);
  feedback.value='Hair came out orange and long.';b('Suggest changes').click();await until(()=>!b('Translate').disabled);
  const refineInput=JSON.parse(((h.calls.filter(v=>(v as unknown[])[0]==='generation').pop() as unknown[])[1] as {messages:{content:string}[]}).messages[1].content);
  expect(refineInput.tags).toEqual(['(red_hair:1.4)']);expect(refineInput.feedback).toBe('Hair came out orange and long.');expect(refineInput.notes).toContain('Redheads');expect(refineInput.description).toBe('Short red hair.');
  const boxes=Array.from(h.root.querySelectorAll('.lc-proposal input')) as HTMLInputElement[];
  expect(Array.from(h.root.querySelectorAll('.lc-proposal strong')).map(n=>n.textContent)).toEqual(['Weight (red hair:1.8)','Add short hair','Replace the standalone detail']);
  expect(h.root.textContent).toContain('The hair read as orange.');expect(tags.value).toBe('(red_hair:1.4)');
  boxes[2].checked=false;b('Apply selected').click();await until(()=>!b('Translate').disabled);
  expect(tags.value).toBe('(red_hair:1.8), short_hair');expect(prose.value).toBe('Short red hair.');expect(prompt.value).toBe('(red hair:1.8), short hair\n\nShort red hair.');
  expect(feedback.value).toBe('');expect(h.root.querySelectorAll('.lc-proposal').length).toBe(0);
  expect(appearance.value).toBe('(red hair:1.8), short hair');
});
test('Test Gelbooru checks what is typed, falls back to the saved key, and saving accepts the pasted line',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  const inputs=Array.from(h.root.querySelectorAll('input')) as HTMLInputElement[];const key=inputs.find(i=>i.type==='password')!;const user=inputs[inputs.indexOf(key)-1];
  const gelCalls=()=>h.calls.filter(v=>(v as unknown[])[0]==='cors'&&String((v as unknown[])[1]).includes('gelbooru.com')).map(v=>new URL(String((v as unknown[])[1])));
  b('Test Gelbooru').click();await until(()=>!b('Translate').disabled);
  expect(h.root.textContent).toContain('✗ Enter your Gelbooru user ID and API key first.');expect(gelCalls().length).toBe(0);
  h.setGel({status:401,body:'<title>Nope</title>'});key.value='&api_key=feedbeef&user_id=77';
  b('Test Gelbooru').click();await until(()=>!b('Translate').disabled);
  expect(h.root.textContent).toContain('✗ Gelbooru rejected these credentials (HTTP 401)');expect(gelCalls()[0].searchParams.get('user_id')).toBe('77');expect(gelCalls()[0].searchParams.get('api_key')).toBe('feedbeef');
  expect(h.root.textContent).not.toContain('feedbeef');
  h.setGel({status:200,body:JSON.stringify({tag:[{name:'blue_eyes',count:9}]})});
  b('Test Gelbooru').click();await until(()=>!b('Translate').disabled);
  expect(h.root.textContent).toContain('✓ Gelbooru accepted these credentials and returned blue_eyes (9 posts). Save settings to start using them.');
  b('Save settings').click();await until(()=>!b('Translate').disabled);
  expect(h.storage.get('u1:settings.json')).toMatchObject({gelUser:'77',gelKey:'feedbeef'});expect(user.value).toBe('77');expect(key.value).toBe('');
  b('Test Gelbooru').click();await until(()=>!b('Translate').disabled);
  expect(h.root.textContent).toContain('returned blue_eyes (9 posts).');expect(h.root.textContent).not.toContain('Save settings to start using them');expect(gelCalls().pop()!.searchParams.get('api_key')).toBe('feedbeef');
});
test('a gap is answered where it is shown: the inline box mirrors Known facts and Translate again reruns',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  const hair={id:'1',group:'hair',evidence:'Short red hair.',tags:['red_hair','short_hair'],detail:'Short red hair'};
  h.setResponses([{traits:[hair]},{drop:[],captions:{},issues:[]},
    {traits:[{id:'0',group:'subject',evidence:'woman',tags:['1girl'],detail:'A woman'},hair,{id:'2',group:'face',evidence:'green eyes',tags:['green_eyes'],detail:'Green eyes'}]},{drop:[],captions:{},issues:[]},
    {reply:'Count fixed.',remove:[{tag:'1girl',why:'wrong'}],add:[{tag:'1boy',why:'he is male'},{tag:'freckles',why:'missing'}],weight:[],caption:null}]);
  named(h.root,'source').value='Short red hair.';b('Translate').click();await until(()=>!b('Translate').disabled);
  const gaps=h.root.querySelector('.lc-gaps')!;expect(gaps.textContent).toContain('Not stated: eye colour.');expect(gaps.textContent).toContain('Not stated: man, woman or other.');
  const inline=gaps.querySelector('input')!;inline.value='woman, green eyes';inline.dispatchEvent(new Event('input'));
  expect((named(h.root,'stated') as unknown as HTMLInputElement).value).toBe('woman, green eyes');
  b('Translate again').click();await until(()=>!b('Translate').disabled);
  const sent=h.calls.filter(v=>(v as unknown[])[0]==='generation').map(v=>((v as unknown[])[1] as {messages:{content:string}[]}).messages[1].content);
  expect(JSON.parse(sent[2]).stated).toBe('woman, green eyes');
  expect(h.root.querySelector('.lc-status')!.textContent).toContain('Translated again. Pinned down: man, woman or other, eye colour.');
  expect(h.root.querySelector('.lc-gaps')!.parentElement!.hasAttribute('hidden')).toBe(true);expect(named(h.root,'countTag').value).toBe('1girl');expect(named(h.root,'appearance').value).toBe('red hair, short hair, green eyes');
  // Refine works from the sheet, and a count change goes to the Count tag box only.
  named(h.root,'feedback').value='Came out as a woman.';b('Suggest changes').click();await until(()=>!b('Translate').disabled);
  const lastInput=JSON.parse(((h.calls.filter(v=>(v as unknown[])[0]==='generation').pop() as unknown[])[1] as {messages:{content:string}[]}).messages[1].content);
  expect(lastInput.tags).toEqual(['1girl','red_hair','short_hair','green_eyes']);expect(lastInput.locked).toBeUndefined();
  b('Apply selected').click();await until(()=>!b('Translate').disabled);
  expect(named(h.root,'countTag').value).toBe('1boy');expect(named(h.root,'appearance').value).toBe('red hair, short hair, green eyes, freckles');
  // The standalone prompt follows the same changes, the count included.
  expect(named(h.root,'tags').value).toBe('1boy, red_hair, short_hair, green_eyes, freckles');expect(named(h.root,'prompt').value).toBe('1boy, red hair, short hair, green eyes, freckles\n\nA woman. Short red hair. Green eyes.');
  expect(h.root.textContent).toContain('Changes applied to the Anima prompt and the character sheet.');
});
test('saved quality tags lead every Anima prompt and save without touching other settings',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  b('Save settings').click();await until(()=>!b('Translate').disabled);
  const quality=named(h.root,'quality');quality.value='masterpiece, best quality, score_9,';b('Save').click();await until(()=>!b('Translate').disabled);
  expect(h.storage.get('u1:settings.json')).toMatchObject({connectionId:'c1',quality:'masterpiece, best quality, score_9,'});
  named(h.root,'source').value='Short red hair.';b('Translate').click();await until(()=>!b('Translate').disabled);
  expect(named(h.root,'prompt').value).toBe('masterpiece, best quality, score_9, red hair\n\nShort red hair.');
  named(h.root,'tags').value='';named(h.root,'tags').dispatchEvent(new Event('input'));b('Rebuild from tags + detail').click();await until(()=>!b('Translate').disabled);
  expect(named(h.root,'prompt').value).toBe('masterpiece, best quality, score_9\n\nShort red hair.');
});
