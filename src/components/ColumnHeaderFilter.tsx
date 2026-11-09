import { useState, useEffect, useRef } from 'react';
import { Filter, Check, Search, X } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface ColumnHeaderFilterProps {
  columnKey: string;
  label: string;
  activeFilter?: string;
  onFilterChange: (val: string) => void;
  openHeaderFilter: string | null;
  setOpenHeaderFilter: (key: string | null) => void;
  options: FilterOption[];
  align?: 'left' | 'right';
  badgeStyle?: boolean;
}

export function ColumnHeaderFilter({
  columnKey,
  label,
  activeFilter = 'ALL',
  onFilterChange,
  openHeaderFilter,
  setOpenHeaderFilter,
  options,
  align = 'right'
}: ColumnHeaderFilterProps) {
  const isOpen = openHeaderFilter === columnKey;
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpenHeaderFilter(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenHeaderFilter(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setOpenHeaderFilter]);

  const hasFilter = activeFilter && activeFilter !== 'ALL';

  const filteredOptions = options.filter(opt => {
    if (!search.trim()) return true;
    if (opt.value === 'ALL') return true;
    return opt.label.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="th-filter-wrapper" onClick={e => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        className={`th-filter-icon-btn ${hasFilter ? 'has-filter active' : ''}`}
        title={`Filtrar ${label}${hasFilter ? ` (Ativo: ${options.find(o => o.value === activeFilter)?.label || activeFilter})` : ''}`}
        aria-label={`Filtrar ${label}`}
        aria-expanded={isOpen}
        onClick={e => {
          e.stopPropagation();
          setOpenHeaderFilter(isOpen ? null : columnKey);
        }}
      >
        <Filter size={11} />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="th-filter-popover"
          style={{ [align]: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="th-filter-popover-header">
            <span className="th-filter-popover-title">Filtrar {label}</span>
            {hasFilter && (
              <button
                type="button"
                className="th-filter-clear-btn"
                onClick={() => {
                  onFilterChange('ALL');
                  setOpenHeaderFilter(null);
                }}
                title="Limpar filtro"
              >
                Limpar
              </button>
            )}
          </div>

          {options.length > 7 && (
            <div className="th-filter-search-box">
              <Search size={12} className="th-filter-search-icon" />
              <input
                autoFocus
                type="text"
                className="th-filter-search-input"
                placeholder="Buscar opção..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="th-filter-search-clear"
                  onClick={() => setSearch('')}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )}

          <div className="th-filter-popover-list">
            {filteredOptions.length === 0 ? (
              <div className="th-filter-empty">Nenhum resultado</div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = activeFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`th-filter-popover-item ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      onFilterChange(opt.value);
                      setOpenHeaderFilter(null);
                    }}
                  >
                    <span className="th-filter-item-label">
                      <span>{opt.label}</span>
                      {opt.count !== undefined && (
                        <span className="th-filter-count">{opt.count}</span>
                      )}
                    </span>
                    {isSelected && <Check size={12} className="th-filter-check" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Computa dinamicamente as opções com contagem exata e 'Nenhum'
 */
export function computeColumnFilterOptions<T>(
  rows: T[],
  getValue: (row: T) => any,
  config?: {
    allLabel?: string;
    noneLabel?: string;
    customOptionsOrder?: string[];
    valueLabels?: Record<string, string>;
  }
): FilterOption[] {
  const allLabel = config?.allLabel || 'Todos';
  const noneLabel = config?.noneLabel || 'Nenhum';
  const counts = new Map<string, number>();
  let noneCount = 0;

  for (const row of rows) {
    const raw = getValue(row);
    if (raw === null || raw === undefined) {
      noneCount++;
      continue;
    }
    let str = '';
    if (typeof raw === 'object') {
      str = raw.label || raw.status || raw.value || '';
    } else if (typeof raw === 'boolean') {
      str = raw ? 'Sim' : 'Não';
    } else {
      str = String(raw).trim();
    }

    if (!str || str === 'NULL' || str === 'null') {
      noneCount++;
    } else {
      counts.set(str, (counts.get(str) || 0) + 1);
    }
  }

  const result: FilterOption[] = [
    { value: 'ALL', label: allLabel, count: rows.length }
  ];

  // Ordenação
  const sortedKeys = Array.from(counts.keys()).sort((a, b) => {
    if (config?.customOptionsOrder) {
      const idxA = config.customOptionsOrder.indexOf(a);
      const idxB = config.customOptionsOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
    }
    const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
    if (diff !== 0) return diff;
    return a.localeCompare(b, 'pt-BR');
  });

  for (const k of sortedKeys) {
    const customLabel = config?.valueLabels?.[k] || k;
    result.push({
      value: k,
      label: customLabel,
      count: counts.get(k) || 0
    });
  }

  if (noneCount > 0) {
    result.push({
      value: '__NONE__',
      label: noneLabel,
      count: noneCount
    });
  }

  return result;
}

/**
 * Função utilitária para verificar se a linha atende ao filtro da coluna
 */
export function matchColumnFilterValue(cellValue: any, filterVal: string | undefined): boolean {
  if (!filterVal || filterVal === 'ALL') return true;
  let str = '';
  if (cellValue === null || cellValue === undefined) {
    str = '';
  } else if (typeof cellValue === 'object') {
    str = cellValue.label || cellValue.status || cellValue.value || '';
  } else if (typeof cellValue === 'boolean') {
    str = cellValue ? 'Sim' : 'Não';
  } else {
    str = String(cellValue).trim();
  }
  const isNone = !str || str === 'NULL' || str === 'null';
  if (filterVal === '__NONE__') {
    return isNone;
  }
  return str === filterVal;
}

