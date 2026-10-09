import type { Exercise } from './types';
import { MUSCLES } from '../data/seed';

const groups: Record<string,string> = {
  chest:'Chest', biceps:'Biceps', brachialis:'Biceps', brachioradialis:'Biceps',
  triceps:'Triceps', lats:'Back', 'mid-low-traps-rhomboids':'Back', 'upper-traps':'Back', 'erector-spinae':'Back',
  'anterior-delts':'Shoulders', 'lateral-delts':'Shoulders', 'rear-delts':'Shoulders',
  quads:'Legs', hamstrings:'Legs', 'glute-max':'Legs', 'glute-med-min':'Legs', adductors:'Legs', gastrocnemius:'Legs', soleus:'Legs',
  abdominals:'Core', obliques:'Core', 'wrist-flexors':'Forearms', 'wrist-extensors':'Forearms', neck:'Neck',
};

/** Use owner-supplied muscle credits, not exercise-name guesses. Equal highest
 * credits use their declared order; secondary credits never duplicate a test. */
export function assessmentGroup(exercise?: Exercise): string {
  const primary=exercise?.contributions.reduce<Exercise['contributions'][number]|undefined>((best,c)=>!best||c.coefficient>best.coefficient?c:best,undefined);
  return primary ? groups[primary.muscle] ?? MUSCLES.find(m=>m.id===primary.muscle)?.name ?? primary.muscle : 'Other';
}
