import { useEffect, useState, useRef, useMemo } from 'react';
import {
  Search,
  Building2,
  Calendar,
  X,
  FileCheck,
  Users,
  Eye,
  CornerDownLeft,
  ArrowUpDown,
  Send,
  ShieldCheck,
  Sparkles,
  Calculator,
  Award,
  MailWarning,
  FileCode,
  Database,
  Share2,
  UserPlus
} from 'lucide-react';
import { API } from '../api';
import './SpotlightSearch.css';

export interface SpotlightCompany {
  id: string;
  code: string | null;
  name: string;
  tradeName: string | null;
  cnpj: string;
  taxRegime: string;
  city: string | null;
  activeSectors: string | null;
  isActive: boolean;
  hasCertificate: boolean;
  certificateExpiration: string | null;
  responsibles: Array<{
    sector: string;
    name: string;
    role: string;
  }>;
}

export interface QuickActionItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'Ferramenta' | 'Fiscal' | 'Segurança';
  badge: string;
  badgeBg: string;
  badgeColor: string;
  icon: any;
  keywords: string[];
  run: (onNavigate: (view: string, id?: string) => void, onClose: () => void) => void;
}

export interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string, companyId?: string) => void;
  onOpenCompany360?: (companyId: string) => void;
}

const SYSTEM_QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: 'factor-r',
    title: 'Simulador do Fator R (Simples Nacional)',
    subtitle: 'Calcular pró-labore ideal para migrar do Anexo V (15,5%) para o Anexo III (6%)',
    category: 'Ferramenta',
    badge: 'Fator R',
    badgeBg: 'rgba(168, 85, 247, 0.15)',
    badgeColor: '#c084fc',
    icon: Calculator,
    keywords: ['fator r', 'simples', 'anexo iii', 'anexo v', 'pro-labore', 'prolabore', 'calculadora', 'economia'],
    run: (_nav, close) => {
      window.dispatchEvent(new CustomEvent('open-factor-r'));
      close();
    },
  },
  {
    id: 'monthly-dossier',
    title: 'Dossiê Mensal de Conformidade & Fechamento',
    subtitle: 'Emitir certificado executivo em formato A4 com status fiscal, tributos e CNDs',
    category: 'Fiscal',
    badge: 'Dossiê A4',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeColor: '#6ee7b7',
    icon: Award,
    keywords: ['dossie', 'dossier', 'laudo', 'certificado', 'conformidade', 'relatorio', 'impressao', 'pdf'],
    run: (_nav, close) => {
      window.dispatchEvent(new CustomEvent('open-monthly-dossier'));
      close();
    },
  },
  {
    id: 'dte-inbox',
    title: 'Guardião DTE (Notificações e-CAC / SEFAZ)',
    subtitle: 'Monitorar caixas postais fiscais, intimações e contagem regressiva de prazos legais',
    category: 'Fiscal',
    badge: 'e-CAC',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeColor: '#fcd34d',
    icon: MailWarning,
    keywords: ['dte', 'ecac', 'e-cac', 'intimacao', 'notificacao', 'receita', 'caixa postal', 'prazo'],
    run: (_nav, close) => {
      window.dispatchEvent(new CustomEvent('open-dte-inbox'));
      close();
    },
  },
  {
    id: 'sped-validator',
    title: 'Pré-Validador de Arquivos SPED (.txt)',
    subtitle: 'Checar integridade do SPED Fiscal e EFD Contribuições antes de transmitir ao PVA',
    category: 'Fiscal',
    badge: 'SPED .txt',
    badgeBg: 'rgba(56, 189, 248, 0.15)',
    badgeColor: '#7dd3fc',
    icon: FileCode,
    keywords: ['sped', 'efd', 'icms', 'ipi', 'contribuicoes', 'validador', 'txt', 'pva', 'registro 0000'],
    run: (_nav, close) => {
      window.dispatchEvent(new CustomEvent('open-sped-validator'));
      close();
    },
  },
  {
    id: 'database-backups',
    title: 'Backups do Sistema & Snapshot de Banco',
    subtitle: 'Criar snapshot instantâneo compactado (.json.gz) ou baixar cópias de segurança',
    category: 'Segurança',
    badge: 'Backup',
    badgeBg: 'rgba(99, 102, 241, 0.15)',
    badgeColor: '#a5b4fc',
    icon: Database,
    keywords: ['backup', 'copia', 'banco', 'snapshot', 'restaurar', 'seguranca', 'json'],
    run: (_nav, close) => {
      window.dispatchEvent(new CustomEvent('open-backup-modal'));
      close();
    },
  },
  {
    id: 'client-portal',
    title: 'Portal do Cliente (Upload Externo Seguro)',
    subtitle: 'Gerar link direto para o cliente enviar extratos e notas fiscais sem senha',
    category: 'Ferramenta',
    badge: 'Uploads',
    badgeBg: 'rgba(56, 189, 248, 0.15)',
    badgeColor: '#38bdf8',
    icon: Share2,
    keywords: ['portal', 'upload', 'cliente', 'documentos', 'link', 'externo', 'recepcao'],
    run: (_nav, close) => {
      window.dispatchEvent(new CustomEvent('open-client-portal'));
      close();
    },
  },
  {
    id: 'new-company',
    title: 'Cadastrar Novo Cliente (CNPJ ou CPF)',
    subtitle: 'Abrir formulário de cadastro de empresa ou pessoa física com validação',
    category: 'Ferramenta',
    badge: 'Novo',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeColor: '#34d399',
    icon: UserPlus,
    keywords: ['cadastrar', 'novo', 'nova empresa', 'cliente', 'cpf', 'cnpj', 'adicionar'],
    run: (nav, close) => {
      nav('companies');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-new-company'));
      }, 100);
      close();
    },
  },
];

