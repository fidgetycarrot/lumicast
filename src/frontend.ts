import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import { assemble, editList, formatWeighted, parseWeighted, splitTags, type GelbooruTest, type Proposal, type Refinement, type Scope, type Snapshot, type Translation, type VerifiedTag } from './contracts';
import { removeConflicts } from './engine';

export function createRpc(ctx: Pick<SpindleFrontendContext,'sendToBackend'|'onBackendMessage'>, timeout=250_000) {
  let closed=false;
  const pending=new Map<string,{resolve(value:unknown):void;reject(e:Error):void;timer:ReturnType<typeof setTimeout>}>();
  const off=ctx.onBackendMessage(value=> {
    const r=value as {type?:string;id?:string;result?:unknown;error?:string};
    if (!r || r.type !== 'lumicast:response' || !r.id) return;
    const p=pending.get(r.id);if(!p)return;
    clearTimeout(p.timer);pending.delete(r.id);
    if(r.error)p.reject(new Error(r.error));else p.resolve(r.result);
  });
  return {
    request<T>(action:string,input?:unknown):Promise<T> {
      if(closed)return Promise.reject(new Error('LumiCast is closed.'));
      const id=crypto.randomUUID();
      return new Promise((resolve,reject)=> {
        const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Lumiverse did not respond in time. Your edits are preserved.'));},timeout);
        pending.set(id,{resolve:v=>resolve(v as T),reject,timer});
        try{ctx.sendToBackend({type:'lumicast:request',id,action,input});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
      });
    },
    destroy(){closed=true;off();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('LumiCast closed.'));}pending.clear();},
  };
}
function el<K extends keyof HTMLElementTagNameMap>(tag:K,content?:string) {
  const n=document.createElement(tag);if(content!==undefined)n.textContent=content;return n;
}
function option(label:string,value:string){const n=el('option',label);n.value=value;return n;}
function field(label:string,input:HTMLElement,hint?:string) {
  const wrapper=el('label');wrapper.className='lc-field';wrapper.append(el('span',label),input);
  if(hint)wrapper.append(el('small',hint));return wrapper;
}
const STYLES=`.lc-app{box-sizing:border-box;font:14px/1.55 system-ui,sans-serif;color:var(--lumiverse-text,#eee);padding:24px;max-width:860px;margin:auto}.lc-app *{box-sizing:border-box}.lc-app h1{font-size:32px;letter-spacing:-1px;margin:2px 0}.lc-app h2{font-size:18px;margin:0 0 12px}.lc-app p{margin:8px 0}.lc-kicker{color:#d4b7ff;font-size:11px;letter-spacing:2px;text-transform:uppercase}.lc-muted,.lc-app small{color:var(--lumiverse-text-muted,#b4adc1);font-size:12px}.lc-card{border:1px solid #81708e55;background:#83709c0a;border-radius:16px;padding:18px;margin-top:18px}.lc-field{display:flex;flex-direction:column;gap:7px;margin:12px 0}.lc-field>span{font-size:13px;font-weight:600}.lc-app textarea,.lc-app input,.lc-app select{width:100%;border:1px solid #9484a566;border-radius:9px;background:var(--lumiverse-bg,#211c29);color:inherit;padding:11px;font:inherit}.lc-app textarea{resize:vertical;min-height:95px;line-height:1.55}.lc-app button{border:1px solid #a18caf66;border-radius:9px;padding:9px 15px;background:#8b719025;color:inherit;font:inherit;cursor:pointer}.lc-app button.lc-primary{background:#d0adf3;color:#261733;border-color:#d0adf3;font-weight:650}.lc-app button:disabled{opacity:.45;cursor:default}.lc-app :focus-visible{outline:2px solid #d0adf3;outline-offset:3px}.lc-row{display:flex;flex-wrap:wrap;gap:9px;align-items:center}.lc-status{padding:10px 0;white-space:pre-wrap;min-height:45px;position:sticky;top:0;z-index:2;background:var(--lumiverse-bg,#17131d);border-bottom:1px solid #81708e33}.lc-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.lc-head>span{font-size:13px;font-weight:600}.lc-app button.lc-mini{padding:3px 11px;font-size:12px}.lc-status[data-error=true]{color:#ffa7a7}.lc-app summary{cursor:pointer;font-weight:600}.lc-app a{color:#d4b7ff}.lc-gaps{border-left:3px solid #d0adf3;padding:6px 12px;margin:10px 0}.lc-gaps .lc-row{margin-top:8px}.lc-gaps input{flex:1;min-width:180px}.lc-sub{margin-top:14px}.lc-sub>summary{font-weight:600}.lc-gaps ul{margin:6px 0;padding-left:18px}.lc-proposal{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #81708e33}.lc-proposal input{width:auto;margin-top:4px}.lc-proposal small{display:block}.lc-provenance{overflow-wrap:anywhere;padding:9px 0;border-bottom:1px solid #81708e33}.lc-provenance blockquote{margin:4px 0 0;padding-left:12px;border-left:2px solid #8b7190;font-size:12px}.lc-app [hidden]{display:none!important}@media(max-width:450px){.lc-app{padding:14px}.lc-card{padding:13px}}`;

