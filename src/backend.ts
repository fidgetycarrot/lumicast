import type { SpindleAPI, GenerationRequestDTO } from 'lumiverse-spindle-types';
import { BooruDictionary, testGelbooru } from './dictionary';
import { Translator } from './engine';
import { gelCredentials, isGenerative, nameFrom, record, text, type Settings, type SharedSheet, type Snapshot } from './contracts';
import { generationError, ModelRequestError } from './generation-errors';

const DEFAULTS: Settings = {connectionId:'',gelUser:'',gelKey:'',notes:'',quality:''};
export function setupBackend(api: SpindleAPI) {
  const users = new Map<string, { settings?:Settings; dictionary?:BooruDictionary; load?:Promise<void>; jobs:Map<string,AbortController> }>();
  let closed = false;
  const off = api.onFrontendMessage((payload, userId, frontendSessionId) => {
    const r=record(payload);
    if (closed || r.type !== 'lumicast:request' || typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(r.id)) return;
    const key=userId ?? 'owner';
    let state=users.get(key);
    if (!state) {state={jobs:new Map()};users.set(key,state);}
    const s=state;
    const reply=(result?:unknown,error?:string) => {if (!closed) api.sendToFrontend({type:'lumicast:response',id:r.id,result,error},userId,{frontendSessionId});};
    const session=frontendSessionId ?? 'main';
    if (r.action === 'cancel') {s.jobs.get(session)?.abort();reply(true);return;}
    void (async () => {
      if (!api.permissions.has('generation') || !api.permissions.has('cors_proxy')) throw new Error('Grant LumiCast generation and CORS proxy permissions in Extensions.');
      s.load ??= api.userStorage.getJson<Settings>('settings.json',{fallback:{...DEFAULTS},userId}).then(saved => {
        const v=record(saved);
        s.settings={connectionId:text(v.connectionId ?? '', 'connection',100),gelUser:text(v.gelUser ?? '', 'Gelbooru user',50),gelKey:text(v.gelKey ?? '', 'Gelbooru key',200),notes:text(v.notes ?? '', 'notes',2000),quality:text(v.quality ?? '', 'quality tags',600)};
      }).catch(() => {s.settings={...DEFAULTS};});
      await s.load;
      const settings=s.settings!;
      const dictionary=() => s.dictionary ??= new BooruDictionary(async url=> {
        const response=record(await api.cors(url,{method:'GET',headers:{Accept:'application/json','User-Agent':'LumiCast/0.8.3 (tag metadata client)'}}));
        if(typeof response.status!=='number'||typeof response.body!=='string')throw new Error('Invalid proxy response.');
        return {status:response.status,body:response.body};
      },{user:settings.gelUser,key:settings.gelKey});
      if (r.action === 'snapshot') {
        const connections=(await api.connections.list(userId)).map(c=>({id:c.id,name:c.name,provider:c.provider,model:c.model,supported:isGenerative(c.model)}));
        return {connections,settings:{connectionId:settings.connectionId,gelUser:settings.gelUser,hasGelKey:!!settings.gelKey,notes:settings.notes,quality:settings.quality},permissions:true} satisfies Snapshot;
      }
      if (r.action === 'save') {
        if (s.jobs.size) throw new Error('Wait for the current operation before changing settings.');
        const v=record(r.input);
        const entered=gelCredentials(text(v.gelUser,'Gelbooru user',300),v.gelKey ? text(v.gelKey,'Gelbooru key',300) : '');
        const next:Settings={connectionId:text(v.connectionId,'connection',100),gelUser:entered.user,gelKey:v.clearGelKey===true ? '' : entered.key || settings.gelKey,notes:v.notes===undefined ? settings.notes : text(v.notes,'notes (maximum 2,000 characters)',2000),quality:settings.quality};
        if (next.gelUser && !/^\d+$/.test(next.gelUser)) throw new Error('Gelbooru user ID must be numeric.');
        if (next.connectionId && !await api.connections.get(next.connectionId,userId)) throw new Error('This connection is unavailable.');
        await api.userStorage.setJson('settings.json',next,{userId});
        s.settings=next;s.dictionary=undefined;
        return true;
      }
      // Notes and quality tags save on their own, leaving the connection and Gelbooru settings untouched.
      if (r.action === 'saveNotes' || r.action === 'savePrefs') {
        if (s.jobs.size) throw new Error('Wait for the current operation before changing settings.');
        const v=record(r.input);
        const next:Settings={...settings,notes:v.notes===undefined?settings.notes:text(v.notes,'notes (maximum 2,000 characters)',2000),quality:v.quality===undefined?settings.quality:text(v.quality,'quality tags (maximum 600 characters)',600)};
        await api.userStorage.setJson('settings.json',next,{userId});
        s.settings=next;
        return true;
      }
      if (r.action === 'publish') {
        // The latest sheet, for Lumi Studio's "Fill from LumiCast". In memory only; cleared when Lumiverse restarts.
        const v=record(r.input);const sheet=record(v.sheet);
        const field=(key:string)=>text(sheet[key] ?? '',key,4000);
        const description=text(v.description ?? '','description',12_000);
        const shared:SharedSheet={version:1,sheet:{countTag:field('countTag'),subject:field('subject'),always:field('always'),appearance:field('appearance'),outfit:field('outfit'),anatomy:field('anatomy')},
          name:nameFrom(description),title:(description.split('\n').find(l=>l.trim()) ?? '').trim().slice(0,120),updatedAt:Date.now(),userId:userId ?? ''};
        const pool=(api as unknown as {rpcPool?:{sync?:(endpoint:string,value:unknown,policy?:{requires?:string[]})=>string}}).rpcPool;
        if (typeof pool?.sync!=='function') throw new Error('This Lumiverse version cannot share data between extensions.');
        return pool.sync('sheet.latest',shared,{requires:[]});
      }
      if (r.action === 'testGelbooru') {
        // Tests what is typed in the boxes, falling back to the saved key, without saving or caching anything.
        const v=record(r.input);
        const entered=gelCredentials(text(v.gelUser ?? '','Gelbooru user',300),v.gelKey ? text(v.gelKey,'Gelbooru key',300) : '');
        const credentials={user:entered.user||settings.gelUser,key:entered.key||settings.gelKey};
        const outcome=await testGelbooru(async url=> {
          const response=record(await api.cors(url,{method:'GET',headers:{Accept:'application/json','User-Agent':'LumiCast/0.8.3 (tag metadata client)'}}));
          return {status:Number(response.status),body:typeof response.body==='string'?response.body:''};
        },credentials);
        const unsaved=credentials.user!==settings.gelUser||credentials.key!==settings.gelKey;
        // A dictionary that has seen failures keeps a stale notice and a pause; start it afresh once the key works.
        if (outcome.ok&&!unsaved) s.dictionary=undefined;
        return {ok:outcome.ok,message:outcome.ok&&unsaved?`${outcome.message} Save settings to start using them.`:outcome.message};
      }
      if (!['translate','refine','search','verify'].includes(String(r.action))) throw new Error('Unknown LumiCast action.');
      if (s.jobs.size) throw new Error('An operation is already running. Wait or cancel it first.');
      const controller=new AbortController();s.jobs.set(session,controller);
      const timer=setTimeout(()=>controller.abort(),240_000);
      try {
        const input=record(r.input);
        if (r.action === 'search') return await dictionary().search(text(input.query,'tag search',100),controller.signal);
        if (r.action === 'verify') {
          if (!Array.isArray(input.names) || input.names.length > 32) throw new Error('Use at most 32 tags.');
          const result=[];
          for (const name of input.names) result.push({requested:text(name,'tag',100),tag:await dictionary().resolve(text(name,'tag',100),controller.signal)});
          return result;
        }
        const connectionId=text(input.connectionId,'connection',100);
        const connection=await api.connections.get(connectionId,userId);
        if (!connection || !isGenerative(connection.model)) throw new Error('Select a saved generative text connection. Jev and Decisions models cannot write the translator output.');
        let modelCalls=0;const refining=r.action==='refine';
        const translator=new Translator(async (system,content,signal)=> {
          let value:unknown;
          const stage=refining?'refinement':++modelCalls===1?'trait extraction':'tag review and caption';
          // The host resolves credentials from connection_id, but raw generation
          // still uses input.model. SDK 0.6.40 omits these documented raw fields.
          const request:GenerationRequestDTO & {provider:string;model:string}={type:'raw',connection_id:connection.id,provider:connection.provider,model:connection.model,userId,messages:[{role:'system',content:system},{role:'user',content}],parameters:{max_tokens:16000},signal};
          try {value=await api.generate.raw(request);}
          catch(error) {signal.throwIfAborted();throw generationError(error,connection.provider,connection.model,stage);}
          const response=record(value);
          // Say which call failed and how, so "it hangs then errors" can be told apart from a model problem.
          const answer=typeof response.content==='string'?response.content:'';
          const reasoning=typeof response.reasoning==='string'?response.reasoning:'';
          const finish=String(response.finish_reason ?? '');
          if (/length|max_tokens/.test(finish)) throw new Error(`The model ran out of room during ${stage} (it stopped at the length limit${reasoning ? ` after ${reasoning.length.toLocaleString()} characters of reasoning` : ''}). Try a model with reasoning turned down or off, or a shorter description.`);
          // Some reasoning models leave the answer in their reasoning text and send no content.
          if (!answer.trim() && reasoning.includes('{')) return reasoning;
          if (!answer.trim()) throw new Error(`The model sent back an empty reply during ${stage} (finish reason: ${finish || 'none given'}). Try again, or try another connection.`);
          return answer;
        },dictionary());
        const label=`${connection.provider} / ${connection.model}`;
        if (refining) {
          const refinement=await translator.refine({tags:Array.isArray(input.tags)?input.tags.map(v=>text(v,'tag',120)):[],caption:text(input.caption ?? '','caption',16_000),feedback:text(input.feedback,'feedback (maximum 2,000 characters)',2000),description:text(input.description ?? '','description',12_000),stated:text(input.stated ?? '','character type',300),notes:settings.notes,locked:Array.isArray(input.locked)?input.locked.map(v=>text(v,'tag',120)):[],history:Array.isArray(input.history)?input.history:[]},controller.signal,label);
          refinement.notices.push(...dictionary().notices);
          return refinement;
        }
        const scope=input.scope==='outfit'||input.scope==='scene'?input.scope:'character';
        const result=await translator.translate(text(input.description,'description',12_000),controller.signal,label,{scope,stated:text(input.stated ?? '','known facts',300),notes:settings.notes});
        // result.notices is the selected view's own array, so add service notices once per distinct array.
        for(const list of new Set([result.notices,...Object.values(result.views).map(v=>v.notices)]))list.push(...[...dictionary().notices].filter(n=>!list.includes(n)));
        return result;
      } finally {clearTimeout(timer);s.jobs.delete(session);}
    })().then(result=>reply(result)).catch(error=> {
      // Provider errors may embed URLs, headers or keys. Never forward raw upstream errors.
      const message=error instanceof Error ? error.message : '';
      const trusted=/^(Grant LumiCast|Wait for|This connection|Gelbooru user|Unknown LumiCast|An operation|Use at most|Use a tag|This Lumiverse|Select a saved|The model |Invalid |Use a plain|Paste a |No explicit|Too many|Conflicting|Tag service|Tag lookup|Cyclic tag|Tag alias|Oversized|Unexpected)/.test(message);
      reply(undefined,error instanceof Error && error.name==='AbortError' ? 'Operation cancelled or timed out. Your edits are preserved.' : error instanceof ModelRequestError || trusted ? message : 'The operation failed. Check your connection, provider status and tag-service access. Your edits are preserved.');
    });
  });
  return () => {closed=true;off();for(const s of users.values()) for(const c of s.jobs.values()) c.abort();users.clear();};
}
declare const spindle: SpindleAPI;
if (typeof spindle !== 'undefined') setupBackend(spindle);
