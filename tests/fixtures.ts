import type { Scope, Trait } from '../src/contracts';
/** Controlled model responses: these exercise the engine's handling, not a live model's judgement. */
export interface Fixture { name:string; source:string; scope?:Scope; traits:Trait[]; drop?:string[]; caption?:string; issues?:unknown[]; tags:string[]; prose?:string; absent?:RegExp }
const narrated = `Mara, 24, grad student. Height/build: 5'3", petite. Small frame, the kind that folds up into a lecture seat and basically disappears into a hoodie. Figure: B cup, slim waist, modest curves, you know the type. Hair: dark, near-black, shoulder-length-ish, shoved up in a claw clip and given up on. Face: soft features, grey eyes, wearing the dead-eyed boredom mask of a girl on her ninth Skinner lecture, chin propped in her palm. Wearing: oversized hoodie, sleeves swallow her hands to the knuckles, and thin leggings, now very much soaked-through.`;
const narratedTraits: Trait[] = [
  {id:'t1',group:'subject',evidence:'Mara, 24, grad student.',tags:['1girl','solo'],detail:'A 24-year-old woman'},
  {id:'t2',group:'body',evidence:'petite. Small frame',tags:['petite'],detail:'A petite build with a small frame'},
  {id:'t3',group:'body',evidence:'B cup, slim waist, modest curves',tags:['medium_breasts','narrow_waist'],detail:'A slim waist and modest curves'},
  {id:'t4',group:'hair',evidence:'dark, near-black, shoulder-length-ish',tags:['black_hair','medium_hair'],detail:'Near-black hair, about shoulder length'},
  {id:'t5',group:'moment',evidence:'shoved up in a claw clip and given up on',tags:['hair_up','hair_clip'],detail:'Hair pulled up in a claw clip'},
  {id:'t6',group:'face',evidence:'soft features, grey eyes',tags:['grey_eyes'],detail:'Soft facial features and grey eyes'},
  {id:'t7',group:'moment',evidence:'dead-eyed boredom mask',tags:['bored'],detail:'A bored expression'},
  {id:'t8',group:'moment',evidence:'chin propped in her palm',tags:['head_rest'],detail:'Her chin resting in her palm'},
  {id:'t9',group:'outfit',evidence:'oversized hoodie, sleeves swallow her hands to the knuckles',tags:['hoodie','oversized_clothes','sleeves_past_wrists'],detail:'An oversized hoodie with sleeves covering her hands to the knuckles'},
  {id:'t10',group:'outfit',evidence:'thin leggings',tags:['leggings'],detail:'Thin leggings'},
  {id:'t11',group:'moment',evidence:'now very much soaked-through',tags:['wet_clothes'],detail:'Leggings visibly wet'},
];
const filler = /you know|Skinner|grad student|given up|B cup|5'3|_/;
const fixtures: Fixture[] = [
  {name:'subtle proportions stay in the caption, not exaggerated tags',source:'A woman with a broad ribcage, a softly defined waist, and a barely upturned nose. Her eyes are blue.',
    traits:[{id:'t1',group:'subject',evidence:'A woman',tags:['1girl','solo'],detail:'A woman'},{id:'t2',group:'body',evidence:'a broad ribcage, a softly defined waist',tags:[],detail:'A broad ribcage and a softly defined waist'},{id:'t3',group:'face',evidence:'a barely upturned nose',tags:[],detail:'A barely upturned nose'},{id:'t4',group:'face',evidence:'Her eyes are blue.',tags:['blue_eyes'],detail:'Blue eyes'}],
    caption:'A woman with a broad ribcage and a softly defined waist. She has a barely upturned nose and blue eyes.',tags:['1girl','blue_eyes'],prose:'A woman with a broad ribcage and a softly defined waist. She has a barely upturned nose and blue eyes.'},
  {name:'heterochromia keeps left/right ownership in the caption',source:'His left eye is amber; his right eye is blue. His hair is black with a thin white streak at the temple.',
    traits:[{id:'t1',group:'face',evidence:'His left eye is amber; his right eye is blue.',tags:['heterochromia'],detail:'An amber left eye and a blue right eye'},{id:'t2',group:'hair',evidence:'His hair is black with a thin white streak at the temple.',tags:['black_hair','streaked_hair'],detail:'Black hair with a thin white streak at the temple'}],
    tags:['black_hair','streaked_hair','heterochromia'],prose:'Black hair with a thin white streak at the temple. An amber left eye and a blue right eye.'},
  {name:'nonhuman anatomy does not invent species',source:'A humanoid with translucent fins in place of ears and faint silver speckles under olive skin.',
    traits:[{id:'t1',group:'body',evidence:'translucent fins in place of ears and faint silver speckles under olive skin',tags:[],detail:'Translucent fins in place of ears and faint silver speckles under olive skin'}],tags:[]},
  {name:'reviewer drops a tag that came from a metaphor',source:'She has a wolfish grin, not wolf ears. Her hair is shoulder-length, neither cropped nor waist-length.',
    traits:[{id:'t1',group:'face',evidence:'She has a wolfish grin, not wolf ears.',tags:['wolf_ears'],detail:'A wolfish grin'},{id:'t2',group:'hair',evidence:'Her hair is shoulder-length',tags:['medium_hair'],detail:'Shoulder-length hair'}],drop:['wolf_ears'],tags:['medium_hair']},
  {name:'sparse description needs no absent attributes',source:'Short red hair.',traits:[{id:'t1',group:'hair',evidence:'Short red hair.',tags:['red_hair','short_hair'],detail:'Short red hair'}],tags:['red_hair','short_hair'],prose:'Short red hair.'},
  {name:'contradiction keeps no guessed winner',source:'Her hair is jet black. Her hair is entirely white.',
    traits:[{id:'t1',group:'hair',evidence:'Her hair is jet black.',tags:['black_hair'],detail:'Jet black hair'},{id:'t2',group:'hair',evidence:'Her hair is entirely white.',tags:['white_hair'],detail:'Entirely white hair'}],
    issues:[{kind:'contradiction',traitIds:['t1','t2'],message:'Two incompatible hair colors are stated.'}],tags:[]},
  {name:'two characters keep their own colours in the caption',source:'Mara has blue eyes and a green coat; Sol has brown eyes and a red scarf.',
    traits:[{id:'t1',group:'face',evidence:'Mara has blue eyes',tags:[],detail:'Mara has blue eyes'},{id:'t2',group:'face',evidence:'Sol has brown eyes',tags:[],detail:'Sol has brown eyes'}],tags:[]},
  {name:'ambiguity is limited to a real alternative',source:'Her eyes are blue or grey; the narrator cannot tell.',
    traits:[{id:'t1',group:'face',evidence:'Her eyes are blue or grey',tags:['blue_eyes'],detail:'Eyes that are blue or grey'}],issues:[{kind:'ambiguity',traitIds:['t1'],message:'The source gives two alternatives for eye color.'}],tags:[]},
  {name:'narrated scene, character only: reusable identity without clothes or pose',source:narrated,traits:narratedTraits,
    caption:'A petite 24-year-old woman with a small frame, a slim waist and modest curves. Near-black hair, about shoulder length. Soft facial features and grey eyes.',
    tags:['1girl','petite','small_breasts','narrow_waist','black_hair','medium_hair','grey_eyes'],
    prose:'A petite 24-year-old woman with a small frame, a slim waist and modest curves. Near-black hair, about shoulder length. Soft facial features and grey eyes.',absent:/hoodie|leggings|bored|clip|wet|solo/},
  {name:'narrated scene, with outfit',source:narrated,scope:'outfit',traits:narratedTraits,
    tags:['1girl','petite','small_breasts','narrow_waist','black_hair','medium_hair','grey_eyes','hoodie','oversized_clothes','sleeves_past_wrists','leggings'],absent:/bored|clip|wet|solo/},
  {name:'narrated scene, everything',source:narrated,scope:'scene',traits:narratedTraits,
    tags:['1girl','solo','petite','small_breasts','narrow_waist','black_hair','medium_hair','grey_eyes','hoodie','oversized_clothes','sleeves_past_wrists','leggings','hair_up','hair_clip','bored','head_rest','wet_clothes']},
];
export const cases: Fixture[] = fixtures.map(f => ({...f, absent: f.absent ?? (f.source === narrated ? filler : undefined)}));
export const narratedFiller = filler;
