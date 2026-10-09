import { useEffect, useId, useRef, useState } from 'react';
import { Menu, Trash2 } from 'lucide-react';
import type { Exercise, PlanExercise } from './domain/types';

type Drag={pointer:number;slot:string;ids:string[];centers:number[];origin:number;start:number;y:number;x:number;moved:boolean;target:number};
export function PlanExercises({slots,exercises,disabled,onEdit,onRemove,onReorder}:{slots:PlanExercise[];exercises:Exercise[];disabled:boolean;onEdit:(id:string)=>void;onRemove:(id:string)=>void;onReorder:(ids:string[])=>void}) {
  const root=useRef<HTMLDivElement>(null),drag=useRef<Drag>(undefined),frame=useRef<number>(undefined);
  const [preview,setPreview]=useState<string[]>(),[dragging,setDragging]=useState<string>(),[announcement,setAnnouncement]=useState('');
  const helpId=useId();
  const names=new Map(exercises.map(e=>[e.id,e.name]));
  const ordered=preview?preview.map(id=>slots.find(s=>s.id===id)!):slots;
  const arrange=(ids:string[],from:number,to:number)=>{const result=[...ids];result.splice(to,0,result.splice(from,1)[0]!);return result};
  function move(){
    const current=drag.current;if(!current||!current.moved)return;
    const y=current.origin+current.y+window.scrollY-current.start;
    const target=current.centers.reduce((best,center,index)=>Math.abs(center-y)<Math.abs(current.centers[best]!-y)?index:best,0);
    if(current.target!==target){current.target=target;setPreview(arrange(current.ids,current.ids.indexOf(current.slot),target));setAnnouncement(`Position ${target+1} of ${slots.length}`)}
  }
  function scroll(){
    const current=drag.current;if(!current||!current.moved)return;
    const amount=current.y<90?-14:current.y>window.innerHeight-65?14:0;
    if(amount){window.scrollBy(0,amount);move()}
    frame.current=requestAnimationFrame(scroll);
  }
  function stop(commit:boolean){
    const current=drag.current;drag.current=undefined;
    if(frame.current!==undefined)cancelAnimationFrame(frame.current);
    frame.current=undefined;setPreview(undefined);setDragging(undefined);
    if(current&&root.current?.hasPointerCapture(current.pointer))root.current.releasePointerCapture(current.pointer);
    if(commit&&current?.moved){onReorder(arrange(current.ids,current.ids.indexOf(current.slot),current.target));setAnnouncement(`Moved to position ${current.target+1} of ${slots.length}`)}
  }
  useEffect(()=>()=>{if(frame.current!==undefined)cancelAnimationFrame(frame.current)},[]);
  return <div className="plan-exercises" ref={root} onPointerMove={e=>{
    const current=drag.current;if(!current||current.pointer!==e.pointerId)return;
    current.y=e.clientY;current.x=e.clientX;
    if(!current.moved&&Math.abs(e.clientY+window.scrollY-current.start)>5){current.moved=true;setDragging(current.slot);frame.current=requestAnimationFrame(scroll)}
    move();
  }} onPointerUp={e=>{if(drag.current?.pointer===e.pointerId)stop(true)}} onPointerCancel={()=>stop(false)} onLostPointerCapture={()=>{if(drag.current)stop(false)}} onKeyDown={e=>{if(e.key==='Escape'&&drag.current){e.preventDefault();stop(false)}}}>
    <p className="muted reorder-help" id={helpId}>Hold the three-line handle to drag an exercise. With a keyboard, focus the handle and use Up or Down.</p>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {ordered.map((slot,index)=><div className={`plan-row ${dragging===slot.id?'dragging':''}`} key={slot.id} data-plan-slot={slot.id}>
      <span className="row-index">{String(index+1).padStart(2,'0')}</span>
      <button className="text-button exercise-name" onClick={()=>onEdit(slot.id)}>{names.get(slot.exerciseId)}</button>
      <span>{slot.sets} sets · {slot.repMin}–{slot.repMax} reps</span>
      <div className="row-actions"><button type="button" className="icon-button reorder-handle" disabled={disabled} aria-label={`Reorder ${names.get(slot.exerciseId)}`} aria-describedby={helpId} aria-pressed={dragging===slot.id} onPointerDown={e=>{
        if(disabled||e.button!==0)return;
        e.preventDefault();e.currentTarget.focus({preventScroll:true});
        const rows=[...root.current!.querySelectorAll<HTMLElement>('[data-plan-slot]')];
        const centers=rows.map(row=>{const rect=row.getBoundingClientRect();return rect.top+rect.height/2+window.scrollY});
        drag.current={pointer:e.pointerId,slot:slot.id,ids:slots.map(s=>s.id),centers,origin:centers[index]!,start:e.clientY+window.scrollY,y:e.clientY,x:e.clientX,moved:false,target:index};
        root.current!.setPointerCapture(e.pointerId);
      }} onKeyDown={e=>{
        if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
        e.preventDefault();const target=Math.min(slots.length-1,Math.max(0,index+(e.key==='ArrowDown'?1:-1)));
        if(target!==index){onReorder(arrange(slots.map(s=>s.id),index,target));setAnnouncement(`${names.get(slot.exerciseId)} moved to position ${target+1} of ${slots.length}`)}
      }}><Menu size={19}/></button><button className="icon-button" aria-label={`Remove exercise ${index+1}`} disabled={disabled} onClick={()=>onRemove(slot.id)}><Trash2 size={16}/></button></div>
    </div>)}
  </div>;
}