export function SpotlightSearch({
  isOpen,
  onClose,
  onNavigate,
  onOpenCompany360,
}: SpotlightSearchProps) {
  const [query, setQuery] = useState('');
  const [companies, setCompanies] = useState<SpotlightCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Ações filtradas por query
  const matchingActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Exibe as 4 principais ferramentas recomendadas quando não há query
      return SYSTEM_QUICK_ACTIONS.slice(0, 4);
    }
    return SYSTEM_QUICK_ACTIONS.filter((act) =>
      act.title.toLowerCase().includes(q) ||
      act.subtitle.toLowerCase().includes(q) ||
      act.keywords.some((k) => k.includes(q))
    );
  }, [query]);

  // Lista unificada para seleção por teclado
  const totalItemsCount = matchingActions.length + companies.length;

  // Foco no input ao abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      setQuery('');
      setCompanies([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Busca debounced na API
  useEffect(() => {
    if (!isOpen) return;

    let isCurrent = true;
    setLoading(true);

    const timer = setTimeout(() => {
      fetch(`${API}/api/spotlight?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (isCurrent && data?.results) {
            setCompanies(data.results);
            setSelectedIndex(0);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isCurrent) setLoading(false);
        });
    }, 150);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  // Navegação por teclado
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyNav = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (totalItemsCount > 0 ? (prev < totalItemsCount - 1 ? prev + 1 : 0) : 0));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (totalItemsCount > 0 ? (prev > 0 ? prev - 1 : totalItemsCount - 1) : 0));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex < matchingActions.length) {
          const act = matchingActions[selectedIndex];
          if (act) act.run(onNavigate, onClose);
        } else {
          const companyIdx = selectedIndex - matchingActions.length;
          const selected = companies[companyIdx];
          if (selected) {
            if (onOpenCompany360) {
              onOpenCompany360(selected.id);
            } else {
              onNavigate('companies', selected.id);
            }
            onClose();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, [isOpen, totalItemsCount, matchingActions, companies, selectedIndex, onClose, onNavigate, onOpenCompany360]);

  // Scroll automático no item selecionado
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector('.spotlight-item.active') as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const formatCNPJ = (cnpj: string) => {
    const clean = (cnpj || '').replace(/\D/g, '');
    if (clean.length === 14) return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (clean.length === 11) return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return cnpj;
  };

  const handleWhatsApp = (c: SpotlightCompany, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = encodeURIComponent(
      `Olá, equipe ${c.name}! Aqui é da contabilidade Fechamento Pro. Gostaríamos de alinhar informações sobre a sua empresa.`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="spotlight-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="spotlight-dialog" onClick={(e) => e.stopPropagation()}>
        {/* INPUT DE BUSCA */}
        <div className="spotlight-search-header">
          <Search size={20} className="spotlight-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="spotlight-input"
            placeholder="Buscar empresa, CNPJ, CPF ou ferramenta (ex: Fator R, SPED, DTE, Backup)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="spotlight-clear-btn"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
            >
              <X size={16} />
            </button>
          ) : (
            <span className="spotlight-badge-hint">ESC para fechar</span>
          )}
        </div>

        {/* LISTA DE RESULTADOS */}
        <div ref={listRef} className="spotlight-results-list">
          {/* SEÇÃO 1: AÇÕES DO SISTEMA */}
          {matchingActions.length > 0 && (
            <div>
              <div className="spotlight-section-title">
                <Sparkles size={12} color="#60a5fa" />
                <span>Ferramentas & Ações Rápidas</span>
              </div>
              {matchingActions.map((act, index) => {
                const isSelected = index === selectedIndex;
                const IconComponent = act.icon;
                return (
                  <div
                    key={act.id}
                    className={`spotlight-item action ${isSelected ? 'active' : ''}`}
                    onClick={() => act.run(onNavigate, onClose)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="spotlight-item-avatar" style={{ color: act.badgeColor }}>
                      <IconComponent size={18} />
                    </div>

                    <div className="spotlight-item-main">
                      <div className="spotlight-item-title-row">
                        <strong className="item-name">{act.title}</strong>
                        <span
                          className="action-badge"
                          style={{ background: act.badgeBg, color: act.badgeColor }}
                        >
                          {act.badge}
                        </span>
                      </div>
                      <div className="spotlight-item-meta">
                        <span>{act.subtitle}</span>
                      </div>
                    </div>

                    <div className="spotlight-item-actions">
                      <kbd style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', color: '#94a3b8' }}>
                        Enter ↵
                      </kbd>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SEÇÃO 2: EMPRESAS */}
          {companies.length > 0 && (
            <div>
              <div className="spotlight-section-title">
                <Building2 size={12} color="#34d399" />
                <span>Empresas & Clientes ({companies.length})</span>
              </div>
              {companies.map((c, idx) => {
                const itemIndex = matchingActions.length + idx;
                const isSelected = itemIndex === selectedIndex;
                return (
                  <div
                    key={c.id}
                    className={`spotlight-item ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      if (onOpenCompany360) {
                        onOpenCompany360(c.id);
                        onClose();
                      } else {
                        onNavigate('companies', c.id);
                        onClose();
                      }
                    }}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                  >
                    <div className="spotlight-item-avatar">
                      <Building2 size={18} />
                      {c.code && <span className="avatar-code">{c.code}</span>}
                    </div>

                    <div className="spotlight-item-main">
                      <div className="spotlight-item-title-row">
                        <strong className="item-name">{c.name}</strong>
                        <span className="item-regime">{c.taxRegime}</span>
                        {c.hasCertificate && (
                          <span className="item-cert" title={`Certificado válido: ${c.certificateExpiration || 'Sim'}`}>
                            <ShieldCheck size={13} />
                            A1
                          </span>
                        )}
                      </div>
                      <div className="spotlight-item-meta">
                        <code>{formatCNPJ(c.cnpj)}</code>
                        {c.city && <span>· {c.city}</span>}
                        {c.responsibles.length > 0 && (
                          <span className="item-resps">
                            · {c.responsibles.map((r) => `${r.sector}: ${r.name}`).join(' | ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ATALHOS RÁPIDOS POR EMPRESA */}
                    <div className="spotlight-item-actions" onClick={(e) => e.stopPropagation()}>
                      {onOpenCompany360 && (
                        <button
                          type="button"
                          className="spotlight-action-btn"
                          title="Ver Raio-X Anual 360°"
                          onClick={() => {
                            onOpenCompany360(c.id);
                            onClose();
                          }}
                        >
                          <Calendar size={13} />
                          <span>Raio-X</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="spotlight-action-btn"
                        title="Ir para o Fechamento Fiscal"
                        onClick={() => {
                          onNavigate('closings', c.id);
                          onClose();
                        }}
                      >
                        <FileCheck size={13} />
                        <span>Fiscal</span>
                      </button>

                      <button
                        type="button"
                        className="spotlight-action-btn"
                        title="Ir para o Fechamento de DP"
                        onClick={() => {
                          onNavigate('closings-dp', c.id);
                          onClose();
                        }}
                      >
                        <Users size={13} />
                        <span>DP</span>
                      </button>

                      <button
                        type="button"
                        className="spotlight-action-btn"
                        title="Abrir no Cadastro de Empresas"
                        onClick={() => {
                          onNavigate('companies', c.id);
                          onClose();
                        }}
                      >
                        <Eye size={13} />
                        <span>Cadastro</span>
                      </button>

                      <button
                        type="button"
                        className="spotlight-action-btn whatsapp"
                        title="Abrir conversa no WhatsApp"
                        onClick={(e) => handleWhatsApp(c, e)}
                      >
                        <Send size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {loading && companies.length === 0 && matchingActions.length === 0 && (
            <div className="spotlight-empty">Buscando empresas e ferramentas...</div>
          )}

          {!loading && companies.length === 0 && matchingActions.length === 0 && (
            <div className="spotlight-empty">
              Nenhum resultado encontrado para &quot;{query}&quot;.
            </div>
          )}
        </div>

        {/* FOOTER COM ATALHOS */}
        <div className="spotlight-footer">
          <div className="spotlight-keys-guide">
            <span className="guide-item">
              <kbd><ArrowUpDown size={11} /></kbd> Navegar
            </span>
            <span className="guide-item">
              <kbd><CornerDownLeft size={11} /></kbd> Abrir Selecionado
            </span>
            <span className="guide-item">
              <kbd>Ctrl Espaço</kbd> ou <kbd>/</kbd> Atalho Global
            </span>
            <span className="guide-item">
              <kbd>ESC</kbd> Fechar
            </span>
          </div>

          <div className="spotlight-brand-tag">
            <Sparkles size={12} />
            <span>Fechamento <strong>Pro</strong> Spotlight</span>
          </div>
        </div>
      </div>
    </div>
  );
}
