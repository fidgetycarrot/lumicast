import {test,expect} from 'bun:test';
import {reviewUncertainty} from '../src/uncertainty';
const source='Blue or grey eyes. Red hair. A narrow face. A thin coat. Dark gloves.';
const traits=[{id:'eyes',evidence:'Blue or grey eyes.',tag:'blue_eyes'},{id:'hair',evidence:'Red hair.',tag:'red_hair'},{id:'face',evidence:'A narrow face.',tag:null},{id:'coat',evidence:'A thin coat.',tag:'coat'},{id:'gloves',evidence:'Dark gloves.',tag:'gloves'}];
test('trait references and legacy single quotes resolve to literal grounded evidence',()=> {
  for(const anchor of [{traitIds:['eyes']},{traitIds:'eyes'},{evidence:'Blue or grey eyes.'},{evidence:['Blue or grey eyes.']},{evidence:['eyes']}]) {
    const result=reviewUncertainty([{kind:' Ambiguity ',...anchor,message:'The source gives two eye colors.'}],source,traits);
    expect(result.issues).toEqual([{kind:'ambiguity',evidence:['Blue or grey eyes.'],message:'The source gives two eye colors.'}]);expect(result.withholdAll).toBe(false);expect(result.notices).toEqual([]);
  }
});
test('one issue object and more than four quotes are supported within bounded limits',()=> {
  const result=reviewUncertainty({kind:'contradiction',evidence:traits.map(t=>t.evidence),message:'Conflicting described traits.'},source,traits);
  expect(result.issues.length).toBe(1);expect(result.issues[0].evidence.length).toBe(5);expect(result.withholdAll).toBe(false);
});
test('unknown references, fabricated quotes and malformed shapes fail closed on review approvals',()=> {
  for(const note of [null,'text',{kind:'ambiguity',traitIds:['fake'],message:'Color alternative.'},{kind:'ambiguity',evidence:['Blue eyes.'],message:'Color alternative.'},{kind:'ambiguity',evidence:[],message:'Color alternative.'},{kind:'ambiguity',evidence:[123],message:'Color alternative.'},{kind:'ambiguity',traitIds:['eyes'],evidence:['invented'],message:'Color alternative.'},{kind:'ambiguity',traitIds:['eyes'],message:'x'.repeat(601)}]) {
    const result=reviewUncertainty([note],source,traits);expect(result.issues).toEqual([]);expect(result.withholdAll||result.blockedTraits.size>0).toBe(true);expect(result.notices.length).toBe(1);
  }
});
test('empty or absent issue lists need no annotation and oversized lists fail closed',()=> {
  for(const value of [undefined,null,[]])expect(reviewUncertainty(value,source,traits)).toEqual({issues:[],blockedTraits:new Set(),withholdAll:false,notices:[]});
  const result=reviewUncertainty(Array(13).fill({kind:'ambiguity',traitIds:['eyes'],message:'Alternatives.'}),source,traits);expect(result.withholdAll).toBe(true);expect(result.issues).toEqual([]);
});
test('missing attributes are ignored but a visibly missing body part is not treated as a missing description',()=> {
  const absent=reviewUncertainty([{kind:'ambiguity',traitIds:['hair'],message:'Age not specified.'}],source,traits);
  expect(absent.issues).toEqual([]);expect(absent.withholdAll).toBe(false);expect(absent.blockedTraits.size).toBe(0);
  const body='His left arm is missing. Both arms are intact.';
  const result=reviewUncertainty([{kind:'contradiction',traitIds:['arm'],message:'The left arm is missing in one statement and intact in another.'}],body,[{id:'arm',evidence:body,tag:null}]);
  expect(result.issues.length).toBe(1);
});
