import { useEffect, useState, useRef } from 'react';
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
  Sparkles
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

export interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string, companyId?: string) => void;
  onOpenCompany360?: (companyId: string) => void;
}

export function SpotlightSearch({
  isOpen,
  onClose,
  onNavigate,
  onOpenCompany360,
}: SpotlightSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotlightCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Foco no input ao abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Busca debounced
  useEffect(() => {
    if (!isOpen) return;

    let isCurrent = true;
    setLoading(true);

    const timer = setTimeout(() => {
      fetch(`${API}/api/spotlight?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (isCurrent && data?.results) {
            setResults(data.results);
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
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          if (onOpenCompany360) {
            onOpenCompany360(selected.id);
            onClose();
          } else {
            onNavigate('companies', selected.id);
            onClose();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, [isOpen, results, selectedIndex, onClose, onNavigate, onOpenCompany360]);

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
            placeholder="Digite código (ex: 02000), razão social, CNPJ ou cidade..."
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
          {loading && results.length === 0 ? (
            <div className="spotlight-empty">Buscando empresas...</div>
          ) : results.length === 0 ? (
            <div className="spotlight-empty">
              {query ? 'Nenhuma empresa encontrada para a busca informada.' : 'Digite para buscar qualquer empresa da carteira.'}
            </div>
          ) : (
            results.map((c, index) => {
              const isSelected = index === selectedIndex;
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
                  onMouseEnter={() => setSelectedIndex(index)}
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
                        <span>Raio-X 360°</span>
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
            })
          )}
        </div>

        {/* FOOTER COM ATALHOS */}
        <div className="spotlight-footer">
          <div className="spotlight-keys-guide">
            <span className="guide-item">
              <kbd><ArrowUpDown size={11} /></kbd> Navegar
            </span>
            <span className="guide-item">
              <kbd><CornerDownLeft size={11} /></kbd> Abrir Raio-X 360°
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

