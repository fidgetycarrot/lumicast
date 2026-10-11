import {test,expect} from 'bun:test';
import {reviewUncertainty} from '../src/uncertainty';
const source='Blue or grey eyes. Red hair. A narrow face. A thin coat. Dark gloves.';
const traits=[{id:'eyes',evidence:'Blue or grey eyes.'},{id:'hair',evidence:'Red hair.'},{id:'face',evidence:'A narrow face.'},{id:'coat',evidence:'A thin coat.'},{id:'gloves',evidence:'Dark gloves.'}];
test('trait references and legacy single quotes resolve to literal grounded evidence',()=> {
  for(const anchor of [{traitIds:['eyes']},{traitIds:'eyes'},{evidence:'Blue or grey eyes.'},{evidence:['Blue or grey eyes.']},{evidence:['eyes']}]) {
    const result=reviewUncertainty([{kind:' Ambiguity ',...anchor,message:'The source gives two eye colors.'}],source,traits);
    expect(result.issues).toEqual([{kind:'ambiguity',evidence:['Blue or grey eyes.'],message:'The source gives two eye colors.'}]);expect(result.blockedTraits.size).toBe(0);expect(result.notices).toEqual([]);
  }
});
test('one issue object and more than four quotes are supported within bounded limits',()=> {
  const result=reviewUncertainty({kind:'contradiction',evidence:traits.map(t=>t.evidence),message:'Conflicting described traits.'},source,traits);
  expect(result.issues.length).toBe(1);expect(result.issues[0].evidence.length).toBe(5);
});
test('malformed notes never become issues; one that can be traced to a trait withholds only that trait',()=> {
  for(const note of [null,'text',{kind:'ambiguity',traitIds:['fake'],message:'Color alternative.'},{kind:'ambiguity',evidence:['Blue eyes.'],message:'Color alternative.'},{kind:'ambiguity',evidence:[],message:'Color alternative.'},{kind:'ambiguity',evidence:[123],message:'Color alternative.'},{kind:'ambiguity',traitIds:['eyes'],evidence:['invented'],message:'Color alternative.'},{kind:'ambiguity',traitIds:['eyes'],message:'x'.repeat(601)}]) {
    const result=reviewUncertainty([note],source,traits);expect(result.issues).toEqual([]);expect([...result.blockedTraits].every(id=>id==='eyes')).toBe(true);expect(result.notices.length).toBe(1);
  }
  expect([...reviewUncertainty([{kind:'ambiguity',traitIds:['eyes'],message:'x'.repeat(601)}],source,traits).blockedTraits]).toEqual(['eyes']);
  expect(reviewUncertainty([{kind:'ambiguity',evidence:[],message:'Color alternative.'}],source,traits).blockedTraits.size).toBe(0);
});
test('empty or absent issue lists need no annotation and an oversized list is ignored whole',()=> {
  for(const value of [undefined,null,[]])expect(reviewUncertainty(value,source,traits)).toEqual({issues:[],blockedTraits:new Set(),notices:[]});
  const result=reviewUncertainty(Array(13).fill({kind:'ambiguity',traitIds:['eyes'],message:'Alternatives.'}),source,traits);expect(result.blockedTraits.size).toBe(0);expect(result.issues).toEqual([]);expect(result.notices.length).toBe(1);
});
test('missing attributes are ignored but a visibly missing body part is not treated as a missing description',()=> {
  const absent=reviewUncertainty([{kind:'ambiguity',traitIds:['hair'],message:'Age not specified.'}],source,traits);
  expect(absent.issues).toEqual([]);expect(absent.blockedTraits.size).toBe(0);
  const body='His left arm is missing. Both arms are intact.';
  const result=reviewUncertainty([{kind:'contradiction',traitIds:['arm'],message:'The left arm is missing in one statement and intact in another.'}],body,[{id:'arm',evidence:body}]);
  expect(result.issues.length).toBe(1);
});
