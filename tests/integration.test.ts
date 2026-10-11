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
  const api={
    permissions:{has:()=>true},
    userStorage:{getJson:async(path:string,o:{fallback:unknown;userId?:string})=>storage.get(`${o.userId}:${path}`)??o.fallback,setJson:async(path:string,value:unknown,o:{userId?:string})=>{storage.set(`${o.userId}:${path}`,value);}},
    connections:{list:async()=>[{id:'c1',name:'Fast text',provider,model},{id:'c2',name:'Classifier',provider:'openrouter',model:'typesafe/jev-1.13'}],get:async(id:string,user?:string)=>{calls.push(['connection',id,user]);return id==='c1'?{id,name:'Fast text',provider,model}:null;}},
    cors:async(url:string)=>{calls.push(['cors',url]);return{status:200,body:JSON.stringify(url.includes('/tags.json')?[{name:new URL(url).searchParams.get('search[name]')??'red_hair',category:0,post_count:100}]:url.includes('/wiki_pages.json')?[{title:'red_hair',body:'Hair colored red.'}]:[])};},
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
  return{ctx,root,calls,replies,storage,stop,emit:(payload:unknown,user='u1',session='s1')=>handler?.(payload,user,session),setFail:()=>{fail=true;},setBlock:()=>{block=true;},setResponses:(values:unknown[])=>{responses=values;},signal:()=>latestSignal};
}
const cleanups:(()=>void)[]=[];
afterEach(()=>{while(cleanups.length)cleanups.pop()!();});
function dom(){const window=new Window();Object.assign(globalThis,{document:window.document,navigator:window.navigator,Event:window.Event});cleanups.push(()=>{void window.happyDOM.abort();});}
async function until(predicate:()=>boolean){const start=Date.now();while(!predicate()){if(Date.now()-start>6000)throw new Error('UI did not settle');await Bun.sleep(10);}}
test('full panel → RPC → backend → editor smoke, copy and disposal',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const buttons=()=>Array.from(h.root.querySelectorAll('button'));const b=(name:string)=>buttons().find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);
  const select=h.root.querySelector('select')!;expect(select.options[2].disabled).toBe(true);select.value='c1';
  const areas=Array.from(h.root.querySelectorAll('textarea')).slice(1);areas[0].value='Short red hair.';b('Translate').click();
  await until(()=>!b('Translate').disabled);
  expect(areas[1].value).toBe('red_hair');expect(areas[2].value).toContain('Short red hair.');expect(areas[3].value).toBe('red hair\n\nShort red hair.');
  expect(h.calls.filter(v=>(v as unknown[])[0]==='generation').length).toBe(2);
  expect(h.replies.every(r=>r.user==='u1'&&r.session==='s1')).toBe(true);
  areas[1].value='blue_eyes';areas[1].dispatchEvent(new Event('input'));expect(b('Rebuild from tags + detail').disabled).toBe(true);
  let copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async(value:string)=>{copied=value;}},configurable:true});
  areas[3].value='My edited final prompt.';areas[3].dispatchEvent(new Event('input'));b('Copy prompt').click();await until(()=>!b('Copy prompt').disabled);expect(copied).toBe('My edited final prompt.');
});
test('provider error does not leak credentials and failed translation preserves edits',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const translate=Array.from(h.root.querySelectorAll('button')).find(b=>b.textContent==='Translate')!;
  await until(()=>!translate.disabled);h.root.querySelector('select')!.value='c1';
  const areas=Array.from(h.root.querySelectorAll('textarea')).slice(1);areas[0].value='Short red hair.';areas[3].value='Keep this edit.';h.setFail();translate.click();await until(()=>!translate.disabled);
  expect(h.root.textContent).not.toContain('SECRET-DO-NOT-LEAK');expect(h.root.textContent).toContain('AUTHENTICATION');expect(h.root.textContent).toContain('trait extraction');expect(areas[3].value).toBe('Keep this edit.');
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
  const areas=Array.from(h.root.querySelectorAll('textarea')).slice(1);areas[0].value='Red hair, obviously! And a red hair ribbon.';translate.click();await until(()=>!translate.disabled);
  expect(areas[1].value).toBe('red_hair');expect(areas[2].value).toBe('Red hair.');expect(areas[3].value).toBe('red hair\n\nRed hair.');
  expect(h.root.querySelector('details:not(.lc-card)')?.textContent).toContain('Red hair, obviously!');expect(h.root.querySelector('details:not(.lc-card)')?.textContent).not.toContain('ribbon');
  const scope=h.root.querySelectorAll('select')[1];expect(scope.value).toBe('character');areas[2].value='my edit';areas[2].dispatchEvent(new Event('input'));scope.value='outfit';scope.dispatchEvent(new Event('change'));
  expect(areas[2].value).toBe('Red hair. She wears a ribbon.');expect(h.calls.filter(v=>(v as unknown[])[0]==='generation').length).toBe(2);expect(h.root.textContent).toContain('manual edits were replaced');expect(h.root.querySelector('details:not(.lc-card)')?.textContent).toContain('ribbon');
});
test('direct DeepSeek adapter tolerates string evidence without discarding the panel result',async()=> {
  dom();const h=harness('deepseek','deepseek-v4-pro');cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  h.setResponses([{traits:[{id:'1',group:'hair',evidence:'Short red hair.',tags:['red_hair'],detail:'Short red hair'}]},{drop:[],captions:{character:'Short red hair.'},issues:[{kind:'ambiguity',evidence:'Short red hair.',message:'Age not specified.'}]}]);
  const translate=Array.from(h.root.querySelectorAll('button')).find(b=>b.textContent==='Translate')!;
  await until(()=>!translate.disabled);h.root.querySelector('select')!.value='c1';
  const areas=Array.from(h.root.querySelectorAll('textarea')).slice(1);areas[0].value='Short red hair.';translate.click();await until(()=>!translate.disabled);
  expect(areas[1].value).toBe('red_hair');expect(areas[3].value).toBe('red hair\n\nShort red hair.');expect(h.root.textContent).not.toContain('Invalid uncertainty evidence');expect(h.root.textContent).toContain('missing-attribute note was ignored');
});
test('refine: typed feedback becomes verified, selectable changes; weights and notes carry through; copy buttons work',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  const all=Array.from(h.root.querySelectorAll('textarea'));const [notes,source,tags,prose,prompt,feedback]=all;
  notes.value='Redheads: weight red_hair at 1.4.';b('Save settings').click();await until(()=>!b('Translate').disabled);
  h.root.querySelector('select')!.value='c1';
  h.setResponses([{traits:[{id:'1',group:'hair',evidence:'Short red hair.',tags:['(red_hair:1.4)'],detail:'Short red hair'}]},{drop:[],captions:{character:'Short red hair.'},issues:[]},
    {reply:'The hair read as orange.',remove:[{tag:'made_up',why:'x'}],weight:[{tag:'red_hair',weight:1.8,why:'still too weak'}],add:[{tag:'red_hair',why:'dup'},{tag:'short_hair',weight:null,why:'length was lost'}],caption:'Short, vivid red hair.'}]);
  source.value='Short red hair.';b('Translate').click();await until(()=>!b('Translate').disabled);
  expect(tags.value).toBe('(red_hair:1.4)');expect(prompt.value).toBe('(red hair:1.4)\n\nShort red hair.');
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
  expect(Array.from(h.root.querySelectorAll('.lc-proposal strong')).map(n=>n.textContent)).toEqual(['Weight (red_hair:1.8)','Add short_hair','Replace the detail']);
  expect(h.root.textContent).toContain('The hair read as orange.');expect(tags.value).toBe('(red_hair:1.4)');
  boxes[2].checked=false;b('Apply selected').click();await until(()=>!b('Translate').disabled);
  expect(tags.value).toBe('(red_hair:1.8), short_hair');expect(prose.value).toBe('Short red hair.');expect(prompt.value).toBe('(red hair:1.8), short hair\n\nShort red hair.');
  expect(feedback.value).toBe('');expect(h.root.querySelectorAll('.lc-proposal').length).toBe(0);
});
