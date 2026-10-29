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
