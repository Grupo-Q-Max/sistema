import {cushmanPopup} from '../config/cushmanColumns';
import { defaultPopup, type PopupConfig, type PopupField } from '../config/fiscalPopups';
import './PopupConfigEditor.css';
export function PopupConfigEditor({ value, onChange, columnKey, name }: { value: PopupConfig; onChange: (c: PopupConfig) => void; columnKey: string; name: string }) {
  const updateField = (index: number, patch: Partial<PopupField>) => onChange({ ...value, fields: value.fields.map((f, i) => i === index ? { ...f, ...patch } : f) });
  const moveField = (index: number, offset: number) => {
    const fields = [...value.fields]; const target = index + offset;
    if (target < 0 || target >= fields.length) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    onChange({ ...value, fields });
  };
  return <section className="popup-config-editor">
    <h3>Conteúdo e comportamento do popup</h3>
    <p>As alterações aparecem no fechamento do setor após salvar. Campos removidos deixam de aparecer; os valores antigos são preservados.</p>
    <div className="popup-editor-grid">
      <label>Título do popup<input value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} required /></label>
      <label>Descrição<textarea value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} rows={2} /></label>
    </div>
    <h4>Campos internos ({value.fields.length})</h4>
    {value.fields.length === 0 && <p>Este popup contém apenas botões de status. Você pode adicionar campos.</p>}
    {value.fields.map((f, i) => <div className="popup-editor-field" key={i}>
      <div className="popup-editor-grid">
        <label>Nome do campo<input required value={f.label} onChange={e => updateField(i, { label: e.target.value })} /></label>
        <label>Chave de armazenamento<input required pattern="[a-zA-Z][a-zA-Z0-9_]{0,63}" value={f.key} onChange={e => updateField(i, { key: e.target.value })} /><small>Mantenha a chave para continuar exibindo os valores já salvos.</small></label>
        <label>Tipo<select value={f.type} onChange={e => updateField(i, { type: e.target.value as PopupField['type'] })}><option value="TEXT">Texto / valor livre</option><option value="NUMBER">Número</option><option value="DATE">Data</option><option value="TEXTAREA">Texto longo</option><option value="SELECT">Lista de opções</option></select></label>
        <label>Texto de exemplo<input value={f.placeholder} onChange={e => updateField(i, { placeholder: e.target.value })} /></label>
      </div>
      {f.type === 'SELECT' && <label>Opções (uma por linha)<textarea value={f.options.join('\n')} onChange={e => updateField(i, { options: e.target.value.split('\n') })} rows={3} /></label>}
      <div className="popup-editor-tools"><label><input type="checkbox" checked={f.required} onChange={e => updateField(i, { required: e.target.checked })} /> Obrigatório ao concluir</label><label><input type="checkbox" checked={f.fullWidth} onChange={e => updateField(i, { fullWidth: e.target.checked })} /> Linha inteira</label><button type="button" disabled={i === 0} onClick={() => moveField(i, -1)}>↑</button><button type="button" disabled={i === value.fields.length - 1} onClick={() => moveField(i, 1)}>↓</button><button type="button" onClick={() => onChange({ ...value, fields: value.fields.filter((_, n) => n !== i) })}>Remover campo</button></div>
    </div>)}
    <button type="button" className="btn-secondary" onClick={() => {
      let n = value.fields.length + 1; while (value.fields.some(f => f.key === `campo_${n}`)) n++;
      onChange({ ...value, fields: [...value.fields, { key: `campo_${n}`, label: 'Novo campo', type: 'TEXT', placeholder: '', required: false, fullWidth: false, options: [] }] });
    }}>+ Adicionar campo</button>
    <h4>Botões e ações</h4>
    {value.actions.map((a, i) => <div className="popup-editor-action" key={a.id}>
      <label><input type="checkbox" checked={a.enabled} onChange={e => onChange({ ...value, actions: value.actions.map((item, n) => n === i ? { ...item, enabled: e.target.checked } : item) })} /> {a.id}</label>
      <input aria-label={`Texto do botão ${a.id}`} required value={a.label} onChange={e => onChange({ ...value, actions: value.actions.map((item, n) => n === i ? { ...item, label: e.target.value } : item) })} />
    </div>)}
    <h4>Perguntas ao operador</h4>
    <label className="popup-editor-check"><input type="checkbox" checked={value.askApiOnSave} onChange={e => onChange({ ...value, askApiOnSave: e.target.checked })} /> Perguntar sobre envio via API ao salvar / OK - DATA</label>
    <label className="popup-editor-check"><input type="checkbox" checked={value.askApiOnNoMovement} onChange={e => onChange({ ...value, askApiOnNoMovement: e.target.checked })} /> Perguntar sobre API ao marcar sem movimento</label>
    <label className="popup-editor-check"><input type="checkbox" checked={value.askDate} onChange={e => onChange({ ...value, askDate: e.target.checked })} /> Pedir data de conclusão (desmarcado: usa a data de hoje)</label>
    <p>A pergunta de API registra a resposta do operador. A pendência abre o campo de motivo; Limpar volta para Pendente.</p>
    <details className="popup-editor-preview"><summary>Prévia do popup</summary><h3>{value.title}</h3><p>{value.description}</p>{value.fields.map((f, i) => <label key={i}>{f.label}{f.required ? ' *' : ''}<input disabled placeholder={f.placeholder || f.type} /></label>)}<div className="popup-editor-tools">{value.actions.filter(a => a.enabled).map(a => <button disabled type="button" key={a.id}>{a.label}</button>)}</div></details>
    <button type="button" className="btn-secondary" onClick={() => { if (window.confirm('Restaurar o modelo original neste formulário? A alteração só será aplicada ao salvar a coluna.')) onChange(columnKey.startsWith('cush_')?cushmanPopup(columnKey,name):defaultPopup(columnKey, name)); }}>Restaurar modelo original</button>
  </section>;
}
