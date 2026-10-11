import type { Trait } from '../src/contracts';
const fixtures: {name:string;source:string;traits:Trait[];keep:string[];issues?:unknown[];covered?:string[];prose?:string}[] = [
  {name:'subtle proportions are prose, not exaggerated anatomy',source:'A woman with a broad ribcage, a softly defined waist, and a barely upturned nose. Her eyes are blue.',traits:[{id:'t1',evidence:'A woman with a broad ribcage, a softly defined waist, and a barely upturned nose.',tag:null},{id:'t2',evidence:'Her eyes are blue.',tag:'blue_eyes'}],keep:['blue_eyes']},
  {name:'heterochromia preserves left/right ownership',source:'His left eye is amber; his right eye is blue. His hair is black with a thin white streak at the temple.',traits:[{id:'t1',evidence:'His left eye is amber; his right eye is blue.',tag:'heterochromia'},{id:'t2',evidence:'His hair is black with a thin white streak at the temple.',tag:null}],keep:['heterochromia']},
  {name:'nonhuman anatomy does not invent species',source:'A humanoid with translucent fins in place of ears and faint silver speckles under olive skin.',traits:[{id:'t1',evidence:'A humanoid with translucent fins in place of ears and faint silver speckles under olive skin.',tag:null}],keep:[]},
  {name:'negation and metaphor do not turn into anatomy',source:'She has a wolfish grin, not wolf ears. Her hair is shoulder-length, neither cropped nor waist-length.',traits:[{id:'t1',evidence:'She has a wolfish grin, not wolf ears.',tag:'wolf_ears'},{id:'t2',evidence:'Her hair is shoulder-length, neither cropped nor waist-length.',tag:null}],keep:[]},
  {name:'sparse description requires no absent attributes',source:'Short red hair.',traits:[{id:'t1',evidence:'Short red hair.',tag:'red_hair'}],keep:['red_hair']},
  {name:'contradiction retained without a guessed winner',source:'Her hair is jet black. Her hair is entirely white.',traits:[{id:'t1',evidence:'Her hair is jet black.',tag:'black_hair'},{id:'t2',evidence:'Her hair is entirely white.',tag:'white_hair'}],keep:[],issues:[{kind:'contradiction',evidence:['Her hair is jet black.','Her hair is entirely white.'],message:'Two incompatible hair colors are stated.'}]},
  {name:'two characters retain assigned colors',source:'Mara has blue eyes and a green coat; Sol has brown eyes and a red scarf.',traits:[{id:'t1',evidence:'Mara has blue eyes and a green coat; Sol has brown eyes and a red scarf.',tag:null}],keep:[]},
  {name:'ambiguity is limited to a genuine alternative',source:'Her eyes are blue or grey; the narrator cannot tell.',traits:[{id:'t1',evidence:'Her eyes are blue or grey; the narrator cannot tell.',tag:null}],keep:[],issues:[{kind:'ambiguity',evidence:['Her eyes are blue or grey; the narrator cannot tell.'],message:'The source gives two alternatives for eye color.'}]},
  {
    name:'personality-heavy narration becomes compact visual detail',
    source:'She is 21. A tiny, light, compact frame, basically disappearing into that hoodie, you know? B cup. Near-black, shoulder-length-ish hair shoved up in a claw clip, loose strands around her face and neck. Soft features, youthful but looks her age. A dead-eyed boredom mask, chin propped in her palm. Oversized hoodie, sleeves swallow her hands to the knuckles. Thin leggings, visibly soaked through. Her eyes are blue. Psych major and a sarcastic know-it-all.',
    traits:[
      {id:'t1',evidence:'She is 21.',tag:null,detail:'A 21-year-old woman'},
      {id:'t2',evidence:'A tiny, light, compact frame, basically disappearing into that hoodie, you know?',tag:null,detail:'A small, light, compact frame'},
      {id:'t3',evidence:'B cup.',tag:null,detail:'B-cup bust'},
      {id:'t4',evidence:'Near-black, shoulder-length-ish hair shoved up in a claw clip, loose strands around her face and neck.',tag:'black_hair',detail:'Near-black hair of approximately shoulder length, held in a claw clip with loose strands around her face and neck'},
      {id:'t5',evidence:'Soft features, youthful but looks her age.',tag:null,detail:'Soft facial features and a youthful adult appearance'},
      {id:'t6',evidence:'A dead-eyed boredom mask, chin propped in her palm.',tag:'bored',detail:'A bored expression, with her chin resting in her palm'},
      {id:'t7',evidence:'Oversized hoodie, sleeves swallow her hands to the knuckles.',tag:'hoodie',detail:'An oversized hoodie with sleeves covering her hands to the knuckles'},
      {id:'t8',evidence:'Thin leggings, visibly soaked through.',tag:'leggings',detail:'Thin, visibly wet leggings'},
      {id:'t9',evidence:'Her eyes are blue.',tag:'blue_eyes',detail:'Blue eyes'},
    ],keep:['black_hair','bored','hoodie','leggings','blue_eyes'],covered:['t9'],
    prose:'A 21-year-old woman. A small, light, compact frame. B-cup bust. Near-black hair of approximately shoulder length, held in a claw clip with loose strands around her face and neck. Soft facial features and a youthful adult appearance. A bored expression, with her chin resting in her palm. An oversized hoodie with sleeves covering her hands to the knuckles. Thin, visibly wet leggings.',
  },
];
export const cases = fixtures.map(f => ({...f,traits:f.traits.map(t=>({...t,detail:t.detail ?? t.evidence}))}));
