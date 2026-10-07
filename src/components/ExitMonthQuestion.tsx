export function ExitMonthQuestion({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  return <label className="input-field" style={{display:'flex',flexDirection:'column',gap:8}}>
    <span>Essa empresa tem obrigações no mês de saída?</span>
    <select aria-label="Essa empresa tem obrigações no mês de saída?" value={value} onChange={event=>onChange(event.target.value)} required disabled={disabled}>
      <option value="">Selecione...</option>
      <option value="SIM">Sim</option>
      <option value="NAO">Não</option>
    </select>
    <small>Sim: aparece na contagem e nos fechamentos até o mês de saída. Não: aparece até o mês anterior.</small>
  </label>;
}