export function setup(ctx:SpindleFrontendContext) {
  let closed=false,busy=false,verified=false,edited=false,result:Translation|null=null,revision=0;
  let pending:Proposal[]=[];
  const rpc=createRpc(ctx);
  const tab=ctx.ui.registerDrawerTab({id:'translator',title:'LumiCast',shortName:'LumiCast',description:'Turn a written appearance into an Anima prompt',keywords:['anima','booru','prompt','translator'],iconSvg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3H4v18h4M16 3h4v18h-4M9 8l3-3 3 3M9 16l3 3 3-3M12 5v14"/></svg>'});
    const removeStyle=ctx.dom.addStyle(STYLES);
  const app=el('div');app.className='lc-app';tab.root.append(app);
  const named=<T extends HTMLElement>(node:T,name:string)=>{node.dataset.lc=name;return node;};
  const intro=el('header');const kicker=el('div','DESCRIPTION → LUMI STUDIO');kicker.className='lc-kicker';
  intro.append(kicker,el('h1','LumiCast'),el('p','Turn a written character into a Lumi Studio character sheet built from real booru tags.'));
  const status=el('div');status.className='lc-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');

  // ── Settings: only what connects LumiCast to other services ──
  const settings=el('details');settings.className='lc-card';settings.append(el('summary','Connection & tag services'));
  const connection=el('select');connection.setAttribute('aria-label','Generative connection');
  const gelUser=el('input');gelUser.inputMode='numeric';gelUser.autocomplete='off';
  const gelKey=el('input');gelKey.type='password';gelKey.autocomplete='off';gelKey.placeholder='Leave blank to keep saved key';
  const clearKey=el('input');clearKey.type='checkbox';clearKey.style.width='auto';
  const clearLabel=el('label',' Clear saved Gelbooru key');clearLabel.prepend(clearKey);
  const save=button('Save settings',async()=> {
    await rpc.request('save',{connectionId:connection.value,gelUser:gelUser.value,gelKey:gelKey.value,clearGelKey:clearKey.checked});
    gelKey.value='';clearKey.checked=false;await refresh();notify('Settings saved.');
  });
  const refreshButton=button('Refresh connections',refresh);
  const gelResult=el('p');gelResult.className='lc-muted';
  const testGel=button('Test Gelbooru',async()=> {
    const outcome=await rpc.request<GelbooruTest>('testGelbooru',{gelUser:gelUser.value,gelKey:gelKey.value});
    gelResult.textContent=`${outcome.ok?'✓':'✗'} ${outcome.message}`;notify(outcome.ok?'Gelbooru test passed.':'Gelbooru test failed. See the result under the key field.',!outcome.ok);
  });
  const credentialNotice=el('p');credentialNotice.className='lc-muted';
  settings.append(
    field('Generative connection',connection,'Uses the model saved in Lumiverse. Pick a fast text model that follows JSON instructions; Jev, Decisions and embedding models cannot translate.'),
    field('Gelbooru user ID (optional)',gelUser,'The number, not your username. You can also paste Gelbooru’s whole “&api_key=…&user_id=…” line into the key box and leave this empty.'),
    field('Gelbooru API key (optional)',gelKey,'Stored in your extension storage on the Lumiverse server. Never returned to this panel. Sent only to Gelbooru over HTTPS.'),
    clearLabel,credentialNotice,row(testGel),gelResult,row(save,refreshButton));

  // ── 01 Describe ──
  const input=card('01 / Describe');
  const source=named(el('textarea'),'source');source.rows=7;source.maxLength=12_000;source.placeholder='Paste the character’s appearance. Narrator voice and scene detail are fine; they are filtered out.';
  const stated=named(el('input'),'stated');stated.maxLength=300;stated.autocomplete='off';stated.placeholder='e.g. femboy, android, green eyes, rose-pink gradient lips';
  const runTranslate=async()=> {
    if(!source.value.trim())throw new Error('Paste a character description first.');
    const currentRevision=revision;
    const next=await rpc.request<Translation>('translate',{description:source.value,stated:stated.value,connectionId:connection.value});
    if(revision!==currentRevision) {notify('The description changed during translation. Translate again to use the new wording.');return;}
    result=next;showSheet();showStandalone();
    notify(['Translation ready.',!gelUser.value ? 'Gelbooru is not configured; verified tags use Danbooru.' : '',...next.views.scene.notices].filter(Boolean).join('\n'));
  };
  const translate=button('Translate',runTranslate,true);
  const cancel=el('button','Cancel');cancel.type='button';cancel.hidden=true;cancel.addEventListener('click',()=>{void rpc.request('cancel').then(()=>notify('Cancellation requested.')).catch(e=>notify(e.message,true));});
  input.append(
    field('Character description',source,'Only this pasted description is sent to your selected provider. No chat history is read.'),
    field('Known facts (optional)',stated,'Anything you know that the description leaves out or leaves vague: what the character is, an eye colour. Treated as true and translated into the matching tags.'),
    row(translate,cancel));

  // ── 02 Lumi Studio character sheet: the main output ──
  const copyText=async(value:string,what:string)=> {
    if(!value.trim())throw new Error(`There is no ${what} to copy yet.`);
    try{await navigator.clipboard.writeText(value);notify(`${what[0].toUpperCase()+what.slice(1)} copied.`);}catch{notify('Clipboard is unavailable here. Select the text and use your usual Copy shortcut.');}
  };
  // Field names and order match Lumi Studio's character editor so each can be pasted straight across.
  const sheetCard=card('02 / Lumi Studio character sheet');
  sheetCard.append(el('p','One field per box in Lumi Studio’s character editor. Comma-separated, no sentences.'));
  // Gaps are answered where they are shown: the box mirrors Known facts.
  const gapsBox=el('div');gapsBox.className='lc-gaps';gapsBox.hidden=true;
  const statedAgain=el('input');statedAgain.maxLength=300;statedAgain.autocomplete='off';statedAgain.placeholder='e.g. short hair, rose-pink gradient lips';statedAgain.setAttribute('aria-label','Known facts');
  const again=button('Translate again',runTranslate);
  sheetCard.append(gapsBox);
  const sheetField=(label:string,key:'countTag'|'subject'|'always'|'appearance'|'outfit',hint:string,long=false)=> {
    const box=long?el('textarea'):el('input');if(long)(box as HTMLTextAreaElement).rows=3;box.dataset.sheet=key;
    // The copy button sits on the label's line, so five fields do not become ten rows.
    const copyField=button('Copy',()=>copyText(box.value,label.toLowerCase()));copyField.className='lc-mini';copyField.setAttribute('aria-label',`Copy ${label.toLowerCase()}`);
    const head=el('div');head.className='lc-head';head.append(el('span',label),copyField);
    const wrapper=el('div');wrapper.className='lc-field';box.setAttribute('aria-label',label);wrapper.append(head,box,el('small',hint));
    sheetCard.append(wrapper);
    return {box,copyField};
  };
  const sheet={
    countTag:sheetField('Count tag','countTag','Lumi Studio keeps the count in its own field.'),
    subject:sheetField('Stable subject phrase','subject','Lumi Studio builds its own sentence around this.'),
    always:sheetField('Always include','always','The type tags that define the character.'),
    appearance:sheetField('Permanent appearance tags','appearance','Verified tags first, then short phrases for what no tag says.',true),
    outfit:sheetField('Default outfit tags','outfit','Clothing from the description. Leave it out for a character whose clothes change with the story.',true),
  };
  const provenance=el('div');const issues=el('div');const sourceQuotes=el('div');
  const evidence=el('details');evidence.className='lc-sub';evidence.append(el('summary','Where each tag came from'),provenance,issues,sourceQuotes);
  sheetCard.append(evidence);

  // ── 03 Refine, with the notes it learns from ──
  const refine=card('03 / Refine');
  const feedback=named(el('textarea'),'feedback');feedback.rows=3;feedback.maxLength=2000;feedback.placeholder='Generate an image in Lumi Studio, then say what came out wrong: “reads too masculine”, “eyes came out blue”, “no visible seams”.';
  const reply=el('p');const proposed=el('div');
  const sheetEntries=()=>[sheet.countTag.box.value,...splitTags(sheet.always.box.value),...splitTags(sheet.appearance.box.value),...splitTags(sheet.outfit.box.value)].map(v=>v.trim()).filter(Boolean);
  const suggest=button('Suggest changes',async()=> {
    const entries=sheetEntries();
    if(!entries.length)throw new Error('Translate a character first.');
    if(!feedback.value.trim())throw new Error('Say what the image got wrong first.');
    const next=await rpc.request<Refinement>('refine',{connectionId:connection.value,tags:entries,caption:prose.value,feedback:feedback.value,description:source.value,stated:stated.value});
    pending=next.proposals;reply.textContent=next.reply;proposed.replaceChildren();
    pending.forEach((p,i)=> {
      const line=el('label');line.className='lc-proposal';const box=el('input');box.type='checkbox';box.checked=true;box.dataset.index=String(i);
      const shown=p.tag?formatWeighted({name:p.tag,weight:p.weight===1?undefined:p.weight},true):'';
      const what=p.kind==='add'?`Add ${shown}`:p.kind==='remove'?`Remove ${shown}`:p.kind==='weight'?(p.weight===1?`Clear the weight on ${shown}`:`Weight ${shown}`):'Replace the standalone detail';
      const body=el('span');body.append(el('strong',what),document.createTextNode(p.why?` — ${p.why}`:''));
      if(p.kind==='caption')body.append(el('blockquote',p.caption));
      if(p.definition)body.append(el('small',` Danbooru: ${p.definition}`));
      line.append(box,body);proposed.append(line);
    });
    notify([pending.length?'Suggestions ready. Untick any you do not want, then apply.':'No changes were suggested.',...next.notices].join('\n'));update();
  },true);
  const apply=button('Apply selected',()=> {
    const chosen=Array.from(proposed.querySelectorAll('input')).filter(b=>b.checked).map(b=>pending[Number(b.dataset.index)]);
    if(!chosen.length)throw new Error('Tick at least one suggestion.');
    const COUNT=/^1(?:girl|boy|other)$/;
    // The count tag has its own box in Lumi Studio, so a count change goes there and nowhere else.
    for(const p of chosen)if(p.tag&&COUNT.test(p.tag)){if(p.kind==='add')sheet.countTag.box.value=p.tag;if(p.kind==='remove'&&sheet.countTag.box.value.trim()===p.tag)sheet.countTag.box.value='';}
    const changes=chosen.filter(p=>!p.tag||!COUNT.test(p.tag));
    sheet.always.box.value=editList(sheet.always.box.value,changes);sheet.outfit.box.value=editList(sheet.outfit.box.value,changes);
    // A new tag lands in the appearance field for you to move if it is clothing.
    const elsewhere=new Set([...splitTags(sheet.always.box.value),...splitTags(sheet.outfit.box.value)].map(v=>v.replace(/^\((.+?):[\d.]+\)$/,'$1').trim().toLowerCase().replace(/_/g,' ')));
    sheet.appearance.box.value=editList(sheet.appearance.box.value,changes.filter(p=>p.kind!=='add'||!elsewhere.has(p.tag!.replace(/_/g,' '))),true);
    // The standalone prompt gets the same changes where they apply to it.
    let list=splitTags(tags.value).map(parseWeighted);
    for(const p of changes) {
      if(p.kind==='remove')list=list.filter(t=>t.name!==p.tag);
      if(p.kind==='weight')list=list.map(t=>t.name===p.tag?(p.weight===1?{name:t.name}:{name:t.name,weight:p.weight}):t);
      if(p.kind==='add'&&!list.some(t=>t.name===p.tag))list.push({name:p.tag!,weight:p.weight});
      if(p.kind==='caption')prose.value=p.caption!;
    }
    tags.value=list.map(t=>formatWeighted(t)).join(', ');edited=true;
    if(verified||!tags.value.trim())prompt.value=assemble(list,prose.value);
    pending=[];proposed.replaceChildren();feedback.value='';
    notify('Changes applied to the character sheet. Paste the changed fields into Lumi Studio and generate again.');
  });
  const notes=named(el('textarea'),'notes');notes.rows=4;notes.maxLength=2000;notes.placeholder='e.g. Femboys: weight trap at 1.4. Androids: add visible panel seams at the shoulders and concealed joints.';
  const saveNotes=button('Save notes',async()=>{await rpc.request('saveNotes',{notes:notes.value});notify('Notes saved. They apply from the next translation or refinement.');});
  const notesBox=el('details');notesBox.className='lc-sub';notesBox.append(el('summary','Your Anima notes'),field('What you have learned works',notes,'In your own words. Saved, and read on every translation and refinement. A weight is only ever applied when a note gives the number.'),saveNotes);
  refine.append(field('What did the image get wrong?',feedback,'LumiCast cannot see the image. It works from what you say here, your description, your notes and the sheet above.'),row(suggest),reply,proposed,row(apply),notesBox);

  // ── Standalone prompt: for use without Lumi Studio ──
  const output=el('details');output.className='lc-card';output.append(el('summary','Standalone Anima prompt (without Lumi Studio)'));
  const scope=el('select');scope.append(option('Character only — body, hair and face','character'),option('Character and outfit','outfit'),option('Everything — outfit, pose, expression and scene','scene'));
  const tags=named(el('textarea'),'tags');tags.rows=3;tags.maxLength=4000;tags.placeholder='Verified booru tags appear here';
  const prose=named(el('textarea'),'prose');prose.rows=6;prose.maxLength=16_000;prose.placeholder='A short caption for what the tags cannot say';
  const tagState=el('p','Translate to verify tags.');tagState.className='lc-muted';
  const verify=button('Verify edited tags',async()=> {
    const entered=splitTags(tags.value).map(parseWeighted);
    const checks=await rpc.request<{requested:string;tag:VerifiedTag|null}[]>('verify',{names:entered.map(t=>t.name)});
    const missing=checks.filter(r=>!r.tag).map(r=>r.requested);
    if(missing.length)throw new Error(`Unverified tags: ${missing.join(', ')}. Remove them or describe them in prose.`);
    const compatible=removeConflicts(checks.map(r=>({...r.tag!,evidence:'',traitId:''})));
    // Weights are the user's own; they follow the tag through alias resolution.
    const weights=new Map(checks.map((c,i)=>[c.tag!.name,entered[i].weight]));
    tags.value=[...new Set(compatible.map(r=>r.name))].map(name=>formatWeighted({name,weight:weights.get(name)})).join(', ');verified=true;
    tagState.textContent='Edited tags exist in the dictionary. Manual edits have not had AI meaning review; check them against your description.';
    notify(compatible.length<checks.length?'Edited tags verified; conflicting tags removed.':'Edited tags verified. Rebuild the prompt when ready.');update();
  });
  // The tags are copied the way Anima reads them: spaces, weights kept.
  const copyTags=button('Copy tags',()=>copyText(assemble(splitTags(tags.value),''),'tags'));
  const copyProse=button('Copy detail',()=>copyText(prose.value,'detail'));
  const prompt=named(el('textarea'),'prompt');prompt.rows=8;prompt.maxLength=24_000;
  const rebuild=button('Rebuild from tags + detail',()=> {
    if(tags.value.trim()&&!verified)throw new Error('Verify edited tags before rebuilding.');
    prompt.value=assemble(splitTags(tags.value),prose.value);notify('Prompt rebuilt.');
  });
  const copy=button('Copy prompt',async()=> {
    if(!prompt.value.trim())throw new Error('There is no prompt to copy yet.');
    try{await navigator.clipboard.writeText(prompt.value);notify('Prompt copied.');}catch{prompt.focus();prompt.select();notify('Clipboard is unavailable here. The prompt is selected; use your usual Copy shortcut.');}
  },true);
  output.append(
    el('p','Tags followed by a caption in sentences, for pasting straight into an image tool. Lumi Studio does not use this.'),
    field('Include',scope,'What this prompt covers. Switching needs no new translation.'),
    field('Booru tags — comma separated',tags,'Underscores here; the prompt uses spaces. Add emphasis as (tag:1.4).'),tagState,row(verify,copyTags),
    field('Caption',prose,'Edit freely; nothing the text leaves out is filled in.'),copyProse,
    field('Assembled prompt',prompt,'Rebuild applies edits above and replaces this field. Copy copies exactly what is shown.'),row(rebuild,copy),
    el('p','No quality, score, safety or artist tags are added; add your own.'));

  // ── Tag lookup ──
  const searchCard=el('details');searchCard.className='lc-card';searchCard.append(el('summary','Find a real tag'));
  const query=el('input');query.maxLength=100;const found=el('div');
  const search=button('Search Danbooru',async()=> {
    const matches=await rpc.request<VerifiedTag[]>('search',{query:query.value});found.replaceChildren();
    if(!matches.length)found.append(el('p','No matching general tags found. Try another spelling.'));
    for(const match of matches){const p=el('p');const link=el('a',match.name);link.href=match.url;link.target='_blank';link.rel='noopener noreferrer';p.append(link,document.createTextNode(` · ${match.count.toLocaleString()} posts`));found.append(p);}
    notify('Search complete. Popularity is not an Anima quality score.');
  });
  searchCard.append(field('Tag name or the start of one',query,'Lists Danbooru tags that begin with what you type, most used first, so you can check a tag exists before adding it to a field. No images are fetched.'),search,found);

  app.append(intro,settings,status,input,sheetCard,refine,output,searchCard,el('p','LumiCast 0.5.1 · Draft stays in this tab until reload.'));
  const controls=[translate,again,save,refreshButton,testGel,saveNotes,verify,rebuild,copy,copyTags,copyProse,suggest,apply,search,...Object.values(sheet).map(f=>f.copyField)];

  function showSheet(){
    if(!result)return;
    for(const key of Object.keys(sheet) as (keyof typeof sheet)[])sheet[key].box.value=result.sheet[key];
    gapsBox.replaceChildren();gapsBox.hidden=!result.gaps.length;
    if(result.gaps.length) {
      gapsBox.append(el('strong','Worth pinning down'));
      const list=el('ul');result.gaps.forEach(g=>list.append(el('li',`${g.kind==='missing'?'Not stated':'Vague'}: ${g.what}. ${g.note}`)));
      statedAgain.value=stated.value;
      gapsBox.append(list,el('small','LumiCast does not fill these in. Add what you know here, or edit the fields below.'),row(statedAgain,again));
    }
    // The sheet holds the character and the outfit, so that is what the sources list covers.
    const view=result.views.outfit;
    provenance.replaceChildren();
    view.tags.forEach(t=> {
      const item=el('div');item.className='lc-provenance';const link=el('a',`${t.name} · ${t.source}${t.aliasFrom ? ` · alias: ${t.aliasFrom}` : ''}`);link.href=t.url;link.target='_blank';link.rel='noopener noreferrer';
      item.append(link,el('blockquote',t.evidence));provenance.append(item);
    });
    issues.replaceChildren();result.issues.forEach(i=>issues.append(el('p',`${i.kind}: ${i.message}`),el('blockquote',i.evidence.join(' / '))));
    sourceQuotes.replaceChildren(el('p','Passages the result was built from:'));
    view.evidence.forEach(t=>sourceQuotes.append(el('blockquote',t.evidence)));
    pending=[];proposed.replaceChildren();reply.textContent='';
  }
  // Every scope comes back from one translation, so changing Include only re-renders this part.
  function showStandalone(){
    if(!result)return;
    const view=result.views[scope.value as Scope];
    tags.value=view.tags.map(t=>formatWeighted(t)).join(', ');prose.value=view.prose;prompt.value=view.prompt;verified=true;edited=false;
    tagState.textContent=view.tags.length ? `${view.tags.length} tags, each a live booru tag. ${result.model}.` : `No verified tags to show here. ${result.model}.`;
    update();
  }
  function update(){
    for(const c of controls)c.disabled=busy;
    rebuild.disabled=busy||(!verified&&!!tags.value.trim());apply.disabled=busy||!pending.length;copy.disabled=busy||!prompt.value.trim();cancel.hidden=!busy;
    for(const node of [connection,gelUser,gelKey,clearKey])node.disabled=busy;
    for(const node of [source,stated,statedAgain,feedback,notes,tags,prose,prompt,...Object.values(sheet).map(f=>f.box)])node.readOnly=busy;
  }
  function notify(message:string,error=false){if(closed)return;status.textContent=message;status.dataset.error=String(error);}
  function row(...children:HTMLElement[]){const n=el('div');n.className='lc-row';n.append(...children);return n;}
  function card(title:string){const n=el('section');n.className='lc-card';n.append(el('h2',title));return n;}
  function button(label:string,action:()=>void|Promise<void>,primary=false){const b=el('button',label);b.type='button';if(primary)b.className='lc-primary';b.addEventListener('click',()=>{if(busy||closed)return;busy=true;update();notify('Working…');void Promise.resolve().then(action).catch(e=>notify(e instanceof Error?e.message:'The operation failed.',true)).finally(()=>{busy=false;if(!closed)update();});});return b;}
  async function refresh(){
    const snapshot=await rpc.request<Snapshot>('snapshot');if(closed)return;
    const selected=connection.value||snapshot.settings.connectionId;connection.replaceChildren();connection.append(option('Select a generative connection',''));
    for(const c of snapshot.connections){const o=option(`${c.name} · ${c.provider} / ${c.model}${c.supported?'':' (not generative)'}`,c.id);o.disabled=!c.supported;connection.append(o);}
    connection.value=selected;gelUser.value=snapshot.settings.gelUser;notes.value=snapshot.settings.notes;
    credentialNotice.textContent=snapshot.settings.hasGelKey?'Gelbooru key saved.':'Danbooru works without credentials. Gelbooru requires its account API key.';
    if(!connection.value)settings.open=true;
  }
  source.addEventListener('input',()=>{revision++;if(result)notify('Description changed. Translate again to refresh the result.');});
  const factsChanged=(from:HTMLInputElement,to:HTMLInputElement)=>from.addEventListener('input',()=>{to.value=from.value;revision++;if(result)notify('Known facts changed. Translate again to refresh the result.');});
  factsChanged(stated,statedAgain);factsChanged(statedAgain,stated);
  scope.addEventListener('change',()=>{if(busy||!result)return;const replaced=edited;showStandalone();if(replaced)notify('Standalone fields reset from the translation; your manual edits there were replaced.');});
  tags.addEventListener('input',()=>{verified=false;edited=true;tagState.textContent='Tags edited — verify existence before rebuilding. Clear all tags to use the caption only.';update();});
  prose.addEventListener('input',()=>{edited=true;notify('Caption changed. Rebuild to apply it to the prompt.');});
  prompt.addEventListener('input',()=>{edited=true;update();});
  busy=true;update();void refresh().then(()=>notify('Paste an appearance and choose Translate.')).catch(e=>notify(e.message,true)).finally(()=>{busy=false;if(!closed)update();});
  return () => {closed=true;ctx.sendToBackend({type:'lumicast:request',id:crypto.randomUUID(),action:'cancel'});rpc.destroy();removeStyle();tab.destroy();};
}
