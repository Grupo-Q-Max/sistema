import { useState } from 'react';
import { ALL_MONTHS, MONTH_NAMES, visibilitySummary, type ColumnVisibility } from '../config/columnVisibility';
import './ColumnVisibilityEditor.css';
export function ColumnVisibilityEditor({ value, onChange }: { value: ColumnVisibility; onChange: (value: ColumnVisibility) => void }) {
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const [yearError, setYearError] = useState('');
  function addYear() {
    if (!/^\d{4}$/.test(yearInput) || Number(yearInput) < 1900) { setYearError('Informe um ano de 1900 a 9999.'); return; }
    const year = Number(yearInput);
    onChange({ ...value, years: Array.from(new Set([...value.years, year])).sort((a,b)=>a-b) });
    setYearError('');
  }
  return <section className="column-visibility-editor">
    <h3>Em quais competências esta coluna aparece?</h3>
    <p>A seleção usa o mês e o ano da competência do fechamento.</p>
    <div className="visibility-mode-grid" role="radiogroup" aria-label="Frequência da coluna">
      {([
        ['ALL','Todos os meses','Aparece em todas as competências.'],
        ['ANNUAL','Repetir todo ano','Aparece nos meses selecionados, todos os anos.'],
        ['SPECIFIC','Anos específicos','Aparece nos meses e anos que você selecionar.'],
      ] as const).map(([mode,label,detail]) => <label key={mode} className={`visibility-mode ${value.mode === mode ? 'selected' : ''}`}>
        <input type="radio" name="columnVisibilityMode" value={mode} checked={value.mode === mode} onChange={() => onChange({ ...value, mode, years: mode === 'SPECIFIC' && !value.years.length ? [new Date().getFullYear()] : value.years })} />
        <span><strong>{label}</strong><small>{detail}</small></span>
      </label>)}
    </div>
    {value.mode !== 'ALL' && <>
      <h4>Meses da competência</h4>
      <div className="visibility-month-grid">{MONTH_NAMES.map((month,index) => <label key={month} className={value.months.includes(index+1) ? 'selected' : ''}>
        <input type="checkbox" checked={value.months.includes(index+1)} onChange={e => onChange({ ...value, months: e.target.checked ? [...value.months,index+1].sort((a,b)=>a-b) : value.months.filter(m=>m!==index+1) })} />{month}
      </label>)}</div>
      <div className="visibility-tools"><button type="button" onClick={() => onChange({ ...value, months: [...ALL_MONTHS] })}>Selecionar todos</button><button type="button" onClick={() => onChange({ ...value, months: [] })}>Desmarcar todos</button></div>
    </>}
    {value.mode === 'SPECIFIC' && <>
      <h4>Anos da competência</h4>
      <div className="visibility-tools"><input aria-label="Ano para adicionar" type="number" min="1900" max="9999" value={yearInput} onChange={e=>setYearInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addYear();}}} /><button type="button" onClick={addYear}>Adicionar ano</button></div>
      {yearError && <p role="alert">{yearError}</p>}
      <div className="visibility-tools">{value.years.map(year=><button type="button" key={year} aria-label={`Remover ano ${year}`} onClick={()=>onChange({ ...value, years: value.years.filter(y=>y!==year) })}>{year} ×</button>)}</div>
    </>}
    <div className="visibility-summary"><strong>Exibição:</strong> {visibilitySummary({ visibilityConfig: value })}</div>
    <p>Exemplo: dezembro com repetição anual aparece todo dezembro. Dezembro em 2026 aparece apenas nessa competência. Os preenchimentos de meses anteriores são preservados.</p>
  </section>;
}
