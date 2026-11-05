import {useEffect,useState} from 'react';
import {ListChecks,ChevronDown,ChevronUp,Search,CheckCircle2,Calendar,X} from 'lucide-react';
import {buildClosingProgress,summarizeClosingProgress,type ProgressColumn} from '../config/closingProgress';
import './ClosingProgressDetails.css';

export function MonthsProgressModal({
  groupColumn,
  onClose
}: {
  groupColumn: ProgressColumn;
  onClose: () => void;
}) {
  const subColumns = groupColumn.subColumns || [];
  const defaultSubKey = subColumns.find(sc => sc.total > 0)?.key || subColumns[0]?.key || 'ALL';
  const [selectedSubKey, setSelectedSubKey] = useState<string>(defaultSubKey);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const effectiveItem = selectedSubKey === 'ALL'
    ? groupColumn
    : (subColumns.find(sc => sc.key === selectedSubKey) || groupColumn);

  const breakdown = effectiveItem.valueBreakdown || [];

  const filteredRecords = (effectiveItem.records || []).filter(record => {
    const matchSearch = [record.name, record.code, record.value]
      .join(' ')
      .toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR'));
    if (!matchSearch) return false;

    if (categoryFilter !== 'ALL' && record.categoryKey !== categoryFilter) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'DONE') return record.complete;
    if (statusFilter === 'PENDING') return record.eligible && !record.complete;
    if (statusFilter === 'FILLED') return record.filled;
    if (statusFilter === 'EXCLUDED') return !record.eligible;
    return true;
  });

  return (
    <div className="closing-modal-backdrop notranslate" onClick={onClose}>
      <section
        className="closing-modal-content months-detail-modal notranslate"
        style={{ maxWidth: 1100, width: '94vw', maxHeight: '90vh' }}
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER DO MODAL */}
        <div className="closing-modal-header months-modal-header">
          <div className="months-modal-title-wrap">
            <div className="months-modal-icon">
              <Calendar size={22} />
            </div>
            <div>
              <h3 className="months-modal-title">Detalhamento dos 12 Meses · Exercício Contábil</h3>
              <p className="months-modal-subtitle">
                Consolidado do ano: <strong>{groupColumn.done}</strong> de <strong>{groupColumn.total}</strong> obrigações concluídas ({groupColumn.percent}%)
              </p>
            </div>
          </div>
          <div className="months-modal-header-actions">
            <span className={`months-overall-badge ${groupColumn.percent >= 80 ? 'good' : groupColumn.percent >= 50 ? 'medium' : 'low'}`}>
              {groupColumn.percent}% Geral
            </span>
            <button
              type="button"
              className="closing-modal-close-btn"
              aria-label="Fechar detalhamento dos meses"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="closing-modal-body months-modal-body">
          {/* SELEÇÃO DOS 12 MESES EM GRADE VISÍVEL */}
          <div className="months-navigation-panel">
            <div className="months-nav-header">
              <span className="months-nav-title">Clique no mês desejado para ver os detalhes:</span>
              <button
                type="button"
                className={`month-tab-btn all-months-btn ${selectedSubKey === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedSubKey('ALL');
                  setCategoryFilter('ALL');
                }}
              >
                <Calendar size={13} />
                <span className="month-tab-name">Todos os Meses (Consolidado)</span>
                <span className="month-tab-badge">{groupColumn.percent}%</span>
              </button>
            </div>

            <div className="months-grid-selector">
              {subColumns.map(sc => {
                const isSelected = selectedSubKey === sc.key;
                const isFuture = sc.total === 0;
                return (
                  <button
                    key={sc.key}
                    type="button"
                    className={`month-tab-btn ${isSelected ? 'active' : ''} ${isFuture ? 'disabled' : ''}`}
                    disabled={isFuture}
                    title={isFuture ? 'Competência futura' : `${sc.name}: ${sc.done}/${sc.total} (${sc.percent}%)`}
                    onClick={() => {
                      setSelectedSubKey(sc.key);
                      setCategoryFilter('ALL');
                    }}
                  >
                    <span className="month-tab-name">{sc.name}</span>
                    <span className={`month-tab-badge ${sc.percent >= 80 ? 'good' : sc.percent >= 50 ? 'medium' : sc.percent > 0 ? 'low' : ''}`}>
                      {isFuture ? '—' : `${sc.percent}%`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PAINEL DE STATUS / KPIS INTERATIVOS */}
          <div className="months-kpi-summary">
            <div className="months-kpi-title-row">
              <h4>
                <strong>{selectedSubKey === 'ALL' ? 'Todos os Meses (Consolidado)' : effectiveItem.name}</strong>
                <span> · {effectiveItem.done} de {effectiveItem.total} concluídos ({effectiveItem.percent}%)</span>
              </h4>
              <span className="months-kpi-hint">Clique em um status abaixo para filtrar a lista</span>
            </div>

            <div className="months-kpi-cards-grid">
              <button
                type="button"
                className={`month-kpi-card all ${categoryFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('ALL')}
              >
                <div className="kpi-card-header">
                  <span className="kpi-dot all" />
                  <span className="kpi-label">TOTAL APLICÁVEL</span>
                </div>
                <div className="kpi-card-val">{effectiveItem.total}</div>
                <div className="kpi-card-sub">Todas empresas</div>
              </button>

              {breakdown.map(item => {
                const isActive = categoryFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`month-kpi-card ${item.badgeClass} ${isActive ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(prev => prev === item.key ? 'ALL' : item.key)}
                  >
                    <div className="kpi-card-header">
                      <span className={`kpi-dot ${item.badgeClass}`} />
                      <span className="kpi-label">{item.label}</span>
                    </div>
                    <div className="kpi-card-val">
                      {item.count}
                      <small className="kpi-pct">{item.percent}%</small>
                    </div>
                    <div className="kpi-card-sub">
                      {item.count} de {effectiveItem.total} empresas
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* BARRA DE PESQUISA E FILTROS */}
          <div className="months-modal-filter-bar">
            <div className="months-modal-search-box">
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por código, empresa ou valor..."
                aria-label="Buscar empresas no mês"
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearch('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="months-modal-filter-actions">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label="Filtrar por situação geral"
              >
                <option value="ALL">Situação: Todas</option>
                <option value="DONE">Apenas Concluídos</option>
                <option value="PENDING">Apenas Pendentes</option>
                <option value="FILLED">Com Preenchimento</option>
                <option value="EXCLUDED">Não Aplicáveis</option>
              </select>

              <div className="months-modal-counter">
                Exibindo <strong>{filteredRecords.length}</strong> de {effectiveItem.records.length}
              </div>
            </div>
          </div>

          {/* TABELA DE EMPRESAS NO MÊS */}
          <div className="months-modal-table-wrap">
            <table className="months-modal-table">
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>Código</th>
                  <th>Empresa</th>
                  {selectedSubKey === 'ALL' && <th style={{ width: '110px' }}>Mês</th>}
                  <th>Status / Preenchimento</th>
                  <th style={{ width: '130px' }}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={selectedSubKey === 'ALL' ? 5 : 4} className="months-modal-empty">
                      Nenhuma empresa encontrada com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record, idx) => (
                    <tr key={`${record.id}-${idx}`}>
                      <td className="col-code">
                        <span className="company-code-badge">{record.code || '—'}</span>
                      </td>
                      <td className="col-company">
                        <span className="company-name-text">{record.name}</span>
                      </td>
                      {selectedSubKey === 'ALL' && (
                        <td>
                          <span className="month-name-tag">{record.monthName || '—'}</span>
                        </td>
                      )}
                      <td className="col-val">
                        <span className={`month-status-pill ${record.categoryBadge}`}>
                          {record.value || record.categoryLabel || 'Pendente'}
                        </span>
                      </td>
                      <td className="col-status">
                        <span className={`closing-progress-status ${!record.eligible ? 'excluded' : record.complete ? 'done' : 'pending'}`}>
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ProgressDetailsPanel({title,items,overall,completed,open,onToggle,loading=false,counts}:{title:string;items:ProgressColumn[];overall:number;completed?:number;open:boolean;onToggle:()=>void;loading?:boolean;counts?:{done:number;total:number;rowCount:number}}){
  const [selected,setSelected]=useState('');
  const [monthsModalOpen, setMonthsModalOpen] = useState(false);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('ALL');
  const [mode,setMode]=useState<'FIELDS'|'COMPANIES'>('FIELDS');

  const groupItem = items.find(column => column.isGroup);
  const item = items.find(column => column.key === selected && !column.isGroup);

  useEffect(()=>{
    if(!open){
      setSelected('');
      setSearch('');
      setFilter('ALL');
    }
  },[open]);

  const records=item?.records.filter(record=>{
    const matchSearch=[record.name,record.code,record.value].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'));
    if(!matchSearch)return false;
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
                if (column.isGroup) {
                  setMonthsModalOpen(true);
                  return;
                }
                if (isSelected) {
                  setSelected('');
                } else {
                  setSelected(column.key);
                }
                setSearch('');
                setFilter('ALL');
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
                  <Calendar size={13} />
                  <span>Ver detalhamento dos 12 meses</span>
                </div>
              )}
              {column.isGroup && column.valueBreakdown && column.valueBreakdown.length > 0 && (
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

      {/* DETALHAMENTO EXPANDIDO APENAS PARA COLUNAS NORMAIS */}
      {item && !item.isGroup && (
        <div className="closing-progress-expanded">
          <h4>
            <CheckCircle2 size={18}/>
            {item.name} · detalhes do preenchimento
          </h4>

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
                    <td>{record.value}</td>
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

      {/* MODAL DETALHADO DOS 12 MESES */}
      {monthsModalOpen && groupItem && (
        <MonthsProgressModal
          groupColumn={groupItem}
          onClose={() => setMonthsModalOpen(false)}
        />
      )}
    </>}
  </section>;
}
export function ClosingProgressDetails({rows,columns,sector,period,latest,open,onToggle,loading=false}:{rows:any[];columns:any[];sector:'FISCAL'|'DP'|'CONTABIL'|'CUSHMAN';period:Date;latest:Date;open:boolean;onToggle:()=>void;loading?:boolean}){
 const items=buildClosingProgress(rows,columns,sector,period,latest);const summary=summarizeClosingProgress(items,rows.length);
 return <ProgressDetailsPanel title={sector==='CONTABIL'?'Status detalhado do ano':'Status detalhado do mês'} items={items} overall={summary.overallPercent} completed={summary.completed} counts={{done:summary.progressDone,total:summary.progressTotal,rowCount:summary.total}} open={open} onToggle={onToggle} loading={loading}/>;
}
