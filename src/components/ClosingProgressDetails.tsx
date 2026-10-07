import {useEffect,useState} from 'react';
import {ListChecks,ChevronDown,ChevronUp,Search,CheckCircle2} from 'lucide-react';
import {buildClosingProgress,summarizeClosingProgress,type ProgressColumn} from '../config/closingProgress';
import './ClosingProgressDetails.css';
export function ProgressDetailsPanel({title,items,overall,completed,open,onToggle,loading=false,counts}:{title:string;items:ProgressColumn[];overall:number;completed?:number;open:boolean;onToggle:()=>void;loading?:boolean;counts?:{done:number;total:number;rowCount:number}}){
  const [selected,setSelected]=useState('');const [search,setSearch]=useState('');const [filter,setFilter]=useState('FILLED');const [mode,setMode]=useState<'FIELDS'|'COMPANIES'>('FIELDS');
  const item=items.find(column=>column.key===selected);
  useEffect(()=>{if(!open){setSelected('');setSearch('');setFilter('FILLED');}},[open]);
  const records=item?.records.filter(record=>[record.name,record.code,record.value].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))&&(filter==='ALL'||filter==='DONE'&&record.complete||filter==='PENDING'&&record.eligible&&!record.complete||filter==='FILLED'&&record.filled||filter==='EXCLUDED'&&!record.eligible))||[];
  
  const totalCompanies = counts?.rowCount || 0;
  const percentFields = Number.isFinite(overall)?Math.min(100,Math.max(0,overall)):0;
  const percentCompanies = totalCompanies > 0 ? Math.round(((completed || 0) / totalCompanies) * 100) : 0;
  
  const displayPercent = mode === 'FIELDS' ? percentFields : percentCompanies;
  const displayLabel = mode === 'FIELDS' ? (counts ? `${counts.done} de ${counts.total} obrigações concluídas` : '') : (completed !== undefined ? `${completed} de ${totalCompanies} empresa(s) concluída(s)` : '');

  return <section className="closing-progress-panel">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? '1rem' : '0' }}>
      <button type="button" className="closing-progress-heading" style={{ flex: 1, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', padding: 0 }} aria-expanded={open} onClick={onToggle}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ListChecks size={21}/>{title}</h3>
          <p>{loading?'Carregando progresso...':<>Progresso: <strong>{displayPercent}%</strong>{displayLabel && ` · ${displayLabel}`} · {open?'Recolher detalhes':'Clique para detalhar'}</>}</p>
        </div>
        <div className="closing-progress-meter"><span style={{width:displayPercent+'%'}}/></div>
        {open?<ChevronUp size={19}/>:<ChevronDown size={19}/>}
      </button>
      <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', marginLeft: '1rem', whiteSpace: 'nowrap' }} onClick={(e) => { e.stopPropagation(); setMode(m => m === 'FIELDS' ? 'COMPANIES' : 'FIELDS'); }}>
        Alternar Tipo
      </button>
    </div>
    {open&&!loading&&<><div className="closing-progress-grid">{items.map(column=><button type="button" key={column.key} className={`closing-progress-card ${column.key===selected?'selected':''}`} aria-expanded={column.key===selected} onClick={()=>{setSelected(column.key===selected?'':column.key);setSearch('');setFilter('FILLED');}}><div><strong>{column.name}</strong><span>{column.total?column.percent+'%':'—'}</span></div><div className={`closing-progress-bar ${column.percent>=80?'good':column.percent>=50?'medium':'low'}`}><span style={{width:column.percent+'%'}}/></div><p>{column.total?<>{column.tracked?'Feitos':'Preenchidos'}: <strong>{column.tracked?column.done:column.filled}</strong> / {column.total}</>:'Sem itens aplicáveis no período'}</p>{!column.tracked&&<small>Informativo · não conta no progresso</small>}</button>)}</div>{items.length>0&&!items.some(column=>column.tracked&&column.total>0)&&<p className="closing-progress-empty">Nenhuma obrigação configurada para progresso se aplica a este período. Os campos informativos mostram o preenchimento separadamente.</p>}{!items.length&&<p className="closing-progress-empty">Nenhuma coluna ativa para detalhar nesta competência.</p>}
    {item&&<div className="closing-progress-expanded"><h4><CheckCircle2 size={18}/>{item.name} · detalhes do preenchimento</h4><div className="closing-progress-search"><Search size={16}/><input aria-label="Pesquisar detalhes de progresso" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Pesquisar empresa, código ou conteúdo..."/><select aria-label="Filtrar detalhes de progresso" value={filter} onChange={event=>setFilter(event.target.value)}><option value="ALL">Todos</option><option value="DONE">Concluídos</option><option value="PENDING">Pendentes / em andamento</option><option value="FILLED">Com preenchimento</option><option value="EXCLUDED">Não aplicáveis</option></select></div><div className="closing-progress-records"><table><thead><tr><th>Empresa / item</th><th>Preenchimento</th><th>Situação</th></tr></thead><tbody>{records.map(record=><tr key={record.id}><td><strong>{record.name}</strong>{record.code&&<small>Código: {record.code}</small>}</td><td>{record.value}</td><td><span className={`closing-progress-status ${!record.eligible?'excluded':record.complete?'done':'pending'}`}>{record.status}</span></td></tr>)}</tbody></table>{!records.length&&<p className="closing-progress-empty">Nenhum item encontrado com esses filtros.</p>}</div></div>}</>}
  </section>;
}
export function ClosingProgressDetails({rows,columns,sector,period,latest,open,onToggle,loading=false}:{rows:any[];columns:any[];sector:'FISCAL'|'DP'|'CONTABIL'|'CUSHMAN';period:Date;latest:Date;open:boolean;onToggle:()=>void;loading?:boolean}){
 const items=buildClosingProgress(rows,columns,sector,period,latest);const summary=summarizeClosingProgress(items,rows.length);
 return <ProgressDetailsPanel title={sector==='CONTABIL'?'Status detalhado do ano':'Status detalhado do mês'} items={items} overall={summary.overallPercent} completed={summary.completed} counts={{done:summary.progressDone,total:summary.progressTotal,rowCount:summary.total}} open={open} onToggle={onToggle} loading={loading}/>;
}
