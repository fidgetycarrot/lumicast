import type { SpindleAPI, GenerationRequestDTO } from 'lumiverse-spindle-types';
import { BooruDictionary, testGelbooru } from './dictionary';
import { Translator } from './engine';
import { answersOoc, CAST, entryComment, entryContent, lastOocExchange, parseCast, type CastRead, type CastSaved, type ChatLine } from './cast';
import { gelCredentials, isGenerative, nameFrom, record, text, THINKING, type Settings, type Thinking, type SharedSheet, type Snapshot } from './contracts';
import { generationError, ModelRequestError } from './generation-errors';

const DEFAULTS: Settings = {connectionId:'',castConnectionId:'',gelUser:'',gelKey:'',notes:'',quality:'',thinking:'light'};
const thinking=(v:unknown):Thinking=>THINKING.includes(v as Thinking)?v as Thinking:'light';
// A light think is enough to pick tags; long reasoning was most of the wait. Off and inherit are the user's choice.
const REASONING={light:{source:'custom',apiReasoning:true,effort:'low'},off:{source:'off'},inherit:undefined} as const;
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
    // Stage news for the status line while a long job runs. Best effort; the final reply is what counts.
    const progress=(stage:string)=>{try{if(!closed)api.sendToFrontend({type:'lumicast:progress',id:r.id,stage},userId,{frontendSessionId});}catch{/* ignore */}};
    const reply=(result?:unknown,error?:string) => {if (!closed) api.sendToFrontend({type:'lumicast:response',id:r.id,result,error},userId,{frontendSessionId});};
    const session=frontendSessionId ?? 'main';
    if (r.action === 'cancel') {s.jobs.get(session)?.abort();reply(true);return;}
    void (async () => {
      if (!api.permissions.has('generation') || !api.permissions.has('cors_proxy')) throw new Error('Grant LumiCast generation and CORS proxy permissions in Extensions.');
      s.load ??= api.userStorage.getJson<Settings>('settings.json',{fallback:{...DEFAULTS},userId}).then(saved => {
        const v=record(saved);
        s.settings={connectionId:text(v.connectionId ?? '', 'connection',100),castConnectionId:text(v.castConnectionId ?? '', 'connection',100),gelUser:text(v.gelUser ?? '', 'Gelbooru user',50),gelKey:text(v.gelKey ?? '', 'Gelbooru key',200),notes:text(v.notes ?? '', 'notes',2000),quality:text(v.quality ?? '', 'quality tags',600),thinking:thinking(v.thinking)};
      }).catch(() => {s.settings={...DEFAULTS};});
      await s.load;
      const settings=s.settings!;
      /** Fails with the missing permissions named, in the words of the Extensions page. */
      const need=(list:string[])=>{const missing=list.filter(p=>!api.permissions.has(p as never));if(missing.length)throw new Error(`Grant LumiCast these permissions in Extensions to use [ooc] replies: ${missing.join(', ')}.`);};
      const chatLines=async(chatId:string):Promise<ChatLine[]>=>(await api.chat.getMessages(chatId)).map(m=>({id:m.id,role:m.role,content:typeof m.content==='string'?m.content:''}));
      /**
       * The Cast lorebook belongs to the story's character card, so its people only show up in that story.
       * One entry per character, found again by its comment, so saving twice updates instead of duplicating.
       */
      const saveToCast=async(name:string,aliases:string[],description:string):Promise<CastSaved>=>{
        const chat=await api.chats.getActive(userId);
        if (!chat) throw new Error('Open your story chat first. The Cast lorebook is attached to that chat’s character card.');
        const card=chat.character_id?await api.characters.get(chat.character_id,userId):null;
        if (!card) throw new Error('This chat has no single character card to attach a Cast lorebook to.');
        let book=null as Awaited<ReturnType<typeof api.world_books.get>>;
        for (const id of card.world_book_ids ?? []) {const b=await api.world_books.get(id,userId);if(record(b?.metadata).lumicast==='cast'){book=b;break;}}
        let createdBook=false;
        if (!book) {
          book=await api.world_books.create({name:`Cast · ${card.name}`.slice(0,100),description:'Character descriptions saved by LumiCast from [ooc] replies.',metadata:{lumicast:'cast'}},userId);
          await api.characters.update(card.id,{world_book_ids:[...(card.world_book_ids ?? []),book.id]},userId);
          createdBook=true;
        }
        const entries:{id:string;comment:string}[]=[];
        for (let offset=0;offset<2000;offset+=200) {const page=await api.world_books.entries.list(book.id,{limit:200,offset,userId});entries.push(...page.data);if(page.data.length<200)break;}
        const existing=entries.find(e=>e.comment===entryComment(name));
        const entry={key:[name,...aliases],content:entryContent(name,description),comment:entryComment(name),constant:false,selective:false,disabled:false,case_sensitive:false,match_whole_words:true};
        if (existing) await api.world_books.entries.update(existing.id,entry,userId);
        else await api.world_books.entries.create(book.id,entry,userId);
        return {book:book.name,createdBook,attached:card.name,updated:!!existing};
      };
      const dictionary=() => s.dictionary ??= new BooruDictionary(async url=> {
        const response=record(await api.cors(url,{method:'GET',headers:{Accept:'application/json','User-Agent':'LumiCast/0.10.0 (tag metadata client)'}}));
        if(typeof response.status!=='number'||typeof response.body!=='string')throw new Error('Invalid proxy response.');
        return {status:response.status,body:response.body};
      },{user:settings.gelUser,key:settings.gelKey});
      if (r.action === 'snapshot') {
        const connections=(await api.connections.list(userId)).map(c=>({id:c.id,name:c.name,provider:c.provider,model:c.model,supported:isGenerative(c.model)}));
        return {connections,settings:{connectionId:settings.connectionId,castConnectionId:settings.castConnectionId,gelUser:settings.gelUser,hasGelKey:!!settings.gelKey,notes:settings.notes,quality:settings.quality,thinking:settings.thinking},permissions:true} satisfies Snapshot;
      }
      if (r.action === 'save') {
        if (s.jobs.size) throw new Error('Wait for the current operation before changing settings.');
        const v=record(r.input);
        const entered=gelCredentials(text(v.gelUser,'Gelbooru user',300),v.gelKey ? text(v.gelKey,'Gelbooru key',300) : '');
        const next:Settings={connectionId:text(v.connectionId,'connection',100),castConnectionId:v.castConnectionId===undefined?settings.castConnectionId:text(v.castConnectionId,'connection',100),gelUser:entered.user,gelKey:v.clearGelKey===true ? '' : entered.key || settings.gelKey,notes:v.notes===undefined ? settings.notes : text(v.notes,'notes (maximum 2,000 characters)',2000),quality:settings.quality,thinking:v.thinking===undefined?settings.thinking:thinking(v.thinking)};
        if (next.gelUser && !/^\d+$/.test(next.gelUser)) throw new Error('Gelbooru user ID must be numeric.');
        if (next.connectionId && !await api.connections.get(next.connectionId,userId)) throw new Error('This connection is unavailable.');
        if (next.castConnectionId && !await api.connections.get(next.castConnectionId,userId)) throw new Error('The connection for [ooc] replies is unavailable.');
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
      if (r.action === 'castSave') {
        need(['chats','characters','world_books']);
        const v=record(r.input);
        const name=text(v.name,'name (maximum 80 characters)',80).replace(/\s+/g,' ');
        const description=text(v.description,'description (maximum 3,000 characters)',3000);
        if (!name || !description) throw new Error('Give the character a name and a description first.');
        const aliases=(Array.isArray(v.aliases)?v.aliases:[]).slice(0,8).map(a=>text(a,'other name',60).replace(/\s+/g,' ')).filter(a=>a&&a.toLowerCase()!==name.toLowerCase());
        return await saveToCast(name,aliases,description);
      }
      if (r.action === 'testGelbooru') {
        // Tests what is typed in the boxes, falling back to the saved key, without saving or caching anything.
        const v=record(r.input);
        const entered=gelCredentials(text(v.gelUser ?? '','Gelbooru user',300),v.gelKey ? text(v.gelKey,'Gelbooru key',300) : '');
        const credentials={user:entered.user||settings.gelUser,key:entered.key||settings.gelKey};
        const outcome=await testGelbooru(async url=> {
          const response=record(await api.cors(url,{method:'GET',headers:{Accept:'application/json','User-Agent':'LumiCast/0.10.0 (tag metadata client)'}}));
          return {status:Number(response.status),body:typeof response.body==='string'?response.body:''};
        },credentials);
        const unsaved=credentials.user!==settings.gelUser||credentials.key!==settings.gelKey;
        // A dictionary that has seen failures keeps a stale notice and a pause; start it afresh once the key works.
        if (outcome.ok&&!unsaved) s.dictionary=undefined;
        return {ok:outcome.ok,message:outcome.ok&&unsaved?`${outcome.message} Save settings to start using them.`:outcome.message};
      }
      if (!['translate','refine','search','verify','castRead'].includes(String(r.action))) throw new Error('Unknown LumiCast action.');
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
        const pickConnection=async(id:string)=>{
          const connection=await api.connections.get(id,userId);
          if (!connection || !isGenerative(connection.model)) throw new Error('Select a saved generative text connection. Jev and Decisions models cannot write the translator output.');
          return connection;
        };
        /** One model call through a saved connection, with the chosen thinking level and plain errors that name the step. */
        const caller=(connection:{id:string;provider:string;model:string},stageOf:()=>string)=>async (system:string,content:string,signal:AbortSignal)=> {
          let value:unknown;
          const stage=stageOf();
          // The host resolves credentials from connection_id, but raw generation
          // still uses input.model. SDK 0.6.40 omits these documented raw fields.
          const request:GenerationRequestDTO & {provider:string;model:string}={type:'raw',connection_id:connection.id,provider:connection.provider,model:connection.model,userId,messages:[{role:'system',content:system},{role:'user',content}],parameters:{max_tokens:16000},...(REASONING[settings.thinking]?{reasoning:{...REASONING[settings.thinking]}}:{}),signal};
          try {value=await api.generate.raw(request);}
          catch(error) {signal.throwIfAborted();throw generationError(error,connection.provider,connection.model,stage);}
          const response=record(value);
          // Say which call failed and how, so "it hangs then errors" can be told apart from a model problem.
          const answer=typeof response.content==='string'?response.content:'';
          const reasoning=typeof response.reasoning==='string'?response.reasoning:'';
          const finish=String(response.finish_reason ?? '');
          if (/length|max_tokens/.test(finish)) throw new Error(`The model ran out of room during ${stage} (it stopped at the length limit${reasoning ? ` after ${reasoning.length.toLocaleString()} characters of reasoning` : ''}). Set Model thinking to Off or Light under Connection & tag services, or use a shorter description.`);
          // Some reasoning models leave the answer in their reasoning text and send no content.
          if (!answer.trim() && reasoning.includes('{')) return reasoning;
          if (!answer.trim()) throw new Error(`The model sent back an empty reply during ${stage} (finish reason: ${finish || 'none given'}). Try again, or try another connection.`);
          return answer;
        };
        if (r.action === 'castRead') {
          need(['chats','chat_mutation']);
          const chat=await api.chats.getActive(userId);
          if (!chat) throw new Error('Open your story chat first. LumiCast reads the chat that is open.');
          progress('Looking for your last [ooc] message…');
          const exchange=lastOocExchange(await chatLines(chat.id));
          if (!exchange) throw new Error('No [ooc] message with a reply was found in this chat. Ask with a message that starts with [ooc], then try again.');
          const connection=await pickConnection(settings.castConnectionId||text(input.connectionId,'connection',100));
          progress('The model is cleaning up the [ooc] reply…');
          const raw=await caller(connection,()=>'cleaning up the [ooc] reply')(CAST,JSON.stringify({question:exchange.question.slice(0,2000),answer:exchange.answer.slice(0,24_000)}),controller.signal);
          const characters=parseCast(raw,exchange.answer);
          if (!characters.length) throw new Error('No character descriptions were found in the last [ooc] reply. Ask the story model to describe someone, then try again.');
          return {question:exchange.question.slice(0,300),answerId:exchange.answerId,characters,chat:chat.name} satisfies CastRead;
        }
        const connection=await pickConnection(text(input.connectionId,'connection',100));
        let modelCalls=0;const refining=r.action==='refine';
        const translator=new Translator(caller(connection,()=>refining?'refinement':++modelCalls===1?'trait extraction':'tag review and caption'),dictionary());
        const label=`${connection.provider} / ${connection.model}`;
        if (refining) {
          progress('The model is thinking about your feedback…');
          const refinement=await translator.refine({tags:Array.isArray(input.tags)?input.tags.map(v=>text(v,'tag',120)):[],caption:text(input.caption ?? '','caption',16_000),feedback:text(input.feedback,'feedback (maximum 2,000 characters)',2000),description:text(input.description ?? '','description',12_000),stated:text(input.stated ?? '','character type',300),notes:settings.notes,locked:Array.isArray(input.locked)?input.locked.map(v=>text(v,'tag',120)):[],history:Array.isArray(input.history)?input.history:[]},controller.signal,label);
          refinement.notices.push(...dictionary().notices);
          return refinement;
        }
        const scope=input.scope==='outfit'||input.scope==='scene'?input.scope:'character';
        const result=await translator.translate(text(input.description,'description',12_000),controller.signal,label,{scope,stated:text(input.stated ?? '','known facts',300),notes:settings.notes,progress});
        // result.notices is the selected view's own array, so add service notices once per distinct array.
        for(const list of new Set([result.notices,...Object.values(result.views).map(v=>v.notices)]))list.push(...[...dictionary().notices].filter(n=>!list.includes(n)));
        return result;
      } finally {clearTimeout(timer);s.jobs.delete(session);}
    })().then(result=>reply(result)).catch(error=> {
      // Provider errors may embed URLs, headers or keys. Never forward raw upstream errors.
      const message=error instanceof Error ? error.message : '';
      const trusted=/^(Grant LumiCast|Open your story|Your latest|No \[ooc\]|No character descriptions|This chat has|The connection for|Give the character|Wait for|This connection|Gelbooru user|Unknown LumiCast|An operation|Use at most|Use a tag|This Lumiverse|Select a saved|The model |Invalid |Use a plain|Paste a |No explicit|Too many|Conflicting|Tag service|Tag lookup|Cyclic tag|Tag alias|Oversized|Unexpected)/.test(message);
      reply(undefined,error instanceof Error && error.name==='AbortError' ? 'Operation cancelled or timed out. Your edits are preserved.' : error instanceof ModelRequestError || trusted ? message : 'The operation failed. Check your connection, provider status and tag-service access. Your edits are preserved.');
    });
  });
  // When a story reply answers an [ooc] message, tell the panel so it can offer to read it. Nothing runs by itself.
  let offEnded=()=>{};
  try {
    offEnded=api.on('GENERATION_ENDED',(payload,userId)=>{
      if (closed||!payload?.chatId||!payload.messageId||payload.error) return;
      if (!api.permissions.has('chat_mutation' as never)) return;
      void api.chat.getMessages(payload.chatId).then(messages=>{
        const lines=messages.map(m=>({id:m.id,role:m.role,content:typeof m.content==='string'?m.content:''}));
        if (!closed&&answersOoc(lines,payload.messageId!)) api.sendToFrontend({type:'lumicast:ooc',chatId:payload.chatId},userId);
      }).catch(()=>{/* best effort */});
    });
  } catch {/* older hosts without the event */}
  return () => {closed=true;off();offEnded();for(const s of users.values()) for(const c of s.jobs.values()) c.abort();users.clear();};
}
declare const spindle: SpindleAPI;
if (typeof spindle !== 'undefined') setupBackend(spindle);
