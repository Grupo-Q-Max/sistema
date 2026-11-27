import type { CurrentUser } from '../types/auth';
export function hasSectorAccess(user: CurrentUser | null | undefined, sector: 'FISCAL' | 'DP' | 'CONTABIL' | 'CUSHMAN' | 'BPO', edit=false): boolean {
  if(!user) return false;
  if(user.role==='ADMIN'||user.role==='SOCIO') return true;
  if(sector==='BPO' && user.role==='FINANCEIRO') return true;
  const permission=user.sectorPermissions?.find(p=>p.sector===sector);
  if (permission) {
    return edit ? permission.access==='EDIT' : permission.access!=='NONE';
  }
  if (Array.isArray(user.sectorPermissions) && user.sectorPermissions.length > 0) {
    return false;
  }
  return user.role===sector;
}
export function ClosingSectorTabs({ sector, currentUser, onNavigate }: { sector:'FISCAL'|'DP'|'CONTABIL'|'CUSHMAN'|'BPO';currentUser?:CurrentUser|null;onNavigate:(view:string)=>void }) {
  return <div className="closing-sector-tabs" aria-label="Setor do fechamento">
    {hasSectorAccess(currentUser,'FISCAL') && <button type="button" className={sector==='FISCAL'?'active':''} onClick={()=>onNavigate('closings')}>Fiscal</button>}
    {hasSectorAccess(currentUser,'DP') && <button type="button" className={sector==='DP'?'active':''} onClick={()=>onNavigate('closings-dp')}>Departamento Pessoal</button>}
    {hasSectorAccess(currentUser,'CONTABIL') && <button type="button" className={sector==='CONTABIL'?'active':''} onClick={()=>onNavigate('closings-accounting')}>Contábil</button>}
    {hasSectorAccess(currentUser,'BPO') && <button type="button" className={sector==='BPO'?'active':''} onClick={()=>onNavigate('closings-bpo')}>BPO Financeiro</button>}
    {hasSectorAccess(currentUser,'CUSHMAN') && <button type="button" className={sector==='CUSHMAN'?'active':''} onClick={()=>onNavigate('closings-cushman')}>Cushman</button>}
  </div>;
}
