import {useEffect,useState} from 'react';
import {ListChecks,ChevronDown,ChevronUp,Search,CheckCircle2,Layers} from 'lucide-react';
import {buildClosingProgress,summarizeClosingProgress,type ProgressColumn} from '../config/closingProgress';
import './ClosingProgressDetails.css';
export function ProgressDetailsPanel({title,items,overall,completed,open,onToggle,loading=false,counts}:{title:string;items:ProgressColumn[];overall:number;completed?:number;open:boolean;onToggle:()=>void;loading?:boolean;counts?:{done:number;total:number;rowCount:number}}){
  const [selected,setSelected]=useState('');
  const [selectedSubKey,setSelectedSubKey]=useState('');
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('ALL');
  const [categoryFilter,setCategoryFilter]=useState('ALL');
  const [mode,setMode]=useState<'FIELDS'|'COMPANIES'>('FIELDS');

  const item=items.find(column=>column.key===selected);
  const effectiveItem = (item?.isGroup && item?.subColumns)
    ? (item.subColumns.find(sc => sc.key === selectedSubKey) || item.subColumns.find(sc => sc.total > 0) || item.subColumns[0])
    : item;

  useEffect(()=>{
    if(!open){
      setSelected('');
      setSelectedSubKey('');
      setSearch('');
      setFilter('ALL');
      setCategoryFilter('ALL');
    }
  },[open]);

  const records=effectiveItem?.records.filter(record=>{
    const matchSearch=[record.name,record.code,record.value].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'));
    if(!matchSearch)return false;
    if(categoryFilter!=='ALL'&&record.categoryKey!==categoryFilter)return false;
    if(filter==='ALL')return true;
    if(filter==='DONE')return record.complete;
    if(filter==='PENDING')return record.eligible&&!record.complete;
    if(filter==='FILLED')return record.filled;
    if(filter==='EXCLUDED')return !record.eligible;
    return true;
  })||[];
  
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
    {open&&!loading&&<>
      <div className="closing-progress-grid">
        {items.map(column=>{
          const isSelected = column.key === selected;
          return (
            <button
              type="button"
              key={column.key}
              className={`closing-progress-card ${isSelected?'selected':''} ${column.isGroup?'is-group-card':''}`}
              aria-expanded={isSelected}
              onClick={()=>{
                if (isSelected) {
                  setSelected('');
                  setSelectedSubKey('');
                } else {
                  setSelected(column.key);
                  if (column.isGroup && column.subColumns) {
                    const firstActive = column.subColumns.find(sc => sc.total > 0) || column.subColumns[0];
                    setSelectedSubKey(firstActive?.key || '');
                  }
                }
                setSearch('');
                setFilter('ALL');
                setCategoryFilter('ALL');
              }}
            >
              <div>
                <strong>{column.name}</strong>
                <span>{column.total?column.percent+'%':'—'}</span>
              </div>
              <div className={`closing-progress-bar ${column.percent>=80?'good':column.percent>=50?'medium':'low'}`}>
                <span style={{width:column.percent+'%'}}/>
              </div>
              <p>
                {column.total?<>{column.tracked?'Feitos':'Preenchidos'}: <strong>{column.tracked?column.done:column.filled}</strong> / {column.total}</>:'Sem itens aplicáveis no período'}
              </p>
              {column.isGroup && (
                <div className="group-expand-badge">
                  <Layers size={13} />
                  <span>12 Meses agrupados (Clique para ver meses)</span>
                </div>
              )}
              {column.valueBreakdown && column.valueBreakdown.length > 0 && (
                <div className="closing-progress-card-breakdown">
                  {column.valueBreakdown
                    .filter(vb => vb.count > 0 && vb.key !== 'DONE')
                    .map(vb => (
                      <span key={vb.key} className={`mini-breakdown-pill ${vb.badgeClass}`}>
                        {vb.label}: <strong>{vb.count}</strong>
                      </span>
                    ))}
                </div>
              )}
              {!column.tracked&&<small>Informativo · não conta no progresso</small>}
            </button>
          );
        })}
      </div>
      {items.length>0&&!items.some(column=>column.tracked&&column.total>0)&&<p className="closing-progress-empty">Nenhuma obrigação configurada para progresso se aplica a este período. Os campos informativos mostram o preenchimento separadamente.</p>}
      {!items.length&&<p className="closing-progress-empty">Nenhuma coluna ativa para detalhar nesta competência.</p>}
      {item && effectiveItem && (
        <div className="closing-progress-expanded">
          <h4>
            <CheckCircle2 size={18}/>
            {item.isGroup ? `Meses · ${effectiveItem.name}` : item.name} · detalhes do preenchimento
          </h4>

          {/* NAVEGAÇÃO DOS MESES EXPANDIDOS */}
          {item.isGroup && item.subColumns && (
            <div className="progress-subtabs-bar">
              {item.subColumns.map(sc => {
                const isSubActive = effectiveItem.key === sc.key;
                return (
                  <button
                    key={sc.key}
                    type="button"
                    className={`progress-subtab-pill ${isSubActive ? 'active' : ''} ${sc.total === 0 ? 'disabled' : ''}`}
                    onClick={() => {
                      setSelectedSubKey(sc.key);
                      setCategoryFilter('ALL');
                    }}
                    disabled={sc.total === 0}
                    title={sc.total === 0 ? 'Competência futura' : `${sc.name}: ${sc.done}/${sc.total} concluídos`}
                  >
                    <span className="subtab-name">{sc.name}</span>
                    <span className="subtab-pct">{sc.total ? sc.percent + '%' : '—'}</span>
                  </button>
                );
              })}
            </div>
          )}
          
          {effectiveItem.valueBreakdown && effectiveItem.valueBreakdown.length > 0 && (
            <div className="closing-progress-breakdown-chips">
              <button
                type="button"
                className={`progress-chip all ${categoryFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('ALL')}
                title="Mostrar todas as empresas aplicáveis"
              >
                <span className="chip-label">TODOS</span>
                <strong>{effectiveItem.total}</strong>
              </button>
              {effectiveItem.valueBreakdown.map(vb => (
                <button
                  key={vb.key}
                  type="button"
                  className={`progress-chip ${vb.badgeClass} ${categoryFilter === vb.key ? 'active' : ''}`}
                  onClick={() => setCategoryFilter(prev => prev === vb.key ? 'ALL' : vb.key)}
                  title={`Filtrar apenas ${vb.label}`}
                >
                  <span className="chip-dot" />
                  <span className="chip-label">{vb.label}</span>
                  <strong>{vb.count} / {effectiveItem.total}</strong>
                  <span className="chip-pct">{vb.percent}%</span>
                </button>
              ))}
            </div>
          )}

          <div className="closing-progress-search">
            <Search size={16}/>
            <input
              aria-label="Pesquisar detalhes de progresso"
              value={search}
              onChange={event=>setSearch(event.target.value)}
              placeholder="Pesquisar empresa, código ou conteúdo..."
            />
            <select
              aria-label="Filtrar detalhes de progresso"
              value={filter}
              onChange={event=>setFilter(event.target.value)}
            >
              <option value="ALL">Situação: Todas</option>
              <option value="DONE">Concluídos</option>
              <option value="PENDING">Pendentes / em andamento</option>
              <option value="FILLED">Com preenchimento</option>
              <option value="EXCLUDED">Não aplicáveis</option>
            </select>
          </div>
          <div className="closing-progress-records">
            <table>
              <thead>
                <tr>
                  <th>Empresa / item</th>
                  <th>Preenchimento</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {records.map(record=>(
                  <tr key={record.id}>
                    <td>
                      <strong>{record.name}</strong>
                      {record.code&&<small>Código: {record.code}</small>}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: record.categoryBadge === 'done' ? '#4ade80' : record.categoryBadge === 'doc-rede' ? '#c4b5fd' : record.categoryBadge === 'no-movement' ? '#93c5fd' : record.categoryBadge === 'collection' ? '#fde047' : '#e2e8f0' }}>
                        {record.value}
                      </span>
                    </td>
                    <td>
                      <span className={`closing-progress-status ${!record.eligible?'excluded':record.complete?'done':'pending'}`}>
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!records.length&&<p className="closing-progress-empty">Nenhum item encontrado com esses filtros.</p>}
          </div>
        </div>
      )}
    </>}
  </section>;
}
export function ClosingProgressDetails({rows,columns,sector,period,latest,open,onToggle,loading=false}:{rows:any[];columns:any[];sector:'FISCAL'|'DP'|'CONTABIL'|'CUSHMAN';period:Date;latest:Date;open:boolean;onToggle:()=>void;loading?:boolean}){
 const items=buildClosingProgress(rows,columns,sector,period,latest);const summary=summarizeClosingProgress(items,rows.length);
 return <ProgressDetailsPanel title={sector==='CONTABIL'?'Status detalhado do ano':'Status detalhado do mês'} items={items} overall={summary.overallPercent} completed={summary.completed} counts={{done:summary.progressDone,total:summary.progressTotal,rowCount:summary.total}} open={open} onToggle={onToggle} loading={loading}/>;
}
