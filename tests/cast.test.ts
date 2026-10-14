import {test,expect} from 'bun:test';
import {answersOoc,entryContent,lastOocExchange,OOC,parseCast,type ChatLine} from '../src/cast';
const line=(id:string,role:string,content:string):ChatLine=>({id,role,content});
test('the [ooc] marker is found in its usual spellings, and only at the start',()=> {
  for(const yes of ['[ooc] describe her','[OOC]: describe her','(ooc: describe her)','((OOC)) hi','OOC: who is she?','  [ ooc ] x'])expect(OOC.test(yes)).toBe(true);
  for(const no of ['She said [ooc] once','oocyte','Look, ooc stuff later','*waves* [ooc]'])expect(OOC.test(no)).toBe(false);
});
test('the newest [ooc] question with a reply is used, past system lines and later story',()=> {
  const chat=[line('1','user','[ooc] describe Maren'),line('2','assistant','Old answer.'),line('3','user','We walk on.'),line('4','assistant','Story.'),
    line('5','user','[OOC]: describe Maren and Tobin'),line('6','system','note'),line('7','assistant','Maren is tall. Tobin is short.'),line('8','user','Back to it.'),line('9','assistant','More story.')];
  expect(lastOocExchange(chat)).toEqual({questionId:'5',question:'[OOC]: describe Maren and Tobin',answerId:'7',answer:'Maren is tall. Tobin is short.'});
  expect(answersOoc(chat,'7')).toBe(true);expect(answersOoc(chat,'9')).toBe(false);expect(answersOoc(chat,'missing')).toBe(false);
  expect(lastOocExchange([line('1','user','hi'),line('2','assistant','hello')])).toBeNull();
  expect(()=>lastOocExchange([...chat,line('10','user','[ooc] and her sister?')])).toThrow('no reply yet');
});
test('cleaned descriptions keep only characters and other names the reply actually uses',()=> {
  const answer='Ooh, fun! Maren Holt, the dockmaster, is tall and sun-browned. Tobin is a wiry kid. You will love them, trust me.';
  const raw=JSON.stringify({characters:[
    {name:'Maren',aliases:['the dockmaster','Holt','Captain','Maren'],description:'Maren is tall and sun-browned.'},
    {name:'Tobin',aliases:[],description:'Tobin is a wiry boy.'},
    {name:'Stella',aliases:[],description:'Invented.'},
    {name:'maren',aliases:[],description:'Duplicate.'},
    {name:'Tobin2',description:''},'junk']});
  expect(parseCast(`Sure! ${raw}`,answer)).toEqual([{name:'Maren',aliases:['the dockmaster','Holt'],description:'Maren is tall and sun-browned.'},{name:'Tobin',aliases:[],description:'Tobin is a wiry boy.'}]);
  expect(()=>parseCast('{"nope":1}',answer)).toThrow('character list');
  expect(entryContent('Maren',' Maren is tall. ')).toBe("[Maren's appearance]\nMaren is tall.");
});
