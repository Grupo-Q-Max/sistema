import { useEffect, useState } from 'react';
import { Settings, Save, CalendarClock, Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import {
  DEFAULT_INSTALLMENT_RULES,
  canConfigureInstallments,
  installmentHeaders,
  validateRules,
  scheduleItem,
  formatMoney,
  type InstallmentRules,
} from '../config/installments';
import { latestOpenPeriod } from '../config/competenceCalendar';
import type { CurrentUser } from '../types/auth';
import { API } from '../api';
import './Closings.css';
import './Installments.css';

export function InstallmentSettingsPanel({ currentUser }: { currentUser?: CurrentUser | null }) {
  const [rules, setRules] = useState<InstallmentRules>({ ...DEFAULT_INSTALLMENT_RULES });
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Gestão de Tipos de Parcelamento
  const [newTypeName, setNewTypeName] = useState('');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeName, setEditingTypeName] = useState('');
  const [typeBusy, setTypeBusy] = useState(false);

  const allowed = canConfigureInstallments(currentUser);
  const headers = installmentHeaders(currentUser);

  const loadSettings = async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${API}/api/installments/settings`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao carregar configurações.');
      setRules(data.rules);
      setTypes(data.types || []);
      setLoaded(true);
    } catch (cause: any) {
      setError(cause?.message || 'Erro ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, [currentUser?.sessionToken, currentUser?.id, allowed]);

  async function save() {
    setError('');
    setSuccess('');
    const invalid = validateRules(rules);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API}/api/installments/settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(rules),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar.');
      setRules(data.rules);
      setSuccess(
        'Regras salvas com sucesso! O progresso do Dashboard e os vencimentos pendentes foram atualizados.'
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateType() {
    const clean = newTypeName.trim();
    if (!clean) return;
    setTypeBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API}/api/installments/types`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar tipo.');
      setNewTypeName('');
      await loadSettings();
      setSuccess(`Tipo "${data.type.name}" criado com sucesso!`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao criar tipo.');
    } finally {
      setTypeBusy(false);
    }
  }

  async function handleRenameType(id: string) {
    const clean = editingTypeName.trim();
    if (!clean) return;
    setTypeBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API}/api/installments/types/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ name: clean, updatePlans: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao renomear tipo.');
      setEditingTypeId(null);
      setEditingTypeName('');
      await loadSettings();
      setSuccess(`Tipo atualizado para "${data.type.name}" (planos existentes sincronizados).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao renomear tipo.');
    } finally {
      setTypeBusy(false);
    }
  }

  async function handleDeleteType(type: any) {
    const msg = type.usageCount
      ? `Remover "${type.name}" da lista de sugestões? (${type.usageCount} parcelamento(s) existente(s) manterão o nome no histórico).`
      : `Excluir o tipo "${type.name}"?`;
    if (!window.confirm(msg)) return;
    setTypeBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API}/api/installments/types/${type.id}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir tipo.');
      await loadSettings();
      setSuccess(`Tipo "${type.name}" removido da lista de sugestões.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao excluir tipo.');
    } finally {
      setTypeBusy(false);
    }
  }

  const period = latestOpenPeriod();
  const preview = scheduleItem(
    { startsAt: period, totalAmount: '1200.00', installmentCount: 12, status: 'ATIVO' },
    1,
    validateRules(rules) ? DEFAULT_INSTALLMENT_RULES : rules
  );
  const turning = new Date(
    Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + (Number(rules.lateMonthOffset) || 2), 1)
  );

  if (!allowed) {
    return <p>Você não tem permissão para configurar parcelamentos.</p>;
  }
  if (loading) {
    return <p>Carregando regras e tipos de parcelamentos...</p>;
  }

  return (
    <div className="installment-settings-panel">
      <h3>1. Regra Geral de Vencimento e Atraso</h3>
      <p>
        Parcelas sem pagamento começam pendentes. O atraso e a barra de progresso da Visão Geral são calculados automaticamente pelo calendário de Brasília.
      </p>
      <div className="installment-form-grid">
        <label>
          Quando considerar atrasado?
          <select
            disabled={saving}
            value={rules.lateMode}
            onChange={(event) =>
              setRules({ ...rules, lateMode: event.target.value as InstallmentRules['lateMode'] })
            }
          >
            <option value="MONTH_TURN">Na virada de mês</option>
            <option value="DUE_DATE">No dia seguinte ao vencimento</option>
          </select>
        </label>
        <label>
          Virada de atraso: meses após a competência
          <select
            disabled={saving}
            value={rules.lateMonthOffset}
            onChange={(event) => setRules({ ...rules, lateMonthOffset: Number(event.target.value) })}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value === 1
                  ? '1 — virada logo após a competência'
                  : value === 2
                  ? '2 — virada após o mês de trabalho do Fiscal'
                  : `${value} meses`}
              </option>
            ))}
          </select>
          <small>Padrão: 2. Setembro é trabalhado em outubro e fica atrasado em novembro.</small>
        </label>
        <label>
          Dia padrão de vencimento
          <input
            type="number"
            min={1}
            max={31}
            disabled={saving}
            value={rules.dueDay}
            onChange={(event) => setRules({ ...rules, dueDay: Number(event.target.value) })}
          />
          <small>Dia 31 em meses curtos usa o último dia do mês.</small>
        </label>
        <label>
          Vencimento: meses após a competência
          <select
            disabled={saving}
            value={rules.dueMonthOffset}
            onChange={(event) => setRules({ ...rules, dueMonthOffset: Number(event.target.value) })}
          >
            {Array.from({ length: 13 }, (_, value) => value).map((value) => (
              <option key={value} value={value}>
                {value === 0
                  ? '0 — no próprio mês da competência'
                  : value === 1
                  ? '1 — no mês seguinte à competência'
                  : `${value} meses depois`}
              </option>
            ))}
          </select>
        </label>
        <label className="full-width">
          Vínculo com o Fechamento Mensal (Regime)
          <select
            disabled={saving}
            value={rules.closingLinkMode || 'DUE_NEXT_MONTH'}
            onChange={(event) =>
              setRules({ ...rules, closingLinkMode: event.target.value as any })
            }
          >
            <option value="DUE_NEXT_MONTH">
              Regime de Caixa (Recomendado) — Parcela que vence no mês seguinte (ex: Fechamento de Outubro monitora a parcela que vence em Novembro)
            </option>
            <option value="COMPETENCE">
              Regime de Competência — Parcela da mesma competência contábil
            </option>
            <option value="DUE_SAME_MONTH">
              Vencimento no próprio mês — Parcela cujo vencimento é no mesmo mês da competência
            </option>
          </select>
          <small>
            No fechamento contábil e fiscal de Outubro (executado em Novembro), o regime de caixa indica que a equipe deve emitir e enviar a parcela que o cliente deve pagar em Novembro. Assim, a parcela do mês 11 aparece pendente e pronta para confirmação, sem indicar atraso indevido.
          </small>
        </label>
      </div>

      <div className="installment-example">
        <h4>
          <CalendarClock size={18} />
          Simulação na competência atual
        </h4>
        <p>
          Competência:{' '}
          <strong>
            {period.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </strong>{' '}
          · parcela prevista: <strong>{formatMoney(preview.amount)}</strong>
        </p>
        <p>
          Vencimento:{' '}
          <strong>{new Date(preview.dueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong>
        </p>
        <p>
          Atraso:{' '}
          {rules.lateMode === 'DUE_DATE'
            ? 'a partir do dia seguinte ao vencimento'
            : `a partir de ${turning.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`}
          , se não houver confirmação de pagamento.
        </p>
      </div>

      <p>
        Um parcelamento também pode ter regra própria no seu cadastro. Alterar a regra geral afeta apenas os que herdam essa configuração; confirmações e valores pagos permanecem intactos.
      </p>

      {error && (
        <p className="installment-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="installment-success" role="status">
          {success}
        </p>
      )}

      <button
        className="btn-primary-gradient"
        disabled={!loaded || saving || !!validateRules(rules)}
        onClick={() => {
          void save();
        }}
      >
        <Save size={16} />
        {saving ? 'Salvando...' : 'Salvar Regras de Parcelamento'}
      </button>

      <hr />

      <h3>2. Catálogo de Tipos de Parcelamento ({types.length})</h3>
      <p>
        Gerencie os tipos sugeridos ao cadastrar ou editar parcelamentos (ex: PGFN, Simples Nacional, Previdenciário, ICMS). Renomear um tipo também atualiza os parcelamentos vinculados.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', maxWidth: '540px' }}>
        <input
          type="text"
          value={newTypeName}
          disabled={typeBusy}
          onChange={(e) => setNewTypeName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleCreateType();
            }
          }}
          placeholder="Ex: PGFN - Dívida Ativa União, PERT, Simples Nacional..."
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(15,23,42,0.7)',
            color: '#f8fafc',
            fontSize: '0.86rem',
          }}
        />
        <button
          type="button"
          className="btn-primary-gradient"
          disabled={typeBusy || !newTypeName.trim()}
          onClick={() => {
            void handleCreateType();
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
        >
          <Plus size={15} />
          Adicionar Tipo
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: '8px',
          maxHeight: '360px',
          overflowY: 'auto',
          paddingRight: '4px',
        }}
      >
        {types.length === 0 ? (
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Nenhum tipo cadastrado ainda.</span>
        ) : (
          types.map((type) => {
            const isEditing = editingTypeId === type.id;
            return (
              <div
                key={type.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editingTypeName}
                      disabled={typeBusy}
                      onChange={(e) => setEditingTypeName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRenameType(type.id);
                        if (e.key === 'Escape') setEditingTypeId(null);
                      }}
                      autoFocus
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid #818cf8',
                        background: '#0f172a',
                        color: '#fff',
                        fontSize: '0.82rem',
                      }}
                    />
                    <button
                      type="button"
                      title="Salvar nome"
                      disabled={typeBusy || !editingTypeName.trim()}
                      onClick={() => void handleRenameType(type.id)}
                      style={{ background: 'transparent', border: 'none', color: '#34d399', cursor: 'pointer', padding: '4px' }}
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      title="Cancelar"
                      disabled={typeBusy}
                      onClick={() => setEditingTypeId(null)}
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                    >
                      <X size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: '0.83rem',
                          fontWeight: 600,
                          color: '#e2e8f0',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={type.name}
                      >
                        {type.name}
                      </div>
                      <small style={{ color: '#64748b', fontSize: '0.72rem' }}>
                        {type.usageCount ? `${type.usageCount} plano(s)` : 'Sugestão disponível'}
                      </small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        title="Renomear tipo"
                        disabled={typeBusy}
                        onClick={() => {
                          setEditingTypeId(type.id);
                          setEditingTypeName(type.name);
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        title="Remover tipo"
                        disabled={typeBusy}
                        onClick={() => void handleDeleteType(type)}
                        style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <hr />
      <h3>3. Permissões de Parcelamentos</h3>
      <p>
        Em <strong>Configurações → Permissões</strong>, defina <strong>Parcelamento</strong> como{' '}
        <em>Ver</em> ou <em>Editar</em>. Você também pode escolher <strong>Ver Todas · Editar Só Onde é Responsável</strong> para permitir consulta completa da carteira restringindo alterações apenas às empresas do colaborador.
      </p>
    </div>
  );
}

export function InstallmentSettings({
  currentView,
  onNavigate,
  currentUser,
  onLogout,
}: {
  currentView: string;
  onNavigate: (view: string) => void;
  currentUser?: CurrentUser | null;
  onLogout?: () => void;
}) {
  return (
    <div className="crm-dashboard">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />
      <main className="crm-main">
        <div className="closings-container">
          <div className="closings-header">
            <div className="closings-header-titles">
              <h1>
                <Settings size={28} color="#818cf8" />
                Configurações de Parcelamentos
              </h1>
              <p>Vencimentos, regras de atraso e catálogo de tipos de parcelamento</p>
            </div>
          </div>
          <InstallmentSettingsPanel currentUser={currentUser} />
        </div>
      </main>
    </div>
  );
}
