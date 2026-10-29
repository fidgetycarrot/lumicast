import {test,expect} from 'bun:test';
import {cleanMoss,cleanOutfit,helmetOn,uncoveredTags} from '../src/moss';
import {Translator} from '../src/engine';
const signal=()=>new AbortController().signal;
test('MOSS text keeps to what worked: living skin, irises, no glowing eyes, no expressions, nothing explicit, lower-case start',()=> {
  const {moss,notices}=cleanMoss('A devastatingly pretty adult man with porcelain-pale skin, gold circuitry around the irises, big glowing amber eyes, a faint smirk, rosy nipples. His slender body has narrow shoulders and a flat male chest.','',[]);
  expect(moss).toBe('a devastatingly pretty adult man with fair skin, gold circuitry inside the irises, big amber eyes. His slender body has narrow shoulders and a flat male chest.');
  expect(notices.join(' ')).toContain('Explicit words were left out');expect(notices.join(' ')).toContain('A facial expression was left out');
  expect(cleanMoss('An elf with chalk-white skin.','',[]).moss).toBe('an elf with fair skin.');
});
test('a helmet worn on the head leaves the MOSS text empty, as Lumi Studio expects; one carried does not',()=> {
  expect(helmetOn(['angular storm-grey vox-grille helmet with glowing amber visor eye-lenses'])).toBe(true);
  expect(helmetOn(['helmet tucked under his arm'])).toBe(false);
  const worn=cleanMoss('A tall man with short grey hair.','',['power armor','angular helmet']);
  expect(worn.moss).toBe('');expect(worn.notices.join(' ')).toContain('helmet on');
});
test('outfit items are whole garments: no commas, no leading article, no sleeveless corsets, nothing explicit',()=> {
  expect(cleanOutfit(['A sleeveless black corset with lace, cravat','thigh-high black leather boots','thigh-high black leather boots','lacy underwear','sleeveless white tunic'],'')).toEqual(['black corset with lace cravat','thigh-high black leather boots','sleeveless white tunic']);
  expect(uncoveredTags(['thigh boots','leather boots','black footwear','gloves','epaulettes'],['thigh-high black leather boots','red coat with gold epaulets'])).toEqual(['gloves']);
});
test('a character sent from Lumi Studio is rewritten for MOSS in one call, keeping garments the phrases missed',async()=> {
  let input='';
  const engine=new Translator(async(system,body)=>{input=body;expect(system).toContain('You rewrite one saved image-tool character for MOSS Image');return JSON.stringify({moss:'A sharp-featured adult man with smooth fair skin and sharp, half-lidded amber eyes.',outfit:['crimson silk officer coat with heavy gold bullion epaulets','thigh-high black leather boots']});},{resolve:async()=>null,search:async()=>[]});
  const sheet={countTag:'1boy',subject:'adult man',always:'trap',appearance:'amber eyes',outfit:'red coat, epaulettes, thigh boots, leather boots, white gloves',anatomy:'explicit',moss:''};
  const out=await engine.mossify({sheet,description:'Vesper, sharp and haughty.'},signal());
  expect(out.moss).toBe('a sharp-featured adult man with smooth fair skin and sharp, half-lidded amber eyes.');
  expect(out.outfit).toEqual(['crimson silk officer coat with heavy gold bullion epaulets','thigh-high black leather boots','white gloves']);
  // Explicit anatomy is never sent to the MOSS writer.
  expect(JSON.parse(input).sheet.anatomy).toBeUndefined();expect(JSON.parse(input).description).toBe('Vesper, sharp and haughty.');
});
test('Refine for MOSS suggests wording, never tags: a checked new description and garment-by-garment outfit changes',async()=> {
  let sent:Record<string,unknown>={};
  const reply={reply:'The pale-skin word turned him grey.',moss:'A devastatingly pretty adult man with porcelain-pale skin and a slight smirk, sharp half-lidded amber eyes.',why:'living skin',
    outfit:{remove:[{item:'Red Coat',why:'duplicate'},{item:'not worn',why:'x'}],change:[{from:'black corset',to:'sleeveless fitted black corset with white lace cravat',why:'no sleeveless'}],add:[{item:'white silk gloves',why:'in the description'},{item:'thigh-high black leather boots',why:'dup'}]}};
  const engine=new Translator(async(system,body)=>{sent=JSON.parse(body);expect(system).toContain('You help a user fix how MOSS Image draws');return JSON.stringify(reply);},{resolve:async()=>null,search:async()=>[]});
  const out=await engine.refineMoss({moss:'a pretty man with pale skin.',outfit:['crimson silk officer coat with gold epaulets','red coat','black corset','thigh-high black leather boots'],feedback:'skin came out grey and he has two coats',notes:'MOSS: keep eyes amber.'},signal(),'m');
  expect(sent).toMatchObject({moss:'a pretty man with pale skin.',feedback:'skin came out grey and he has two coats',notes:'MOSS: keep eyes amber.'});
  expect(out.proposals.map(p=>[p.kind,p.from??'',p.text])).toEqual([
    ['moss','','a devastatingly pretty adult man with fair skin. sharp half-lidded amber eyes.'.replace('fair skin. sharp','fair skin, sharp')],
    ['garment-remove','','red coat'],
    ['garment-change','black corset','fitted black corset with white lace cravat'],
    ['garment-add','','white silk gloves'],
  ]);
  expect(out.notices.join(' ')).toContain('A facial expression was left out');
});
test('Refine for MOSS empties the description once a helmet is on, and needs something to work on',async()=> {
  const engine=new Translator(async()=>JSON.stringify({reply:'Helmet.',moss:null,outfit:{add:[{item:'angular steel helmet with a narrow visor slit',why:'it is worn'}]}}),{resolve:async()=>null,search:async()=>[]});
  const out=await engine.refineMoss({moss:'a tall man with grey hair.',outfit:['steel plate armor'],feedback:'his hair shows'},signal(),'m');
  expect(out.proposals.map(p=>[p.kind,p.text])).toEqual([['moss',''],['garment-add','angular steel helmet with a narrow visor slit']]);
  expect(engine.refineMoss({moss:'',outfit:[],feedback:'x'},signal(),'m')).rejects.toThrow('There is no MOSS description or outfit yet');
});
test('a MOSS description with no eyes is flagged, since MOSS then draws blank white eyes',()=> {
  expect(cleanMoss('A gaunt middle-aged woman with weathered fair skin.','',[]).notices.join(' ')).toContain('names no eyes');
  expect(cleanMoss('A gaunt middle-aged woman with weathered fair skin and cold grey eyes.','',[]).notices).toEqual([]);
});
