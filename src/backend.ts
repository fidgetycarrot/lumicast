import type { SpindleAPI, GenerationRequestDTO } from 'lumiverse-spindle-types';
import { BooruDictionary, testGelbooru } from './dictionary';
import { Translator } from './engine';
import { answersOoc, CAST, entryComment, entryContent, lastOocExchange, parseCast, type CastRead, type CastSaved, type ChatLine } from './cast';
import { gelCredentials, isGenerative, nameFrom, record, text, THINKING, type Settings, type Thinking, type SharedSheet, type Snapshot, type StudioCharacter } from './contracts';
import { generationError, ModelRequestError } from './generation-errors';

const DEFAULTS: Settings = {connectionId:'',castConnectionId:'',gelUser:'',gelKey:'',notes:'',quality:'',thinking:'light'};
const thinking=(v:unknown):Thinking=>THINKING.includes(v as Thinking)?v as Thinking:'light';
// A light think is enough to pick tags; long reasoning was most of the wait. Off and inherit are the user's choice.
const REASONING={light:{source:'custom',apiReasoning:true,effort:'low'},off:{source:'off'},inherit:undefined} as const;
export function setupBackend(api: SpindleAPI) {
  type UserState={ settings?:Settings; dictionary?:BooruDictionary; load?:Promise<void>; jobs:Map<string,AbortController> };
  const users = new Map<string, UserState>();
  let closed = false;
  const stateFor=(key:string):UserState=>{let state=users.get(key);if(!state){state={jobs:new Map()};users.set(key,state);}return state;};
  const loadSettings=async(s:UserState,userId?:string)=>{
    s.load ??= api.userStorage.getJson<Settings>('settings.json',{fallback:{...DEFAULTS},userId}).then(saved => {
      const v=record(saved);
      s.settings={connectionId:text(v.connectionId ?? '', 'connection',100),castConnectionId:text(v.castConnectionId ?? '', 'connection',100),gelUser:text(v.gelUser ?? '', 'Gelbooru user',50),gelKey:text(v.gelKey ?? '', 'Gelbooru key',200),notes:text(v.notes ?? '', 'notes',2000),quality:text(v.quality ?? '', 'quality tags',600),thinking:thinking(v.thinking)};
    }).catch(() => {s.settings={...DEFAULTS};});
    await s.load;
  };
  const dictionaryFor=(s:UserState)=>s.dictionary ??= new BooruDictionary(async url=> {
    const response=record(await api.cors(url,{method:'GET',headers:{Accept:'application/json','User-Agent':'LumiCast/0.14.0 (tag metadata client)'}}));
    if(typeof response.status!=='number'||typeof response.body!=='string')throw new Error('Invalid proxy response.');
    return {status:response.status,body:response.body};
  },{user:s.settings!.gelUser,key:s.settings!.gelKey});
  const pickConnectionFor=async(id:string,userId?:string)=>{
    const connection=await api.connections.get(id,userId);
    if (!connection || !isGenerative(connection.model)) throw new Error('Select a saved generative text connection. Jev and Decisions models cannot write the translator output.');
    return connection;
  };
  /** One model call through a saved connection, with the chosen thinking level and plain errors that name the step. */
  const callerFor=(connection:{id:string;provider:string;model:string},stageOf:()=>string,settings:Settings,userId?:string)=>async (system:string,content:string,signal:AbortSignal)=> {
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
  const off = api.onFrontendMessage((payload, userId, frontendSessionId) => {
    const r=record(payload);
    if (closed || r.type !== 'lumicast:request' || typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(r.id)) return;
    const s=stateFor(userId ?? 'owner');
    // Stage news for the status line while a long job runs. Best effort; the final reply is what counts.
    const progress=(stage:string)=>{try{if(!closed)api.sendToFrontend({type:'lumicast:progress',id:r.id,stage},userId,{frontendSessionId});}catch{/* ignore */}};
    const reply=(result?:unknown,error?:string) => {if (!closed) api.sendToFrontend({type:'lumicast:response',id:r.id,result,error},userId,{frontendSessionId});};
    const session=frontendSessionId ?? 'main';
    if (r.action === 'cancel') {s.jobs.get(session)?.abort();reply(true);return;}
    void (async () => {
      if (!api.permissions.has('generation') || !api.permissions.has('cors_proxy')) throw new Error('Grant LumiCast generation and CORS proxy permissions in Extensions.');
      await loadSettings(s,userId);
      const settings=s.settings!;
      /** Fails with the missing permissions named, in the words of the Extensions page. */
      const need=(list:string[])=>{const missing=list.filter(p=>!api.permissions.has(p as never));if(missing.length)throw new Error(`Grant LumiCast these permissions in Extensions to use [ooc] replies: ${missing.join(', ')}.`);};
      const chatLines=async(chatId:string):Promise<ChatLine[]>=>(await api.chat.getMessages(chatId)).map(m=>({id:m.id,role:m.role,content:typeof m.content==='string'?m.content:''}));
      /**
       * The Cast lorebook belongs to the chat, so a character met in one story never turns up in a replay of
       * the same card. One entry per character, found again by its comment, so saving twice updates instead of
       * duplicating. A Cast book that 0.10.0 put on the character card is moved onto this chat.
       */
      const saveToCast=async(name:string,aliases:string[],description:string):Promise<CastSaved>=>{
        const active=await api.chats.getActive(userId);
        if (!active) throw new Error('Open your story chat first. The Cast lorebook is attached to the chat that is open.');
        const isCast=(b:{metadata?:Record<string,unknown>}|null)=>record(b?.metadata).lumicast==='cast';
        const chatBooks=()=>{const ids=record(active.metadata).chat_world_book_ids;return Array.isArray(ids)?ids.filter((v):v is string=>typeof v==='string'):[];};
        let book=null as Awaited<ReturnType<typeof api.world_books.get>>;
        for (const id of chatBooks()) {const b=await api.world_books.get(id,userId);if(isCast(b)){book=b;break;}}
        // 0.10.0 attached the book to the card, which leaks the cast into every chat on that card.
        let moved=false;
        if (api.permissions.has('characters' as never) && active.character_id) {
          const card=await api.characters.get(active.character_id,userId);
          for (const id of card?.world_book_ids ?? []) {
            const b=await api.world_books.get(id,userId);
            // Only the book this chat uses (or will use) is moved; another chat's Cast book on the card is left alone.
            if (!isCast(b) || (book && b!.id!==book.id)) continue;
            await api.characters.update(card!.id,{world_book_ids:card!.world_book_ids.filter(x=>x!==id)},userId);
            book ??= b;moved=true;card!.world_book_ids=card!.world_book_ids.filter(x=>x!==id);
          }
        }
        let createdBook=false;
        if (!book) {
          book=await api.world_books.create({name:`Cast · ${active.name || 'story'}`.slice(0,100),description:'Character descriptions saved by LumiCast from [ooc] replies, for one chat.',metadata:{lumicast:'cast',chatId:active.id}},userId);
          createdBook=true;
        }
        if (!chatBooks().includes(book.id)) {
          // Chat metadata is replaced whole, so read it fresh and change only the lorebook list.
          const fresh=await api.chats.get(active.id,userId);
          const metadata=record(fresh?.metadata);const ids=Array.isArray(metadata.chat_world_book_ids)?metadata.chat_world_book_ids:[];
          await api.chats.update(active.id,{metadata:{...metadata,chat_world_book_ids:[...ids.filter(x=>x!==book!.id),book.id]}},userId);
        }
        const entries:{id:string;comment:string}[]=[];
        for (let offset=0;offset<2000;offset+=200) {const page=await api.world_books.entries.list(book.id,{limit:200,offset,userId});entries.push(...page.data);if(page.data.length<200)break;}
        const existing=entries.find(e=>e.comment===entryComment(name));
        const entry={key:[name,...aliases],content:entryContent(name,description),comment:entryComment(name),constant:false,selective:false,disabled:false,case_sensitive:false,match_whole_words:true};
        if (existing) await api.world_books.entries.update(existing.id,entry,userId);
        else await api.world_books.entries.create(book.id,entry,userId);
        return {book:book.name,createdBook,moved,chat:active.name,updated:!!existing};
      };
      const dictionary=()=>dictionaryFor(s);
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
        need(['chats','world_books']);
        const v=record(r.input);
        const name=text(v.name,'name (maximum 80 characters)',80).replace(/\s+/g,' ');
        const description=text(v.description,'description (maximum 3,000 characters)',3000);
        if (!name || !description) throw new Error('Give the character a name and a description first.');
        const aliases=(Array.isArray(v.aliases)?v.aliases:[]).slice(0,8).map(a=>text(a,'other name',60).replace(/\s+/g,' ')).filter(a=>a&&a.toLowerCase()!==name.toLowerCase());
        return await saveToCast(name,aliases,description);
      }
      if (r.action === 'fromStudio') {
        // Lumi Studio's "Tweak in LumiCast" publishes the character it has open; read it here.
        const pool=(api as unknown as {rpcPool?:{read?:(endpoint:string)=>Promise<unknown>}}).rpcPool;
        if (typeof pool?.read!=='function') throw new Error('This Lumiverse version cannot share data between extensions.');
        let shared:Record<string,unknown>;
        try {shared=record(await pool.read('lumidraw_studio.lumicast.tweak'));}
        catch {throw new Error('Nothing sent from Lumi Studio yet. In Lumi Studio, open the character and choose Tweak in LumiCast first.');}
        const sheet=record(shared.sheet);
        if (shared.version!==1) throw new Error('Lumi Studio sent a format this LumiCast does not understand. Update both extensions.');
        if (typeof shared.userId==='string'&&shared.userId&&userId&&shared.userId!==userId) throw new Error('The character sent from Lumi Studio belongs to another Lumiverse user.');
        const field=(key:string,max=4000)=>typeof sheet[key]==='string'?(sheet[key] as string).slice(0,max):'';
        const names=[shared.name,shared.anchor].filter((v):v is string=>typeof v==='string'&&!!v.trim()).map(v=>v.trim().slice(0,80));
        const out:StudioCharacter={sheet:{countTag:field('countTag',40),subject:field('subject',200),always:field('always'),appearance:field('appearance'),outfit:field('outfit'),anatomy:field('anatomy')},
          name:names[0]??'',sentAt:Number(shared.sentAt)||0,description:'',book:'',id:typeof shared.id==='string'?shared.id.slice(0,120):'',kind:shared.kind==='persona'?'persona':'character'};
        // The written description, if this chat's Cast lorebook has one under that name. Best effort.
        try {
          if (names.length&&api.permissions.has('chats' as never)&&api.permissions.has('world_books' as never)) {
            const chat=await api.chats.getActive(userId);
            const ids=record(chat?.metadata).chat_world_book_ids;
            for (const id of Array.isArray(ids)?ids:[]) {
              const book=typeof id==='string'?await api.world_books.get(id,userId):null;
              if (!book||record(book.metadata).lumicast!=='cast') continue;
              const wanted=names.map(n=>n.toLowerCase());
              for (let offset=0;offset<2000&&!out.description;offset+=200) {
                const page=await api.world_books.entries.list(book.id,{limit:200,offset,userId});
                const hit=page.data.find(e=>wanted.some(n=>e.comment===entryComment(n)||e.comment.toLowerCase()===entryComment(n).toLowerCase()))
                  ??page.data.find(e=>e.key.some(k=>wanted.includes(k.toLowerCase())));
                if (hit) {out.description=hit.content.replace(/^\[[^\]\n]*appearance\]\n/i,'').trim().slice(0,12_000);out.book=book.name;}
                if (page.data.length<200) break;
              }
              if (out.description) break;
            }
          }
        } catch {/* tags alone still work */}
        return out;
      }
      if (r.action === 'toStudio') {
        // The revised sheet goes back to the Lumi Studio entry it came from. LumiCast publishes it, then asks
        // Lumi Studio to take it; Lumi Studio checks it answers its own last send before saving anything.
        const v=record(r.input);const sheet=record(v.sheet);
        const id=text(v.id ?? '','character id',120);
        if (!id) throw new Error('Save this character in Lumi Studio first, then press Tweak in LumiCast again, so LumiCast knows which one to update.');
        const field=(key:string,max=4000)=>text(sheet[key] ?? '',key,max);
        const pool=(api as unknown as {rpcPool?:{sync?:(e:string,v:unknown,p?:{requires?:string[]})=>string;read?:(e:string)=>Promise<unknown>}}).rpcPool;
        if (typeof pool?.sync!=='function'||typeof pool.read!=='function') throw new Error('This Lumiverse version cannot share data between extensions.');
        pool.sync('tweak.result',{version:1,id,kind:v.kind==='persona'?'persona':'character',sentAt:Number(v.sentAt)||0,userId:userId ?? '',
          sheet:{countTag:field('countTag',40),subject:field('subject',200),always:field('always'),appearance:field('appearance'),outfit:field('outfit'),anatomy:field('anatomy')}},{requires:[]});
        let answer:Record<string,unknown>;
        try {answer=record(await pool.read('lumidraw_studio.lumicast.apply'));}
        catch (error) {
          const message=error instanceof Error?error.message:'';
          if (/not registered/i.test(message)) throw new Error('This Lumi Studio cannot take updates from LumiCast yet. Update Lumi Studio, or use Fill from LumiCast there.');
          throw new Error(`Lumi Studio did not save it: ${message.replace(/^.*?:\s*(?=[A-Z])/,'').slice(0,240) || 'no reason given'}`);
        }
        if (answer.ok!==true) throw new Error('Lumi Studio did not save it: no reason given');
        return {name:typeof answer.name==='string'?answer.name.slice(0,80):''};
      }
      if (r.action === 'studioWaiting') {
        // What Lumi Studio last sent, without the lorebook lookup, so the panel can check often and load it on its own.
        const nothing={sentAt:0,name:''};
        const pool=(api as unknown as {rpcPool?:{read?:(endpoint:string)=>Promise<unknown>}}).rpcPool;
        if (typeof pool?.read!=='function') return nothing;
        try {
          const shared=record(await pool.read('lumidraw_studio.lumicast.tweak'));
          if (shared.version!==1) return nothing;
          if (typeof shared.userId==='string'&&shared.userId&&userId&&shared.userId!==userId) return nothing;
          const name=[shared.name,shared.anchor].find((v):v is string=>typeof v==='string'&&!!v.trim());
          return {sentAt:Number(shared.sentAt)||0,name:name?name.trim().slice(0,80):''};
        } catch {return nothing;}
      }
      if (r.action === 'testGelbooru') {
        // Tests what is typed in the boxes, falling back to the saved key, without saving or caching anything.
        const v=record(r.input);
        const entered=gelCredentials(text(v.gelUser ?? '','Gelbooru user',300),v.gelKey ? text(v.gelKey,'Gelbooru key',300) : '');
        const credentials={user:entered.user||settings.gelUser,key:entered.key||settings.gelKey};
        const outcome=await testGelbooru(async url=> {
          const response=record(await api.cors(url,{method:'GET',headers:{Accept:'application/json','User-Agent':'LumiCast/0.14.0 (tag metadata client)'}}));
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
        const pickConnection=(id:string)=>pickConnectionFor(id,userId);
        const caller=(connection:{id:string;provider:string;model:string},stageOf:()=>string)=>callerFor(connection,stageOf,settings,userId);
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
      const trusted=/^(Grant LumiCast|Save this character in Lumi Studio|This Lumi Studio cannot|Lumi Studio did not save|Nothing sent from|Lumi Studio sent|The character sent|Open your story|Your latest|No \[ooc\]|No character descriptions|The connection for|Give the character|Wait for|This connection|Gelbooru user|Unknown LumiCast|An operation|Use at most|Use a tag|This Lumiverse|Select a saved|The model |Invalid |Use a plain|Paste a |No explicit|Too many|Conflicting|Tag service|Tag lookup|Cyclic tag|Tag alias|Oversized|Unexpected)/.test(message);
      reply(undefined,error instanceof Error && error.name==='AbortError' ? 'Operation cancelled or timed out. Your edits are preserved.' : error instanceof ModelRequestError || trusted ? message : 'The operation failed. Check your connection, provider status and tag-service access. Your edits are preserved.');
    });
  });
  /**
   * Paige's Make my card: she shares everyone's looks at paige.cast, then reads paige.start here. The answer comes
   * back at once; the translations run in the background, one at a time, and each finished sheet goes straight
   * into Lumi Studio (lumidraw_studio.lumicast.add), new or updated by name. Progress is shared at paige.status.
   */
  type PaigeLook={name:string;aliases:string[];kind:'character'|'persona';description:string};
  type PaigeStatus={sessionId:string;done:number;total:number;running:boolean;current?:string;finished:{name:string;ok:boolean;message:string}[]};
  const pool=(api as unknown as {rpcPool?:{sync?:(e:string,v:unknown,p?:{requires?:string[]})=>string;read?:(e:string)=>Promise<unknown>;handle?:(e:string,h:(ctx:{requesterExtensionId:string})=>unknown,p?:{requires?:string[]})=>string}}).rpcPool;
  const paigeStatus=(status:PaigeStatus)=>{try{pool?.sync?.('paige.status',status,{requires:[]});}catch{/* best effort */}};
  async function startFromPaige(requester:string):Promise<{ok:boolean;message?:string;count?:number}> {
    if (requester!=='paige') return {ok:false,message:'Only Paige can send characters this way.'};
    if (typeof pool?.read!=='function'||typeof pool.sync!=='function') return {ok:false,message:'This Lumiverse version cannot share data between extensions.'};
    let shared:Record<string,unknown>;
    try {shared=record(await pool.read('paige.cast'));} catch {return {ok:false,message:'Paige has not shared any looks yet.'};}
    if (shared.version!==1||!Array.isArray(shared.characters)) return {ok:false,message:'Paige sent a format this LumiCast does not understand. Update both extensions.'};
    const userId=typeof shared.userId==='string'&&shared.userId?shared.userId:undefined;
    const sessionId=typeof shared.sessionId==='string'?shared.sessionId.slice(0,100):'';
    const looks:PaigeLook[]=shared.characters.slice(0,24).map(c=>record(c)).filter(c=>typeof c.name==='string'&&c.name.trim()&&typeof c.description==='string'&&c.description.trim()).map(c=>({
      name:String(c.name).trim().slice(0,80),aliases:(Array.isArray(c.aliases)?c.aliases:[]).filter((a):a is string=>typeof a==='string').map(a=>a.trim().slice(0,60)).filter(Boolean).slice(0,8),
      kind:c.kind==='persona'?'persona':'character',description:String(c.description).slice(0,12_000)}));
    if (!looks.length) return {ok:false,message:'None of the looks Paige sent had a name and a description.'};
    if (!api.permissions.has('generation')||!api.permissions.has('cors_proxy')) return {ok:false,message:'Grant LumiCast generation and CORS proxy permissions in Extensions.'};
    const s=stateFor(userId ?? 'owner');
    if (s.jobs.size) return {ok:false,message:'LumiCast is busy with another translation. Wait for it, then press Send looks again in Paige.'};
    await loadSettings(s,userId);
    const settings=s.settings!;
    if (!settings.connectionId) return {ok:false,message:'Pick a connection in LumiCast first (Connection & tag services), then press Send looks again in Paige.'};
    let connection:{id:string;provider:string;model:string};
    try {connection=await pickConnectionFor(settings.connectionId,userId);} catch (error) {return {ok:false,message:error instanceof Error?error.message:'LumiCast\'s connection is unavailable.'};}
    const controller=new AbortController();s.jobs.set('paige',controller);
    const status:PaigeStatus={sessionId,done:0,total:looks.length,running:true,finished:[]};
    paigeStatus(status);
    void (async()=>{
      try {
        for (const look of looks) {
          if (closed||controller.signal.aborted) break;
          status.current=look.name;paigeStatus(status);
          let ok=false,message='';
          const one=new AbortController();const stop=()=>one.abort();controller.signal.addEventListener('abort',stop);
          const timer=setTimeout(()=>one.abort(),240_000);
          try {
            let calls=0;
            const translator=new Translator(callerFor(connection,()=>++calls===1?'trait extraction':'tag review and caption',settings,userId),dictionaryFor(s));
            const result=await translator.translate(look.description,one.signal,`${connection.provider} / ${connection.model}`,{scope:'outfit',notes:settings.notes});
            pool!.sync!('paige.sheet',{version:1,sessionId,name:look.name,aliases:look.aliases,kind:look.kind,userId:userId ?? '',sentAt:Date.now(),sheet:result.sheet},{requires:[]});
            const answer=record(await pool!.read!('lumidraw_studio.lumicast.add'));
            ok=answer.ok===true;message=ok?(answer.updated?'updated':'added'):'Lumi Studio gave no answer';
          } catch (error) {
            const text=error instanceof Error?error.message:'';
            message=/not registered|not found/i.test(text)?'Lumi Studio is missing or too old; update it':error instanceof ModelRequestError||/^The model /.test(text)?text.slice(0,200):error instanceof Error&&error.name==='AbortError'?'took too long':text.replace(/^.*?:\s*(?=[A-Z])/,'').slice(0,200)||'failed';
          } finally {clearTimeout(timer);controller.signal.removeEventListener('abort',stop);}
          status.done++;status.finished.push({name:look.name,ok,message});
          paigeStatus(status);
        }
      } finally {
        status.running=false;delete status.current;paigeStatus(status);s.jobs.delete('paige');
      }
    })();
    return {ok:true,count:looks.length};
  }
  if (typeof pool?.handle==='function') {
    try {pool.handle('paige.start',({requesterExtensionId})=>startFromPaige(requesterExtensionId),{requires:[]});}
    catch {/* older hosts */}
  }
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
