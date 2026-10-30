import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Save,
  Plus,
  Edit2,
  Trash2,
  X,
  ChevronUp,
  ChevronDown,
  Scale,
  ListChecks,
  Building2,
  Send,
  ShieldCheck,
  FileKey,
  FolderKanban,
} from 'lucide-react';
import { API } from '../api';
import type { CurrentUser } from '../types/auth';
import { installmentHeaders } from '../config/installments';
import {
  ALL_FISCAL_KEYS,
  ALL_TAX_REGIMES,
  DEFAULT_FISCAL_REGIME_NA_RULES,
  normalizeFiscalRegimeRules,
  setActiveFiscalRegimeRules,
  type FiscalRegimeNaMap,
} from '../config/fiscalRegimeRules';
import {
  DEFAULT_COMPANY_CATALOG,
  normalizeCompanyCatalog,
  type CompanyCatalogConfig,
} from '../config/systemCatalogs';
import { resolveColumnKey } from '../config/payrollColumns';
import { ButtonSpinner } from './LoadingSkeleton';

const FALLBACK_FISCAL_LABELS: Record<string, string> = {
  carne_leao: 'Carnê Leão',
  reinf: 'REINF',
  impostos: 'Impostos',
  iss: 'ISS',
  mit: 'MIT',
  sped_fiscal: 'SPED Fiscal',
  sped_contribuicao: 'SPED Contribuição',
  destda: 'DeSTDA',
};

