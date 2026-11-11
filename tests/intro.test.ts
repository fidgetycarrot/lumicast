import {test,expect} from 'bun:test';
import {buildIntro,introRequest,lettersFor,naiWeights} from '../src/intro';
const sheet={countTag:'1boy',subject:'adult man',always:'(trap:1.4)',appearance:'brown hair, curly_hair',outfit:'linen shirt, leather boots',anatomy:'penis',moss:''};
test('the name on the card: typed wins, a real nickname is allowed, an unrelated one is not',()=> {
  expect(lettersFor('Lauren Vance','Lauren')).toBe('LAUREN');
  expect(lettersFor('Alexandria Rhys','Alex')).toBe('ALEX');
  expect(lettersFor('Lauren Vance','Stella')).toBe('LAUREN');
  expect(lettersFor('Lauren Vance','Lauren','Brat!')).toBe('BRAT');
  expect(lettersFor('Zoë O’Neil','')).toBe('ZOE');
});
test('weights become NovelAI weights',()=> { expect(naiWeights('(trap:1.4), brown_hair, (red hair:0.8)')).toBe('1.4::trap ::, brown hair, 0.8::red hair ::'); });
test('without a style, a pose or the anatomy switch the card still holds together and says what is missing',()=> {
  const input={sheet,name:'Rory',anatomy:false};
  const card=buildIntro(JSON.stringify({letters:'Rory',camera:'portrait',lettering:'',outfit:'visible penis outline',pose:'standing',place:'stable yard',lighting:'multiple views'}),input,'');
  expect(card.prompt).toBe('1boy, solo, cowboy shot,\nin front of giant block letters, background text, character name, letters partially hidden behind character,\nbold block lettering,\n1.4::trap ::, brown hair, curly hair, flat chest, linen shirt, leather boots,\nstable yard,\nText: RORY');
  expect(card.notices.join(' ')).toContain('no usable pose');
  expect(JSON.parse(introRequest(input)).anatomy).toBeUndefined();
  expect(JSON.parse(introRequest({...input,anatomy:true})).anatomy).toBe('penis');
  expect(buildIntro('{"letters":"Bartholomew","pose":"reading a ledger"}',{sheet,name:'Bartholomew Finch'},'x').notices.join(' ')).toContain('long for NovelAI');
});
test('a femboy gets a camera that can show he is male, a flat chest, and a bulge only with the switch on',()=> {
  const raw=JSON.stringify({letters:'Lyraen',camera:'cowboy shot, from side',lettering:'elegant serif lettering',outfit:'navy scholar robes',pose:'leaning on balustrade, sly smile',place:'observatory balcony',lighting:'moonlight'});
  const off=buildIntro(raw,{sheet,name:'Lyraen'},'style');
  expect(off.prompt).toContain('1boy, solo, cowboy shot, off-center, character on right side,');expect(off.prompt).toContain('flat chest, navy scholar robes,');expect(off.prompt).not.toContain('bulge');
  expect(off.undesired).toContain('breasts');
  expect(buildIntro(raw,{sheet,name:'Lyraen',anatomy:true},'style').prompt).toContain('navy scholar robes, bulge,');
  expect(JSON.parse(introRequest({sheet,name:'Lyraen'})).who).toContain('he is male');
});
test('Revise sends the take and the feedback, not the earlier takes',()=> {
  const sent=JSON.parse(introRequest({sheet,name:'Rory',feedback:'make it night',current:{place:'stable yard'},earlier:[{camera:'a',pose:'b',place:'c'}],notes:'Intro: never looking at viewer'}));
  expect(sent.feedback).toBe('make it night');expect(sent.current).toEqual({place:'stable yard'});expect(sent.earlier).toBeUndefined();expect(sent.notes).toContain('Intro:');
});
