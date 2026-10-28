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
  let noPool=false;let studio:unknown;
  let applyStudio:(()=>unknown)|undefined;
  // A small story: one chat on one character card, its messages, and lorebooks.
  const story={chat:{id:'chat1',character_id:'card1',name:'Harbour story',metadata:{chat_world_book_ids:['mine'],theme:'kept'}} as {id:string;character_id:string;name:string;metadata:Record<string,unknown>}|null,
    card:{id:'card1',name:'Narrator',world_book_ids:['other']},messages:[] as {id:string;role:string;content:string}[],
    books:new Map<string,{id:string;name:string;metadata:Record<string,unknown>}>([['other',{id:'other',name:'World',metadata:{}}],['mine',{id:'mine',name:'My notes',metadata:{}}]]),
    entries:[] as {id:string;world_book_id:string;key:string[];content:string;comment:string}[],denied:[] as string[]};
  const events=new Map<string,(payload:unknown,user?:string)=>void>();
  const api={
    permissions:{has:(p:string)=>!story.denied.includes(p)},
    on:(event:string,fn:(payload:unknown,user?:string)=>void)=>{events.set(event,fn);return()=>events.delete(event);},
    chats:{getActive:async()=>story.chat&&structuredClone(story.chat),get:async(id:string)=>story.chat?.id===id?structuredClone(story.chat):null,update:async(id:string,v:{metadata:Record<string,unknown>})=>{calls.push(['chatUpdate',id,v.metadata]);story.chat!.metadata=v.metadata;return story.chat;}},
    chat:{getMessages:async(id:string)=>id==='chat1'?story.messages.map(m=>({...m,is_user:m.role==='user'})):[]},
    characters:{get:async(id:string)=>id===story.card.id?{...story.card}:null,update:async(id:string,v:{world_book_ids:string[]})=>{calls.push(['attach',id,v.world_book_ids]);story.card.world_book_ids=v.world_book_ids;return story.card;}},
    world_books:{get:async(id:string)=>story.books.get(id)??null,create:async(v:{name:string;metadata:Record<string,unknown>})=>{const b={id:`b${story.books.size}`,...v};story.books.set(b.id,b);return b;},
      entries:{list:async(id:string)=>({data:story.entries.filter(e=>e.world_book_id===id),total:0}),
        create:async(id:string,v:{key:string[];content:string;comment:string})=>{const e={id:`e${story.entries.length}`,world_book_id:id,...v};story.entries.push(e);return e;},
        update:async(id:string,v:{key:string[];content:string;comment:string})=>{const e=story.entries.find(x=>x.id===id)!;Object.assign(e,v);return e;}}},

    userStorage:{getJson:async(path:string,o:{fallback:unknown;userId?:string})=>storage.get(`${o.userId}:${path}`)??o.fallback,setJson:async(path:string,value:unknown,o:{userId?:string})=>{storage.set(`${o.userId}:${path}`,value);}},
    connections:{list:async()=>[{id:'c1',name:'Fast text',provider,model},{id:'c2',name:'Classifier',provider:'openrouter',model:'typesafe/jev-1.13'}],get:async(id:string,user?:string)=>{calls.push(['connection',id,user]);return id==='c1'?{id,name:'Fast text',provider,model}:null;}},
    cors:async(url:string)=>{calls.push(['cors',url]);if(gel&&new URL(url).hostname==='gelbooru.com')return gel;const q=new URL(url).searchParams;const list=q.get('search[name_comma]')?.split(',');return{status:200,body:JSON.stringify(url.includes('/tags.json')?(list??[q.get('search[name]')??'red_hair']).map(name=>({name,category:0,post_count:100})):url.includes('/wiki_pages.json')?(q.get('search[title_comma]')?.split(',')??['red_hair']).map(title=>({title,body:title==='red_hair'?'Hair colored red.':''})):[])};},
    generate:{raw:async(input:{messages:{content:string}[];signal:AbortSignal;userId?:string;provider?:string;model?:string;connection_id?:string})=> {
      calls.push(['generation',input]);latestSignal=input.signal;
      // Mirror prepareRawCall: connection supplies credentials, input supplies model.
      if(input.model!==model||input.provider!==provider||input.connection_id!=='c1')throw new Error('API error 400: missing or invalid model');
      if(fail)throw new Error('Invalid API key SECRET-DO-NOT-LEAK');
      if(block)await new Promise((_,reject)=>input.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
      // A queued {__raw:…} is returned as the host's reply exactly, to test odd provider replies.
      if(responses&&(responses[0] as {__raw?:unknown})?.__raw)return (responses.shift() as {__raw:unknown}).__raw;
      return{content:JSON.stringify(responses ? responses.shift() : input.messages[0].content.includes('one trait per visual fact')?{traits:[{id:'t1',group:'hair',evidence:'Short red hair.',tags:['red_hair'],detail:'Short red hair'}]}:{drop:[],captions:{character:'Short red hair.'},issues:[]}),finish_reason:'stop'};
    }},
    onFrontendMessage:(fn:typeof handler)=>{handler=fn;return()=>{handler=undefined;};},
    rpcPool:{read:async(endpoint:string)=>{calls.push(['read',endpoint]);if(endpoint==='lumidraw_studio.lumicast.apply'){if(!applyStudio)throw new Error('Shared RPC endpoint "lumidraw_studio.lumicast.apply" is not registered');return applyStudio();}if(endpoint!=='lumidraw_studio.lumicast.tweak'||studio===undefined)throw new Error('no value');return studio;},sync:(endpoint:string,value:unknown,policy:unknown)=>{if(noPool)throw new Error('pool unavailable');calls.push(['sync',endpoint,value,policy]);return `lumicast.${endpoint}`;}},
    sendToFrontend:(payload:unknown,user?:string,options?:{frontendSessionId?:string})=>{replies.push({payload,user,session:options?.frontendSessionId});// No session means every open panel of that user, as the host does.
      if(user==='u1'&&(options?.frontendSessionId??'s1')==='s1')listeners.forEach(fn=>fn(payload));},
  } as unknown as SpindleAPI;
  const root=document.createElement('div');document.body.append(root);
  const ctx={sendToBackend:(payload:unknown)=>handler?.(payload,'u1','s1'),onBackendMessage:(fn:(payload:unknown)=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},ui:{registerDrawerTab:()=>({root,destroy:()=>root.remove()})},dom:{addStyle:()=>()=>{}}} as unknown as SpindleFrontendContext;
  const stop=setupBackend(api);
  return{ctx,root,calls,replies,storage,stop,emit:(payload:unknown,user='u1',session='s1')=>handler?.(payload,user,session),setFail:()=>{fail=true;},setBlock:()=>{block=true;},setResponses:(values:unknown[])=>{responses=values;},setGel:(value:{status:number;body:string})=>{gel=value;},setNoPool:()=>{noPool=true;},story,events,setStudio:(v:unknown)=>{studio=v;},setApply:(fn:()=>unknown)=>{applyStudio=fn;},signal:()=>latestSignal};
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
  expect(areas[1].value).toBe('red_hair, standing');expect(areas[2].value).toContain('Short red hair.');expect(areas[5].value).toBe('red hair, standing\n\nShort red hair.');
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
  // The outfit is included by default, with one plain pose so the figure is not cropped.
  expect(areas[1].value).toBe('red_hair, standing');expect(areas[2].value).toBe('Red hair. She wears a ribbon.');expect(areas[5].value).toBe('red hair, standing\n\nRed hair. She wears a ribbon.');
  expect(h.root.textContent).toContain('“standing” is added so the figure has a pose');
  const scope=Array.from(h.root.querySelectorAll('select')).find(s=>Array.from(s.options).some(o=>o.value==='character'))!;expect(scope.value).toBe('outfit');
  scope.value='character';scope.dispatchEvent(new Event('change'));expect(areas[2].value).toBe('Red hair.');expect(areas[5].value).toBe('red hair, standing\n\nRed hair.');
  // The sources list covers what the sheet holds: the character and the outfit, whatever Include says.
  expect(h.root.querySelector('[data-lc="sources"]')?.textContent).toContain('Red hair, obviously!');expect(h.root.querySelector('[data-lc="sources"]')?.textContent).toContain('ribbon');expect(areas[5].value).not.toContain('ribbon');
  areas[2].value='my edit';areas[2].dispatchEvent(new Event('input'));scope.value='outfit';scope.dispatchEvent(new Event('change'));
  expect(areas[2].value).toBe('Red hair. She wears a ribbon.');expect(h.calls.filter(v=>(v as unknown[])[0]==='generation').length).toBe(2);expect(h.root.textContent).toContain('manual edits there were replaced');expect(h.root.querySelector('[data-lc="sources"]')?.textContent).toContain('ribbon');
});
test('direct DeepSeek adapter tolerates string evidence without discarding the panel result',async()=> {
  dom();const h=harness('deepseek','deepseek-v4-pro');cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  h.setResponses([{traits:[{id:'1',group:'hair',evidence:'Short red hair.',tags:['red_hair'],detail:'Short red hair'}]},{drop:[],captions:{character:'Short red hair.'},issues:[{kind:'ambiguity',evidence:'Short red hair.',message:'Age not specified.'}]}]);
  const translate=Array.from(h.root.querySelectorAll('button')).find(b=>b.textContent==='Translate')!;
  await until(()=>!translate.disabled);h.root.querySelector('select')!.value='c1';
  const areas=areasOf(h.root);areas[0].value='Short red hair.';translate.click();await until(()=>!translate.disabled);
  expect(areas[1].value).toBe('red_hair, standing');expect(areas[5].value).toBe('red hair, standing\n\nShort red hair.');expect(h.root.textContent).not.toContain('Invalid uncertainty evidence');expect(h.root.textContent).toContain('missing-attribute note was ignored');
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
  expect(tags.value).toBe('(red_hair:1.4), standing');expect(prompt.value).toBe('(red hair:1.4), standing\n\nShort red hair.');
  const sheetValue=(key:string)=>(h.root.querySelector(`[data-sheet="${key}"]`) as HTMLInputElement).value;
  expect(appearance.value).toBe('(red hair:1.4)');expect(outfit.value).toBe('');expect(sheetValue('countTag')).toBe('');
  expect(h.root.querySelector('.lc-gaps')!.textContent).toContain('Not stated: eye colour.');expect(h.root.querySelector('.lc-gaps')!.textContent).not.toContain('hair colour');
  (h.root.querySelector('[aria-label="Copy permanent appearance tags"]') as HTMLButtonElement).click();await until(()=>!b('Translate').disabled);expect(h.root.textContent).toContain('Permanent appearance tags copied.');
  const sent=h.calls.filter(v=>(v as unknown[])[0]==='generation').map(v=>((v as unknown[])[1] as {messages:{content:string}[]}).messages[1].content);
  expect(JSON.parse(sent[0]).notes).toBe('Redheads: weight red_hair at 1.4.');
  let copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async(value:string)=>{copied=value;}},configurable:true});
  b('Copy tags').click();await until(()=>!b('Translate').disabled);expect(copied).toBe('(red hair:1.4), standing');
  b('Copy detail').click();await until(()=>!b('Translate').disabled);expect(copied).toBe('Short red hair.');
  expect(b('Apply selected').disabled).toBe(true);
  feedback.value='Hair came out orange and long.';b('Suggest changes').click();await until(()=>!b('Translate').disabled);
  const refineInput=JSON.parse(((h.calls.filter(v=>(v as unknown[])[0]==='generation').pop() as unknown[])[1] as {messages:{content:string}[]}).messages[1].content);
  expect(refineInput.tags).toEqual(['(red_hair:1.4)','standing']);expect(refineInput.feedback).toBe('Hair came out orange and long.');expect(refineInput.notes).toContain('Redheads');expect(refineInput.description).toBe('Short red hair.');
  const boxes=Array.from(h.root.querySelectorAll('.lc-proposal input')) as HTMLInputElement[];
  expect(Array.from(h.root.querySelectorAll('.lc-proposal strong')).map(n=>n.textContent)).toEqual(['Weight (red hair:1.8)','Add short hair','Replace the standalone detail']);
  expect(h.root.textContent).toContain('The hair read as orange.');expect(tags.value).toBe('(red_hair:1.4), standing');
  boxes[2].checked=false;b('Apply selected').click();await until(()=>!b('Translate').disabled);
  expect(tags.value).toBe('(red_hair:1.8), standing, short_hair');expect(prose.value).toBe('Short red hair.');expect(prompt.value).toBe('(red hair:1.8), standing, short hair\n\nShort red hair.');
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
  expect(lastInput.tags).toEqual(['1girl','red_hair','short_hair','green_eyes','standing']);expect(lastInput.locked).toBeUndefined();
  b('Apply selected').click();await until(()=>!b('Translate').disabled);
  expect(named(h.root,'countTag').value).toBe('1boy');expect(named(h.root,'appearance').value).toBe('red hair, short hair, green eyes, freckles');
  // The standalone prompt follows the same changes, the count included.
  expect(named(h.root,'tags').value).toBe('1boy, red_hair, short_hair, green_eyes, standing, freckles');expect(named(h.root,'prompt').value).toBe('1boy, red hair, short hair, green eyes, standing, freckles\n\nA woman. Short red hair. Green eyes.');
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
  expect(named(h.root,'prompt').value).toBe('masterpiece, best quality, score_9, red hair, standing\n\nShort red hair.');
  named(h.root,'tags').value='';named(h.root,'tags').dispatchEvent(new Event('input'));b('Rebuild from tags + detail').click();await until(()=>!b('Translate').disabled);
  expect(named(h.root,'prompt').value).toBe('masterpiece, best quality, score_9\n\nShort red hair.');
});
test('the sheet is shared for Lumi Studio after translating and after edits, with a name guess and an open read policy',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  named(h.root,'source').value='Jason Slatz — physical description:\nShort red hair.';
  h.setResponses([{traits:[{id:'1',group:'hair',evidence:'Short red hair.',tags:['red_hair','short_hair'],detail:'Short red hair'}]},{drop:[],captions:{},sheet:{subject:'adult man'},issues:[]}]);
  b('Translate').click();await until(()=>!b('Translate').disabled);
  const syncs=()=>h.calls.filter(v=>(v as unknown[])[0]==='sync') as [string,string,{sheet:Record<string,string>;name:string;title:string;version:number;userId:string},{requires:string[]}][];
  await until(()=>syncs().length===1);
  const [,endpoint,value,policy]=syncs()[0];
  expect(endpoint).toBe('sheet.latest');expect(policy).toEqual({requires:[]});
  expect(value).toMatchObject({version:1,name:'Jason Slatz',title:'Jason Slatz — physical description:',userId:'u1',sheet:{subject:'adult man',appearance:'red hair, short hair',countTag:'',always:'',outfit:'',anatomy:''}});
  expect(h.root.textContent).toContain('Ready for Fill from LumiCast in Lumi Studio.');
  const appearance=named(h.root,'appearance');appearance.value='red hair, short hair, freckles';appearance.dispatchEvent(new Event('input'));
  appearance.value='red hair, short hair, freckles, green eyes';appearance.dispatchEvent(new Event('input'));
  await until(()=>syncs().length===2);expect(syncs()[1][2].sheet.appearance).toBe('red hair, short hair, freckles, green eyes');
  h.setNoPool();appearance.value='red hair';appearance.dispatchEvent(new Event('input'));
  await until(()=>(h.root.textContent??'').includes('Not shared with Lumi Studio'));
});
test('after Refine, the prompt rebuilds itself unless the tags carry unverified hand edits, and the status says which',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  const suggestion={reply:'Weight it.',remove:[],add:[],weight:[{tag:'red_hair',weight:1.5,why:'faint'}],caption:null};
  h.setResponses([{traits:[{id:'1',group:'hair',evidence:'Short red hair.',tags:['red_hair'],detail:'Short red hair'}]},{drop:[],captions:{character:'Short red hair.'},issues:[]},suggestion,{...suggestion,weight:[{tag:'red_hair',weight:1.8,why:'still faint'}]}]);
  named(h.root,'source').value='Short red hair.';b('Translate').click();await until(()=>!b('Translate').disabled);
  named(h.root,'feedback').value='Hair too faint.';b('Suggest changes').click();await until(()=>!b('Translate').disabled);
  b('Apply selected').click();await until(()=>!b('Translate').disabled);
  expect(named(h.root,'prompt').value).toBe('(red hair:1.5), standing\n\nShort red hair.');expect(h.root.querySelector('.lc-status')!.textContent).toContain('Copy the prompt and generate again.');
  const tags=named(h.root,'tags');tags.value='(red_hair:1.5), freckles';tags.dispatchEvent(new Event('input'));
  named(h.root,'feedback').value='Still faint.';b('Suggest changes').click();await until(()=>!b('Translate').disabled);
  b('Apply selected').click();await until(()=>!b('Translate').disabled);
  expect(named(h.root,'tags').value).toBe('(red_hair:1.8), freckles');
  expect(named(h.root,'prompt').value).toBe('(red hair:1.5), standing\n\nShort red hair.');expect(h.root.querySelector('.lc-status')!.textContent).toContain('Press Verify edited tags, then Rebuild.');
});
test('Refine remembers earlier rounds for this character, sends them with the lock, and forgets on a new description',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  const extraction={traits:[{id:'s',group:'subject',evidence:'He',tags:['1boy','android'],detail:'A male android'},{id:'1',group:'hair',evidence:'short red hair',tags:['red_hair','short_hair'],detail:'Short red hair'}]};
  const review={drop:[],captions:{character:'A male android with short red hair.'},issues:[]};
  const first={reply:'Weight the hair.',remove:[{tag:'android',why:'diluting'}],add:[],weight:[{tag:'red_hair',weight:1.4,why:'faint'}],caption:null};
  const second={reply:'Going further.',remove:[],add:[{tag:'gradient_hair',why:'colour'}],weight:[{tag:'red_hair',weight:1.8,why:'still faint'}],caption:null};
  h.setResponses([extraction,review,first,second,second,extraction,review,second]);
  named(h.root,'source').value='He has short red hair.';b('Translate').click();await until(()=>!b('Translate').disabled);
  const refineInputs=()=>h.calls.filter(v=>(v as unknown[])[0]==='generation').map(v=>JSON.parse(((v as unknown[])[1] as {messages:{content:string}[]}).messages[1].content)).filter(i=>'feedback' in i);
  named(h.root,'feedback').value='Hair is too faint.';b('Suggest changes').click();await until(()=>!b('Translate').disabled);
  expect(refineInputs()[0].locked).toEqual(['android']);expect(refineInputs()[0].history).toBeUndefined();
  // "android" is locked, so only the weight is offered; apply it.
  b('Apply selected').click();await until(()=>!b('Translate').disabled);
  named(h.root,'feedback').value='Hair is still too faint.';b('Suggest changes').click();await until(()=>!b('Translate').disabled);
  expect(refineInputs()[1].history).toEqual([{feedback:'Hair is too faint.',applied:['weight (red hair:1.4)'],declined:[]}]);
  // Asking again without applying counts the unapplied suggestions as skipped.
  named(h.root,'feedback').value='Try something else.';b('Suggest changes').click();await until(()=>!b('Translate').disabled);
  expect(refineInputs()[2].history[1]).toEqual({feedback:'Hair is still too faint.',applied:[],declined:['weight (red hair:1.8)','add gradient hair']});
  expect(h.root.textContent).toContain('Earlier rounds (2)');expect(h.root.textContent).toContain('Skipped: weight (red hair:1.8); add gradient hair.');
  // A new description is a new character.
  const historyBox=Array.from(h.root.querySelectorAll('details')).find(d=>d.textContent?.includes('Earlier rounds'))!;expect(historyBox.hidden).toBe(false);
  named(h.root,'source').value='He is someone else, with short red hair.';b('Translate').click();await until(()=>!b('Translate').disabled);
  expect(historyBox.hidden).toBe(true);expect(historyBox.querySelectorAll('li').length).toBe(0);
});
test('the caption can be turned off, leaving quality tags and booru tags only',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  named(h.root,'quality').value='masterpiece';
  named(h.root,'source').value='Short red hair.';b('Translate').click();await until(()=>!b('Translate').disabled);
  expect(named(h.root,'prompt').value).toBe('masterpiece, red hair, standing\n\nShort red hair.');
  const caption=Array.from(h.root.querySelectorAll('select')).find(s=>Array.from(s.options).some(o=>o.value==='none'))!;
  caption.value='none';caption.dispatchEvent(new Event('change'));
  expect(named(h.root,'prompt').value).toBe('masterpiece, red hair, standing');expect(h.root.textContent).toContain('Caption turned off.');
  b('Rebuild from tags + detail').click();await until(()=>!b('Translate').disabled);expect(named(h.root,'prompt').value).toBe('masterpiece, red hair, standing');
  caption.value='short';caption.dispatchEvent(new Event('change'));expect(named(h.root,'prompt').value).toBe('masterpiece, red hair, standing\n\nShort red hair.');
});
test('odd model replies: cut off at the length limit, empty, or the answer left in reasoning',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const rpc=createRpc(h.ctx);cleanups.push(()=>rpc.destroy());
  const ask=()=>rpc.request<Translation>('translate',{description:'Short red hair.',connectionId:'c1'}).then(r=>r,(e:Error)=>e);
  h.setResponses([{__raw:{content:'{"traits":[',reasoning:'x'.repeat(12000),finish_reason:'length'}}]);
  expect(((await ask()) as Error).message).toBe('The model ran out of room during trait extraction (it stopped at the length limit after 12,000 characters of reasoning). Set Model thinking to Off or Light under Connection & tag services, or use a shorter description.');
  h.setResponses([{__raw:{content:'',finish_reason:'stop'}}]);
  expect(((await ask()) as Error).message).toBe('The model sent back an empty reply during trait extraction (finish reason: stop). Try again, or try another connection.');
  const extraction={traits:[{id:'t1',group:'hair',evidence:'Short red hair.',tags:['red_hair'],detail:'Short red hair'}]};
  h.setResponses([{__raw:{content:'',reasoning:`Let me think. The answer is ${JSON.stringify(extraction)} and that is all.`,finish_reason:'stop'}},{drop:[],captions:{character:'Short red hair.'},issues:[]}]);
  expect(((await ask()) as Translation).views.character.prompt).toBe('red hair\n\nShort red hair.');
  const sent=(h.calls.filter(v=>(v as unknown[])[0]==='generation').pop() as unknown[])[1] as {parameters:{max_tokens:number}};
  expect(sent.parameters.max_tokens).toBe(16000);
});
test('model thinking is light unless chosen otherwise, and each step is reported while it runs',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const rpc=createRpc(h.ctx);cleanups.push(()=>rpc.destroy());
  const stages:string[]=[];
  await rpc.request('translate',{description:'Short red hair.',connectionId:'c1'},s=>stages.push(s));
  expect(stages).toEqual(['Step 1 of 3: the model is reading the description…','Step 2 of 3: checking 1 tag on Danbooru…','Step 3 of 3: the model is checking the tags and writing the caption…']);
  const reasoning=()=>h.calls.filter(v=>(v as unknown[])[0]==='generation').map(v=>((v as unknown[])[1] as {reasoning?:unknown}).reasoning).at(-1);
  expect(reasoning()).toEqual({source:'custom',apiReasoning:true,effort:'low'});
  expect((await rpc.request<Snapshot>('snapshot')).settings.thinking).toBe('light');
  await rpc.request('save',{connectionId:'c1',thinking:'off',gelUser:'',gelKey:''});
  await rpc.request('translate',{description:'Short red hair.',connectionId:'c1'});expect(reasoning()).toEqual({source:'off'});
  await rpc.request('save',{connectionId:'c1',thinking:'inherit',gelUser:'',gelKey:''});
  await rpc.request('translate',{description:'Short red hair.',connectionId:'c1'});expect(reasoning()).toBeUndefined();
  // Saving notes or other settings keeps the choice; an unknown value falls back to light.
  await rpc.request('saveNotes',{notes:'x'});expect((await rpc.request<Snapshot>('snapshot')).settings.thinking).toBe('inherit');
  await rpc.request('save',{connectionId:'c1',thinking:'max',gelUser:'',gelKey:''});expect((await rpc.request<Snapshot>('snapshot')).settings.thinking).toBe('light');
});
test('an [ooc] reply becomes clean descriptions, saved once to a Cast lorebook on the story card and updated after',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx);cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  const answer='Ooh, two at once! Maren Holt, the dockmaster: tall, sun-browned, a grey-streaked black braid. Tobin is a wiry kid with a shaved head. Fun, right?';
  h.story.messages.push({id:'m1',role:'user',content:'Story.'},{id:'m2',role:'user',content:'[ooc] describe the two new people'},{id:'m3',role:'assistant',content:answer});
  // The story reply finishing tells the panel; nothing is read until asked.
  h.events.get('GENERATION_ENDED')!({chatId:'chat1',messageId:'m3',generationId:'g'},'u1');
  await until(()=>!(h.root.querySelector('.lc-news') as HTMLElement).hidden);
  expect(h.calls.filter(c=>(c as unknown[])[0]==='generation').length).toBe(0);
  h.setResponses([{characters:[{name:'Maren',aliases:['the dockmaster'],description:'Maren is tall and sun-browned, with a grey-streaked black braid.'},{name:'Tobin',aliases:[],description:'Tobin is a wiry boy with a shaved head.'}]}]);
  b('Use the last [ooc] reply').click();await until(()=>!b('Translate').disabled);
  const sent=(h.calls.filter(c=>(c as unknown[])[0]==='generation').at(-1) as unknown[])[1] as {messages:{content:string}[]};
  expect(JSON.parse(sent.messages[1].content)).toEqual({question:'[ooc] describe the two new people',answer});
  expect(sent.messages[0].content).toContain('any narrator or assistant persona');
  const entries=Array.from(h.root.querySelectorAll('[data-cast]'));expect(entries.map(e=>(e as HTMLElement).dataset.cast)).toEqual(['Maren','Tobin']);
  const maren=entries[0];const save=Array.from(maren.querySelectorAll('button')).find(x=>x.textContent==='Save to Cast lorebook')!;
  save.click();await until(()=>maren.textContent!.includes('Saved in'));
  expect(maren.textContent).toContain('Saved in “Cast · Harbour story”, a new lorebook for this chat only.');
  // The book goes on this chat, after its own lorebooks and without touching other chat settings; the card is left alone.
  expect(h.story.chat!.metadata).toEqual({chat_world_book_ids:['mine','b2'],theme:'kept'});expect(h.story.card.world_book_ids).toEqual(['other']);
  expect(h.story.entries).toEqual([{id:'e0',world_book_id:'b2',key:['Maren','the dockmaster'],content:"[Maren's appearance]\nMaren is tall and sun-browned, with a grey-streaked black braid.",comment:'LumiCast: Maren',constant:false,selective:false,disabled:false,case_sensitive:false,match_whole_words:true} as never]);
  // Saving again after an edit updates the same entry in the same book.
  const box=maren.querySelector('textarea')!;box.value='Maren is tall.';save.click();await until(()=>maren.textContent!.includes('Updated in'));
  expect(h.story.entries.length).toBe(1);expect(h.story.entries[0].content).toBe("[Maren's appearance]\nMaren is tall.");expect(h.story.books.size).toBe(3);
  expect(h.calls.filter(c=>(c as unknown[])[0]==='chatUpdate').length).toBe(1);expect(h.calls.filter(c=>(c as unknown[])[0]==='attach').length).toBe(0);
  // The description can go straight into the Anima prompt.
  h.setResponses([{traits:[{id:'t1',group:'hair',evidence:'shaved head',tags:['very_short_hair'],detail:'A shaved head'}]},{drop:[],captions:{character:'A shaved head.'},issues:[]}]);
  Array.from(entries[1].querySelectorAll('button')).find(x=>x.textContent==='Make the Anima prompt')!.click();await until(()=>named(h.root,'tags').value!=='');
  expect(named(h.root,'source').value).toBe('Tobin is a wiry boy with a shaved head.');
});
test('[ooc] replies explain what is missing: no chat, no question, no reply yet, permissions',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const rpc=createRpc(h.ctx);cleanups.push(()=>rpc.destroy());
  const ask=()=>rpc.request('castRead',{connectionId:'c1'}).then(()=>'ok',(e:Error)=>e.message);
  expect(await ask()).toContain('No [ooc] message with a reply');
  h.story.messages.push({id:'m1',role:'user',content:'(OOC: describe her)'});expect(await ask()).toContain('has no reply yet');
  h.story.chat=null;expect(await ask()).toContain('Open your story chat first');
  h.story.denied.push('chat_mutation');expect(await ask()).toBe('Grant LumiCast these permissions in Extensions to use [ooc] replies: chat_mutation.');
  expect(await rpc.request('castSave',{name:'Maren',aliases:[],description:'Tall.'}).then(()=>'ok',(e:Error)=>e.message)).toContain('Open your story chat first');
});
test('a Cast lorebook that 0.10.0 put on the character card moves onto the chat, keeping its entries',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const rpc=createRpc(h.ctx);cleanups.push(()=>rpc.destroy());
  h.story.books.set('old',{id:'old',name:'Cast · Narrator',metadata:{lumicast:'cast'}});h.story.card.world_book_ids=['other','old'];
  h.story.entries.push({id:'e9',world_book_id:'old',key:['Maren'],content:'x',comment:'LumiCast: Maren'});
  const saved=await rpc.request<{moved:boolean;updated:boolean;book:string}>('castSave',{name:'Maren',aliases:[],description:'Maren is tall.'});
  expect(saved).toMatchObject({moved:true,updated:true,book:'Cast · Narrator'});
  expect(h.story.card.world_book_ids).toEqual(['other']);expect(h.story.chat!.metadata.chat_world_book_ids).toEqual(['mine','old']);
  expect(h.story.entries.length).toBe(1);
  // Attached by hand as well: still one copy on the chat, and nothing more to move.
  const again=await rpc.request<{moved:boolean}>('castSave',{name:'Tobin',aliases:[],description:'Tobin is wiry.'});
  expect(again.moved).toBe(false);expect(h.story.chat!.metadata.chat_world_book_ids).toEqual(['mine','old']);
});
test('a Lumi Studio character loads on its own for Refine, with its Cast description, and goes back through the shared sheet',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx,{studioPollMs:20});cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  const status=()=>h.root.querySelector('.lc-status')!.textContent!;
  const news=()=>h.root.querySelector('.lc-studio') as HTMLElement;
  const sheetValue=(key:string)=>(h.root.querySelector(`[data-sheet="${key}"]`) as HTMLInputElement).value;
  // Nothing sent: no banner, no button to find.
  await Bun.sleep(120);expect(news().hidden).toBe(true);expect(b('Get from Lumi Studio')).toBeUndefined();
  h.story.books.set('cast',{id:'cast',name:'Cast · Harbour story',metadata:{lumicast:'cast'}});h.story.chat!.metadata.chat_world_book_ids=['mine','cast'];
  h.story.entries.push({id:'e1',world_book_id:'cast',key:['Maren','the dockmaster'],content:"[Maren's appearance]\nMaren is tall, with a grey-streaked black braid.",comment:'LumiCast: Maren'});
  // An empty panel loads the sent character by itself.
  h.setStudio({version:1,name:'Maren',anchor:'Maren',userId:'u1',sentAt:Date.now(),sheet:{countTag:'1girl',subject:'tall woman',always:'',appearance:'black hair, braid, tall female',outfit:'coat',anatomy:''}});
  await until(()=>sheetValue('appearance')==='black hair, braid, tall female');await until(()=>!b('Translate').disabled);
  expect(sheetValue('countTag')).toBe('1girl');
  expect(named(h.root,'source').value).toBe('Maren is tall, with a grey-streaked black braid.');
  expect(status()).toContain('Maren loaded from Lumi Studio (sent just now).');expect(status()).toContain('lorebook “Cast · Harbour story”');
  expect(news().hidden).toBe(false);expect(news().textContent).toContain('Maren came from Lumi Studio');expect(b('Show the tags')).toBeDefined();
  // The same send is not loaded twice.
  const reads=()=>h.calls.filter(c=>(c as unknown[])[0]==='read').length;
  named(h.root,'source').value='Maren, edited by hand.';await Bun.sleep(120);expect(named(h.root,'source').value).toBe('Maren, edited by hand.');expect(reads()).toBeGreaterThan(3);
  named(h.root,'source').value='Maren is tall, with a grey-streaked black braid.';
  // Refine works from the sheet, and its changes land in the sheet only.
  h.setResponses([{reply:'Grey streaks are missing.',remove:[],weight:[],add:[{tag:'streaked_hair',why:'grey streaks'}],caption:'ignored'}]);
  named(h.root,'feedback').value='The grey streaks never show.';b('Suggest changes').click();await until(()=>!b('Translate').disabled);
  const sent=(h.calls.filter(c=>(c as unknown[])[0]==='generation').at(-1) as unknown[])[1] as {messages:{content:string}[]};
  expect(JSON.parse(sent.messages[1].content)).toMatchObject({tags:['1girl','black_hair','braid','tall_female','coat'],description:'Maren is tall, with a grey-streaked black braid.'});
  // A second send while a Refine answer waits: asked first, nothing replaced.
  h.setStudio({version:1,name:'Tobin',anchor:'Tobin',userId:'u1',sentAt:Date.now()+1,sheet:{countTag:'1boy',subject:'wiry man',always:'',appearance:'short hair',outfit:'',anatomy:''}});
  await until(()=>news().textContent!.includes('Tobin was sent from Lumi Studio'));
  expect(sheetValue('appearance')).toBe('black hair, braid, tall female');
  b('Not now').click();expect(news().hidden).toBe(true);await Bun.sleep(120);expect(news().hidden).toBe(true);
  b('Apply selected').click();await until(()=>!b('Translate').disabled);
  expect(sheetValue('appearance')).toBe('black hair, braid, tall female, streaked hair');expect(named(h.root,'prompt').value).toBe('');
  expect(status()).toContain('Press Update Maren in Lumi Studio to save them there.');
  await Bun.sleep(450);
  const shared=h.calls.filter(c=>(c as unknown[])[0]==='sync').at(-1) as unknown[];
  expect((shared[2] as {sheet:{appearance:string}}).sheet.appearance).toBe('black hair, braid, tall female, streaked hair');
  // A third send while Refine feedback is typed: Load it replaces on request.
  named(h.root,'feedback').value='Taller, please.';
  h.setStudio({version:1,name:'Tobin',anchor:'Tobin',userId:'u1',sentAt:Date.now()+2,sheet:{countTag:'1boy',subject:'wiry man',always:'',appearance:'short hair',outfit:'',anatomy:''}});
  await until(()=>news().textContent!.includes('Tobin was sent'));b('Load it').click();await until(()=>sheetValue('appearance')==='short hair');
  await until(()=>!b('Translate').disabled);expect(status()).toContain('Tobin loaded from Lumi Studio');
  // Another user's character is never loaded or offered.
  named(h.root,'feedback').value='';
  h.setStudio({version:1,name:'X',userId:'u2',sentAt:Date.now()+3,sheet:{appearance:'other'}});await Bun.sleep(150);
  expect(sheetValue('appearance')).toBe('short hair');expect(news().textContent).not.toContain('X was sent');
});
test('the revised sheet goes back to the Lumi Studio entry it came from, and only to it',async()=> {
  dom();const h=harness();cleanups.push(h.stop);const dispose=setup(h.ctx,{studioPollMs:20});cleanups.push(dispose);
  const b=(name:string)=>Array.from(h.root.querySelectorAll('button')).find(x=>x.textContent===name)!;
  await until(()=>!b('Translate').disabled);h.root.querySelector('select')!.value='c1';
  const status=()=>h.root.querySelector('.lc-status')!.textContent!;
  const sheetBox=(key:string)=>h.root.querySelector(`[data-sheet="${key}"]`) as HTMLInputElement;
  // Not saved in Lumi Studio yet: there is nothing to update.
  h.setStudio({version:1,name:'Riley',anchor:'Riley',userId:'u1',sentAt:Date.now(),id:'',kind:'character',sheet:{countTag:'1girl',appearance:'glasses, round eyewear',outfit:''}});
  await until(()=>!!b('Update Riley in Lumi Studio'));await until(()=>!b('Translate').disabled);
  b('Update Riley in Lumi Studio').click();await until(()=>!b('Translate').disabled);expect(status()).toContain('Save this character in Lumi Studio first');
  // Saved there: the edited sheet goes back, empty fields included, and Lumi Studio's answer is shown.
  const sentAt=Date.now()+1;
  h.setStudio({version:1,name:'Riley',anchor:'Riley',userId:'u1',sentAt,id:'character_7',kind:'character',sheet:{countTag:'1girl',appearance:'glasses, round eyewear',outfit:'hoodie'}});
  await until(()=>sheetBox('outfit').value==='hoodie');await until(()=>!b('Translate').disabled);
  sheetBox('appearance').value='round eyewear';sheetBox('outfit').value='';
  let asked=0;h.setApply(()=>{asked++;return {ok:true,name:'Riley'};});
  b('Update Riley in Lumi Studio').click();await until(()=>status().includes('updated in Lumi Studio'));
  const result=h.calls.filter(c=>(c as unknown[])[0]==='sync'&&(c as unknown[])[1]==='tweak.result').at(-1) as unknown[];
  expect(result[2]).toEqual({version:1,id:'character_7',kind:'character',sentAt,userId:'u1',sheet:{countTag:'1girl',subject:'',always:'',appearance:'round eyewear',outfit:'',anatomy:'',moss:''}});
  expect(result[3]).toEqual({requires:[]});expect(asked).toBe(1);
  expect(h.root.querySelector('.lc-studio')!.textContent).toContain('Riley is updated in Lumi Studio.');
  // Lumi Studio's refusal is passed on; an older Lumi Studio says so plainly.
  h.setApply(()=>{throw new Error('Error: That character is no longer in Lumi Studio.');});
  b('Update Riley in Lumi Studio').click();await until(()=>!b('Translate').disabled);expect(status()).toBe('Lumi Studio did not save it: That character is no longer in Lumi Studio.');
  // Someone else translated over Riley: the button goes, so they are never sent over her.
  h.setResponses([{traits:[{id:'1',group:'hair',evidence:'Short red hair.',tags:['red_hair'],detail:'Short red hair'}]},{drop:[],captions:{character:'Short red hair.'},issues:[]}]);
  named(h.root,'source').value='Short red hair.';named(h.root,'source').dispatchEvent(new Event('input'));b('Translate').click();await until(()=>!b('Translate').disabled);
  expect((h.root.querySelector('.lc-studio') as HTMLElement).hidden).toBe(true);expect(status()).not.toContain('Update Riley');
});
