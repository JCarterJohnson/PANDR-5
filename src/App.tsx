import { useEffect, useState, Component, type ReactNode, type ErrorInfo } from 'react';
import { Activity, ArrowUpRight, BookOpen, CalendarDays, ChartNoAxesColumnIncreasing, CheckCircle2, Cloud, Download, Dumbbell, LoaderCircle, Menu, Settings2, X, WifiOff } from 'lucide-react';
import { useStore } from './useStore';
import { Train } from './Train';
import { Plan } from './Plan';
import { History } from './History';
import { Library } from './Library';
import { Settings } from './Settings';
import { Method } from './Method';
import { Button, Notice } from './components';
import { registerSW } from 'virtual:pwa-register';
import { requestPersistence } from './services/storage';
const navigation=[['train','Train',Dumbbell],['plan','Your plan',CalendarDays],['history','History',ChartNoAxesColumnIncreasing],['library','Exercise library',BookOpen],['method','The method',Activity],['settings','Settings',Settings2]] as const;
type Page=typeof navigation[number][0];
interface InstallPrompt extends Event { prompt:()=>Promise<void>; userChoice:Promise<{outcome:string}> }
function Application(){
 const store=useStore();const {data,update,error,setError,status,busy,ready,profile,email,client,sync}=store;
 const [page,setPage]=useState<Page>([location.search, location.hash.slice(1)].some(value => /(?:[?#&]|^)(?:code|error|error_description)=/.test(value)) ? 'settings' : 'train');const [mobileOpen,setMobileOpen]=useState(false);const [online,setOnline]=useState(navigator.onLine);const [install,setInstall]=useState<InstallPrompt>();const [updater,setUpdater]=useState<(()=>Promise<void>)>();
 useEffect(()=>{const network=()=>setOnline(navigator.onLine);const prompt=(event:Event)=>{event.preventDefault();setInstall(event as InstallPrompt)};const handleError=(event:PromiseRejectionEvent)=>{setError(event.reason?.message||String(event.reason));event.preventDefault()};window.addEventListener('online',network);window.addEventListener('offline',network);window.addEventListener('beforeinstallprompt',prompt);window.addEventListener('unhandledrejection',handleError);void requestPersistence();return ()=>{window.removeEventListener('online',network);window.removeEventListener('offline',network);window.removeEventListener('beforeinstallprompt',prompt);window.removeEventListener('unhandledrejection',handleError)}},[setError]);
 useEffect(()=>{if(!['http:','https:'].includes(location.protocol))return;const updateSW=registerSW({onNeedRefresh(){setUpdater(()=>()=>updateSW(true))},onRegisterError(e){console.warn('Offline installation unavailable',e)}})},[]);
 function go(next:Page){setPage(next);setMobileOpen(false);window.scrollTo({top:0,behavior:'instant'})}
 if(!ready||!data)return <main className="loading-screen"><div className="brand">PANDR<span>—5</span></div>{error?<><Notice tone="error">{error}</Notice><Button onClick={()=>void store.openProfile('local')}>Open local profile</Button></>:<><LoaderCircle className="spinning"/><p>Opening your training log…</p></>}</main>;
 return <div className="app-shell"><div className="mobile-top"><button className="icon-button" aria-label="Open navigation" onClick={()=>setMobileOpen(true)}><Menu/></button><strong>PANDR—5</strong><span className="save-dot"/></div>{mobileOpen&&<button className="nav-shade" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}
 <aside className={`sidebar ${mobileOpen?'open':''}`}><div className="brand">PANDR<span>—5</span><small>Training, considered.</small></div><button className="mobile-close icon-button" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}><X/></button><nav>{navigation.map(([id,label,Icon])=><button key={id} className={page===id?'selected':''} aria-current={page===id?'page':undefined} onClick={()=>go(id)}><Icon size={21} strokeWidth={1.7}/><span>{label}</span>{id==='train'&&data.activeSession&&<span className="session-dot"/>}</button>)}</nav><div className="sidebar-bottom">{install&&<Button onClick={async()=>{await install.prompt();const choice=await install.userChoice;if(choice.outcome==='accepted')setInstall(undefined)}}><Download size={17}/> Install app</Button>}<div className="save-status">{!online?<WifiOff size={19}/>:profile==='local'?<CheckCircle2 size={19}/>:<Cloud size={19}/>}<span>{!online?'Offline · local saving':status}<small>{data.settings.name||'Your training space'}</small></span></div><button className="text-link" onClick={()=>go('settings')}>{profile==='local'?'Local profile':email} <ArrowUpRight size={13}/></button></div></aside>
 <main className="main-content" aria-busy={busy}>{error&&<div className="global-error"><Notice tone="error">{error} <button className="text-button" onClick={()=>setError('')}>Dismiss</button></Notice></div>}{updater&&!data.activeSession&&<Notice>A new version is ready. Your saved data will be kept. <Button small onClick={()=>void updater()}>Update app</Button></Notice>}<fieldset className="app-fieldset" disabled={busy}>
 {page==='train'&&<Train key={profile} data={data} update={update} goPlan={()=>go('plan')}/>}
 {page==='plan'&&<Plan key={`${profile}-${data.settings.strict}`} data={data} update={update}/>}
 {page==='history'&&<History data={data}/>}
 {page==='library'&&<Library data={data} update={update}/>}
 {page==='method'&&<Method/>}
 {page==='settings'&&<Settings key={profile} data={data} update={update} client={client} profile={profile} email={email} sync={sync} goPlan={()=>go('plan')}/>}
 </fieldset></main>{busy&&<div className="busy-indicator" role="status"><LoaderCircle size={17} className="spinning"/> Syncing safely…</div>}</div>
}
class AppBoundary extends Component<{children:ReactNode},{error:string}> {state={error:''};static getDerivedStateFromError(error:Error){return {error:error.message}}componentDidCatch(error:Error,info:ErrorInfo){console.error(error,info)}render(){return this.state.error?<main className="loading-screen"><h1>PANDR-5 couldn’t open.</h1><Notice tone="error">{this.state.error}</Notice><p>Your saved data has not been deleted.</p><Button onClick={()=>location.reload()}>Try again</Button></main>:this.props.children}}
export default function App(){return <AppBoundary><Application/></AppBoundary>}