export function FiscalRegimeRulesPanel({
  currentUser,
  columns,
  onSaved,
}: {
  currentUser?: CurrentUser | null;
  columns: any[];
  onSaved?: () => void;
}) {
  const [rules, setRules] = useState<FiscalRegimeNaMap>(() =>
    normalizeFiscalRegimeRules(DEFAULT_FISCAL_REGIME_NA_RULES)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fiscalColumns = useMemo(() => {
    const activeFiscal = (columns || [])
      .filter((c) => c.department === 'FISCAL' && c.isActive !== false)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
      .map((c) => ({
        key: resolveColumnKey(c) || c.columnKey || c.id,
        label: c.name,
        countsProgress: Boolean(c.countsProgress),
      }));

    if (activeFiscal.length > 0) {
      const seen = new Set<string>();
      return activeFiscal.filter((col) => {
        if (!col.key || seen.has(col.key)) return false;
        seen.add(col.key);
        return true;
      });
    }

    return ALL_FISCAL_KEYS.map((key) => ({
      key,
      label: FALLBACK_FISCAL_LABELS[key] || key,
      countsProgress: true,
    }));
  }, [columns]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API}/api/app-config`);
        const data = await res.json();
        if (!active) return;
        if (res.ok && data?.fiscalRegimeRules) {
          const normalized = normalizeFiscalRegimeRules(data.fiscalRegimeRules);
          setRules(normalized);
          setActiveFiscalRegimeRules(normalized);
        }
      } catch {
        // mantém fallback padrão
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggleRule = (regimeKey: string, colKey: string) => {
    setFeedback(null);
    setDirty(true);
    setRules((prev) => {
      const current = new Set(prev[regimeKey] || []);
      if (current.has(colKey)) {
        current.delete(colKey);
      } else {
        current.add(colKey);
      }
      return {
        ...prev,
        [regimeKey]: Array.from(current),
      };
    });
  };

  const setEntireRegime = (regimeKey: string, mode: 'ALL_REQUIRED' | 'ALL_NA') => {
    setFeedback(null);
    setDirty(true);
    setRules((prev) => ({
      ...prev,
      [regimeKey]: mode === 'ALL_NA' ? fiscalColumns.map((c) => c.key) : [],
    }));
  };

  const handleRestoreDefaults = () => {
    setRules(normalizeFiscalRegimeRules(DEFAULT_FISCAL_REGIME_NA_RULES));
    setDirty(true);
    setFeedback({
      type: 'success',
      text: 'Padrão contábil restaurado na tela. Clique em "Salvar Regras Fiscais" para aplicar no banco.',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API}/api/app-config/fiscal_regime_rules`, {
        method: 'PUT',
        headers: installmentHeaders(currentUser),
        body: JSON.stringify({ value: rules }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar regras fiscais.');
      const normalized = normalizeFiscalRegimeRules(data.fiscalRegimeRules || rules);
      setRules(normalized);
      setActiveFiscalRegimeRules(normalized);
      setDirty(false);
      setFeedback({
        type: 'success',
        text: 'Regras fiscais salvas com sucesso! Os fechamentos fiscais e o progresso do Dashboard já usam a nova matriz.',
      });
      onSaved?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Erro ao salvar regras fiscais.',
      });
    } finally {
      setSaving(false);
    }
  };

  const totalNaCells = useMemo(() => {
    const validKeys = new Set(fiscalColumns.map((c) => c.key));
    return ALL_TAX_REGIMES.reduce(
      (acc, r) => acc + (rules[r.key] || []).filter((k) => validKeys.has(k)).length,
      0
    );
  }, [rules, fiscalColumns]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="settings-stats">
        <div className="stat-card accent">
          <Scale size={20} />
          <div>
            <strong>{ALL_TAX_REGIMES.length}</strong>
            <span>Regimes Tributários</span>
          </div>
        </div>
        <div className="stat-card">
          <ListChecks size={20} />
          <div>
            <strong>{fiscalColumns.length}</strong>
            <span>Colunas Fiscais Mapeadas</span>
          </div>
        </div>
        <div className="stat-card">
          <CheckCircle2 size={20} />
          <div>
            <strong>{totalNaCells}</strong>
            <span>Dispensas Automáticas (N/A)</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 12,
            background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.14)',
            border: `1px solid ${feedback.type === 'success' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
            color: feedback.type === 'success' ? '#6ee7b7' : '#fca5a5',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="settings-panel">
        <div className="panel-toolbar" style={{ flexWrap: 'wrap' }}>
          <div>
            <h2>
              <Scale size={20} /> Matriz de Obrigações Fiscais por Regime Tributário
            </h2>
            <p>
              Clique nas células para alternar entre <strong>Obrigatório</strong> e{' '}
              <strong>N/A Automático</strong>. Colunas marcadas como N/A Automático são dispensadas automaticamente para empresas daquele regime.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={handleRestoreDefaults} disabled={saving}>
              <RotateCcw size={16} /> Restaurar Padrão
            </button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? <ButtonSpinner /> : <Save size={16} />}
              <span>{saving ? 'Salvando...' : dirty ? 'Salvar Regras Fiscais *' : 'Salvar Regras Fiscais'}</span>
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: Math.max(820, 240 + fiscalColumns.length * 120),
            }}
          >
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.025)', borderBottom: '1px solid var(--border-color)' }}>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    background: '#111827',
                    textAlign: 'left',
                    padding: '14px 18px',
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--text-muted)',
                    borderRight: '1px solid var(--border-color)',
                    minWidth: 230,
                  }}
                >
                  Regime Tributário
                </th>
                {fiscalColumns.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      padding: '12px 10px',
                      textAlign: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-main)',
                      borderBottom: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <span>{col.label}</span>
                      {col.countsProgress && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 999,
                            background: 'rgba(16,185,129,0.12)',
                            color: '#6ee7b7',
                            fontWeight: 500,
                          }}
                        >
                          Progresso %
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_TAX_REGIMES.map((regime) => {
                const regimeNaSet = new Set(rules[regime.key] || []);
                const naCount = fiscalColumns.filter((c) => regimeNaSet.has(c.key)).length;
                const reqCount = fiscalColumns.length - naCount;
                return (
                  <tr
                    key={regime.key}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <td
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        background: '#111827',
                        padding: '12px 18px',
                        borderRight: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <strong style={{ fontSize: 13.5, color: 'var(--text-main)' }}>{regime.label}</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                          <span>{reqCount} obrig. · {naCount} N/A</span>
                          <button
                            type="button"
                            onClick={() => setEntireRegime(regime.key, naCount === fiscalColumns.length ? 'ALL_REQUIRED' : 'ALL_NA')}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#cbd5e1',
                              borderRadius: 6,
                              padding: '1px 6px',
                              fontSize: 10.5,
                              cursor: 'pointer',
                            }}
                            title="Alternar linha inteira"
                          >
                            {naCount === fiscalColumns.length ? 'Marcar tudo Obrig.' : 'Marcar tudo N/A'}
                          </button>
                        </div>
                      </div>
                    </td>
                    {fiscalColumns.map((col) => {
                      const isNa = regimeNaSet.has(col.key);
                      return (
                        <td key={col.key} style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => toggleRule(regime.key, col.key)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 5,
                              width: '100%',
                              maxWidth: 122,
                              padding: '7px 10px',
                              borderRadius: 9,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              background: isNa ? 'rgba(148, 163, 184, 0.1)' : 'rgba(16, 185, 129, 0.13)',
                              border: isNa
                                ? '1px solid rgba(148, 163, 184, 0.25)'
                                : '1px solid rgba(16, 185, 129, 0.35)',
                              color: isNa ? '#94a3b8' : '#6ee7b7',
                            }}
                            title={`${regime.label} → ${col.label}: clique para ${isNa ? 'tornar Obrigatório' : 'dispensar (N/A Automático)'}`}
                          >
                            {isNa ? 'N/A Autom.' : '✓ Obrigatório'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type CatalogSectionKey = keyof CompanyCatalogConfig;

const CATALOG_SECTIONS: Array<{
  key: CatalogSectionKey;
  title: string;
  subtitle: string;
  placeholder: string;
  Icon: any;
  color: string;
}> = [
  {
    key: 'companyTypes',
    title: 'Tipos de Empresa',
    subtitle: 'Opções exibidas no campo "Tipo de Empresa" no cadastro e edição de empresas.',
    placeholder: 'Ex: Construtora, Clínica, E-commerce...',
    Icon: Building2,
    color: '#3b82f6',
  },
  {
    key: 'deliveryMethods',
    title: 'Métodos de Envio ao Cliente',
    subtitle: 'Canais de entrega exibidos no campo "Método de Envio" (Nibo, WhatsApp, E-mail, Onvio...).',
    placeholder: 'Ex: Portal Cliente, WhatsApp/E-mail...',
    Icon: Send,
    color: '#10b981',
  },
  {
    key: 'certificateTypes',
    title: 'Tipos de Certificado Digital',
    subtitle: 'Modelos de certificado aceitos no cadastro de empresas, Certificados e Cushman.',
    placeholder: 'Ex: A1 NUVEM, PROCURAÇÃO E-CAC...',
    Icon: ShieldCheck,
    color: '#8b5cf6',
  },
  {
    key: 'nfAccessTypes',
    title: 'Tipos de Acesso para Emissão de NF',
    subtitle: 'Formas de autenticação na aba "Acesso NF" do cadastro de empresas.',
    placeholder: 'Ex: Login Municipal, Token Gov.br...',
    Icon: FileKey,
    color: '#f59e0b',
  },
  {
    key: 'groupSuggestions',
    title: 'Grupos Econômicos Sugeridos',
    subtitle: 'Sugestões rápidas de autocompletar ao informar o Grupo Econômico de uma empresa.',
    placeholder: 'Ex: Grupo Q-Max, Holding Alpha...',
    Icon: FolderKanban,
    color: '#ec4899',
  },
];

export function SystemCatalogsPanel({
  currentUser,
  onSaved,
}: {
  currentUser?: CurrentUser | null;
  onSaved?: () => void;
}) {
  const [catalog, setCatalog] = useState<CompanyCatalogConfig>(() =>
    normalizeCompanyCatalog(DEFAULT_COMPANY_CATALOG)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newInputs, setNewInputs] = useState<Record<string, string>>({});
  const [editingItem, setEditingItem] = useState<{ section: CatalogSectionKey; index: number; value: string } | null>(
    null
  );
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API}/api/app-config`);
        const data = await res.json();
        if (!active) return;
        if (res.ok && data?.companyCatalog) {
          setCatalog(normalizeCompanyCatalog(data.companyCatalog));
        }
      } catch {
        // mantém padrão
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const addItem = (section: CatalogSectionKey) => {
    const raw = (newInputs[section] || '').trim().replace(/\s+/g, ' ');
    if (!raw) return;
    const list = catalog[section] || [];
    if (list.some((x) => x.toLocaleLowerCase('pt-BR') === raw.toLocaleLowerCase('pt-BR'))) {
      setFeedback({ type: 'error', text: `A opção "${raw}" já existe em ${section}.` });
      return;
    }
    setCatalog((prev) => ({
      ...prev,
      [section]: [...(prev[section] || []), raw],
    }));
    setNewInputs((prev) => ({ ...prev, [section]: '' }));
    setDirty(true);
    setFeedback(null);
  };

  const commitRename = () => {
    if (!editingItem) return;
    const clean = editingItem.value.trim().replace(/\s+/g, ' ');
    if (!clean) {
      setEditingItem(null);
      return;
    }
    setCatalog((prev) => {
      const next = [...(prev[editingItem.section] || [])];
      const duplicate = next.some(
        (item, idx) =>
          idx !== editingItem.index && item.toLocaleLowerCase('pt-BR') === clean.toLocaleLowerCase('pt-BR')
      );
      if (duplicate) return prev;
      next[editingItem.index] = clean;
      return { ...prev, [editingItem.section]: next };
    });
    setEditingItem(null);
    setDirty(true);
  };

  const removeItem = (section: CatalogSectionKey, index: number) => {
    setCatalog((prev) => {
      const next = [...(prev[section] || [])];
      next.splice(index, 1);
      return { ...prev, [section]: next };
    });
    setDirty(true);
    setFeedback(null);
  };

  const moveItem = (section: CatalogSectionKey, index: number, delta: -1 | 1) => {
    setCatalog((prev) => {
      const next = [...(prev[section] || [])];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return { ...prev, [section]: next };
    });
    setDirty(true);
  };

  const restoreSection = (section: CatalogSectionKey) => {
    setCatalog((prev) => ({
      ...prev,
      [section]: [...DEFAULT_COMPANY_CATALOG[section]],
    }));
    setDirty(true);
    setFeedback(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API}/api/app-config/company_catalog`, {
        method: 'PUT',
        headers: installmentHeaders(currentUser),
        body: JSON.stringify({ value: catalog }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar listas de cadastro.');
      if (data?.companyCatalog) {
        setCatalog(normalizeCompanyCatalog(data.companyCatalog));
      }
      setDirty(false);
      setFeedback({
        type: 'success',
        text: 'Listas e opções de cadastro salvas com sucesso! Os formulários de Empresas já estão atualizados.',
      });
      onSaved?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Erro ao salvar listas de cadastro.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="settings-panel">
        <div className="panel-toolbar" style={{ flexWrap: 'wrap' }}>
          <div>
            <h2>
              <ListChecks size={20} /> Listas e Opções Dinâmicas de Cadastro
            </h2>
            <p>
              Crie, edite, reordene ou remova opções exibidas nos seletores de cadastro de empresas e certificados sem precisar alterar código.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setCatalog(normalizeCompanyCatalog(DEFAULT_COMPANY_CATALOG));
                setDirty(true);
              }}
              disabled={saving}
            >
              <RotateCcw size={16} /> Restaurar Padrões
            </button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? <ButtonSpinner /> : <Save size={16} />}
              <span>{saving ? 'Salvando...' : dirty ? 'Salvar Todas as Listas *' : 'Salvar Todas as Listas'}</span>
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 12,
            background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.14)',
            border: `1px solid ${feedback.type === 'success' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
            color: feedback.type === 'success' ? '#6ee7b7' : '#fca5a5',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 18,
        }}
      >
        {CATALOG_SECTIONS.map((sec) => {
          const items = catalog[sec.key] || [];
          const Icon = sec.Icon;
          return (
            <div key={sec.key} className="settings-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  padding: '18px 20px',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', gap: 12 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: `${sec.color}20`,
                      color: sec.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={19} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-main)' }}>
                      {sec.title}{' '}
                      <span
                        style={{
                          fontSize: 11.5,
                          padding: '1px 8px',
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.07)',
                          color: 'var(--text-muted)',
                          marginLeft: 4,
                        }}
                      >
                        {items.length}
                      </span>
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35 }}>
                      {sec.subtitle}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  title="Restaurar padrão desta lista"
                  onClick={() => restoreSection(sec.key)}
                >
                  <RotateCcw size={15} />
                </button>
              </div>

              <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={newInputs[sec.key] || ''}
                  placeholder={sec.placeholder}
                  onChange={(e) => setNewInputs((prev) => ({ ...prev, [sec.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addItem(sec.key);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: 9,
                    background: 'rgba(0,0,0,0.28)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '8px 14px', fontSize: 13 }}
                  onClick={() => addItem(sec.key)}
                >
                  <Plus size={15} /> Adicionar
                </button>
              </div>

              <div style={{ padding: '8px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {items.length === 0 ? (
                  <div style={{ padding: 18, textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)' }}>
                    Nenhuma opção cadastrada nesta lista. Adicione acima!
                  </div>
                ) : (
                  items.map((item, idx) => {
                    const isEditing = editingItem?.section === sec.key && editingItem?.index === idx;
                    return (
                      <div
                        key={`${item}-${idx}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '7px 10px',
                          borderRadius: 9,
                          background: 'rgba(255,255,255,0.025)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        {isEditing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                            <input
                              type="text"
                              autoFocus
                              value={editingItem.value}
                              onChange={(e) =>
                                setEditingItem((prev) => (prev ? { ...prev, value: e.target.value } : null))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitRename();
                                } else if (e.key === 'Escape') {
                                  setEditingItem(null);
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '5px 9px',
                                borderRadius: 7,
                                background: 'rgba(0,0,0,0.4)',
                                border: '1px solid var(--accent)',
                                color: '#fff',
                                fontSize: 13,
                              }}
                            />
                            <button type="button" className="icon-btn edit" onClick={commitRename} title="Confirmar">
                              <Check size={15} />
                            </button>
                            <button type="button" className="icon-btn" onClick={() => setEditingItem(null)} title="Cancelar">
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-main)' }}>{item}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <button
                                type="button"
                                className="icon-btn"
                                disabled={idx === 0}
                                onClick={() => moveItem(sec.key, idx, -1)}
                                title="Mover para cima"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                disabled={idx === items.length - 1}
                                onClick={() => moveItem(sec.key, idx, 1)}
                                title="Mover para baixo"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn edit"
                                onClick={() => setEditingItem({ section: sec.key, index: idx, value: item })}
                                title="Renomear opção"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn delete"
                                onClick={() => removeItem(sec.key, idx)}
                                title="Remover opção"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

