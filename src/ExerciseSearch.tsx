import { useEffect, useId, useRef, useState } from 'react';
import type { Exercise } from './domain/types';
import { exerciseOrigin, matchesExercise } from './data/catalog';

export function ExerciseSearch({exercises,selected,onChoose,autoFocus=false}:{exercises:Exercise[];selected?:Exercise;onChoose:(exercise:Exercise)=>void;autoFocus?:boolean}) {
  const id=useId(),listId=`${id}-matches`;
  const [query,setQuery]=useState(selected?.name??'');
  const [open,setOpen]=useState(false),[active,setActive]=useState(-1);
  const list=useRef<HTMLDivElement>(null);
  const matches=exercises.filter(e=>matchesExercise(e,query));
  useEffect(()=>{list.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({block:'nearest'})},[active]);
  function choose(exercise:Exercise){setQuery(exercise.name);setOpen(false);setActive(-1);onChoose(exercise)}
  return <div className="exercise-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setQuery(selected?.name??query)}}}>
    <label className="field"><span>Find an exercise</span><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open&&active>=0&&matches[active]?`${id}-option-${active}`:undefined} autoComplete="off" autoFocus={autoFocus} placeholder="Type an exercise name or alias…" value={query} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(-1)}} onKeyDown={e=>{
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(e.key==='ArrowDown'?Math.min(matches.length-1,active+1):Math.max(0,active-1))}
      else if(e.key==='Enter'&&open&&matches[active>=0?active:0]){e.preventDefault();choose(matches[active>=0?active:0]!)}
      else if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);setQuery(selected?.name??'')}
    }}/></label>
    {open&&<div ref={list} id={listId} role="listbox" aria-label="Matching exercises" className="exercise-suggestions">
      {matches.map((exercise,index)=><button type="button" role="option" aria-label={`${exercise.name} · ${exercise.equipment}`} aria-selected={active===index} id={`${id}-option-${index}`} data-option-index={index} key={exercise.id} tabIndex={-1} onPointerDown={e=>{if(e.pointerType==='mouse')e.preventDefault()}} onMouseEnter={()=>setActive(index)} onClick={()=>choose(exercise)}><strong>{exercise.name}</strong><small>{exercise.equipment} · {exerciseOrigin(exercise)}</small></button>)}
      {!matches.length&&<p role="status">No matching exercises. Try a shorter name or an alias.</p>}
    </div>}
    {selected&&<p className="muted exercise-selected">Selected: {selected.name} · {selected.equipment}</p>}
  </div>;
}
