import { version } from '../package.json';
import { appUpdates } from './data/updates';
import { Modal } from './components';

export function UpdateLog({onClose}:{onClose:()=>void}) {
 return <Modal title="Update log" onClose={onClose}>
  <p>Your installed version is <strong>{version}</strong>. Explore what changed in each release.</p>
  <div className="update-log">
   {appUpdates.map((entry,index)=><details key={entry.version} open={index===0} className="update-entry">
    <summary><span className="update-number">{entry.version}</span><span className="update-title">{entry.title}{entry.version===version&&<small>Installed version</small>}</span></summary>
    <div className="update-changes">{(['added','improved','fixed'] as const).map(kind=>entry[kind]?.length?<section key={kind} aria-label={`${kind} in ${entry.version}`}>
     <h3>{kind==='added'?'Added':kind==='improved'?'Improved':'Fixed'}</h3><ul>{entry[kind].map(change=><li key={change}>{change}</li>)}</ul>
    </section>:null)}</div>
   </details>)}
  </div>
 </Modal>;
}
