import { localDate } from './domain/training';
import { X, ArrowRight, Info, Check } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
export function Button({ children, primary=false, small=false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {primary?:boolean;small?:boolean}) { return <button {...props} className={`button ${primary?'primary':''} ${small?'small':''} ${props.className||''}`}>{children}</button> }
export function Modal({ title, children, onClose }: { title:string;children:ReactNode;onClose:()=>void }) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ const el=ref.current;el?.showModal();return ()=>el?.close() },[]);
 return <dialog ref={ref} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===ref.current)onClose()}}><div className="modal-inner"><div className="section-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={22}/></button></div>{children}</div></dialog>
}
export function Notice({children, tone='info'}:{children:ReactNode;tone?:'info'|'error'|'success'}) {return <div className={`notice ${tone}`} role={tone==='error'?'alert':undefined}>{tone==='success'?<Check size={18}/>:<Info size={18}/>}<div>{children}</div></div>}
export function Empty({title,children}:{title:string;children:ReactNode}) {return <div className="empty"><div className="empty-mark"><ArrowRight/></div><h2>{title}</h2><p>{children}</p></div>}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function download(name:string, content:string, type:string) {const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
export async function readFile(file:File) {if(file.size>50*1024*1024)throw new Error('Choose a file smaller than 50 MB.');return file.text()}
export function numberValue(value:string, fallback=0) {const n=Number(value);return Number.isFinite(n)?n:fallback}
export const dateString=localDate;

export function HelpButton({label,onClick}:{label:string;onClick:()=>void}) { return <button type="button" className="icon-button help-button" aria-label={label} title={label} onClick={onClick}><Info size={19}/></button> }
