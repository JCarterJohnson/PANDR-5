import { describe, expect, it } from 'vitest';
import { assessmentGroup } from './assessment-order';
import type { Exercise } from './types';

const exercise=(contributions:Exercise['contributions']):Exercise=>({id:'custom',name:'My exercise',equipment:'Custom',source:'Owner',beyondFailureAllowed:false,contributions});
describe('assessment primary muscle labels',()=>{
  it('uses the highest credit instead of exercise spelling or secondary muscles',()=>{
    expect(assessmentGroup(exercise([{muscle:'triceps',coefficient:.25},{muscle:'chest',coefficient:.75}]))).toBe('Chest');
    expect(assessmentGroup(exercise([{muscle:'quads',coefficient:.2},{muscle:'lats',coefficient:.8}]))).toBe('Back');
  });
  it('combines lower body, shoulders, and elbow-flexor muscles into their respective groups',()=>{
    for(const muscle of ['quads','hamstrings','glute-max','glute-med-min','adductors','gastrocnemius','soleus'])expect(assessmentGroup(exercise([{muscle,coefficient:1}]))).toBe('Legs');
    for(const muscle of ['biceps','brachialis','brachioradialis'])expect(assessmentGroup(exercise([{muscle,coefficient:1}]))).toBe('Biceps');
    for(const muscle of ['anterior-delts','lateral-delts','rear-delts'])expect(assessmentGroup(exercise([{muscle,coefficient:1}]))).toBe('Shoulders');
  });
  it('has a deterministic tie policy and preserves owner-defined muscle groups',()=>{
    expect(assessmentGroup(exercise([{muscle:'lats',coefficient:1},{muscle:'biceps',coefficient:1}]))).toBe('Back');
    expect(assessmentGroup(exercise([{muscle:'custom-muscle',coefficient:.5}]))).toBe('custom-muscle');
    expect(assessmentGroup()).toBe('Other');
  });
});
