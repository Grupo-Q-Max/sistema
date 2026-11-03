import { useState, useEffect, type FormEvent } from 'react';
import { Users, X, Check, AlertCircle, Building2 } from 'lucide-react';
import { API } from '../api';
import { ButtonSpinner } from './LoadingSkeleton';
import type { CurrentUser } from '../types/auth';
import './BulkAssignResponsibleModal.css';

export interface BulkAssignResponsibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCompanyIds: string[];
  companies: Array<{ id: string; name: string; code?: string | null }>;
  users: Array<{ id: string; name: string; email: string; role: string }>;
  onSuccess: (count: number, sectorLabel: string, respName: string) => void;
  currentUser?: CurrentUser | null;
  defaultSector?: string;
}

const SECTOR_OPTIONS = [
  { value: 'FISCAL', label: 'Fiscal' },
  { value: 'DP', label: 'Departamento Pessoal (DP)' },
  { value: 'CONTABIL', label: 'Contábil' },
  { value: '', label: 'Geral (Todos os Setores)' },
];

export function BulkAssignResponsibleModal({
  isOpen,
  onClose,
  selectedCompanyIds,
  companies,
  users,
  onSuccess,
  currentUser,
  defaultSector,
}: BulkAssignResponsibleModalProps) {
  const [sector, setSector] = useState<string>(defaultSector || 'FISCAL');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultSector && isOpen) {
      setSector(defaultSector);
    }
  }, [defaultSector, isOpen]);

  if (!isOpen) return null;

  const selectedCompaniesList = companies.filter((c) => selectedCompanyIds.includes(c.id));

  // Filtra ou ordena usuários de forma conveniente
  const activeUsers = users.filter((u) => u.name || u.email);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedCompanyIds.length === 0) {
      setError('Nenhuma empresa selecionada.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/companies/bulk-responsible`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyIds: selectedCompanyIds,
          sector: sector || null,
          userId: selectedUserId || null,
          actorId: currentUser?.id,
          actorEmail: currentUser?.email,
          actorName: currentUser?.name || currentUser?.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao atribuir responsáveis em massa.');
      }

      const sectorMeta = SECTOR_OPTIONS.find((s) => s.value === sector);
      const targetUser = users.find((u) => u.id === selectedUserId);
      const respName = targetUser ? (targetUser.name || targetUser.email) : 'Nenhum (Desatribuído)';

      onSuccess(selectedCompanyIds.length, sectorMeta?.label || 'Geral', respName);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro inesperado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bulk-assign-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bulk-assign-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bulk-assign-header">
          <div className="bulk-assign-title-group">
            <div className="bulk-assign-icon-box">
              <Users size={20} />
            </div>
            <div>
              <h3>Atribuição em Massa de Responsável</h3>
              <p className="bulk-assign-subtitle">
                Atribua ou troque o responsável de <strong>{selectedCompanyIds.length}</strong> empresa(s) selecionada(s)
              </p>
            </div>
          </div>
          <button type="button" className="bulk-assign-close-btn" onClick={onClose} aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bulk-assign-body">
            {error && (
              <div className="bulk-assign-error">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="bulk-form-group">
              <label htmlFor="bulk-sector-select">Setor Responsável</label>
              <select
                id="bulk-sector-select"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                disabled={submitting}
              >
                {SECTOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="bulk-form-group">
              <label htmlFor="bulk-user-select">Novo Colaborador Responsável</label>
              <select
                id="bulk-user-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={submitting}
              >
                <option value="">❌ Nenhum / Remover Responsável do Setor</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="bulk-companies-preview">
              <div className="preview-header">
                <span>Empresas que serão atualizadas:</span>
                <span className="preview-badge">{selectedCompanyIds.length}</span>
              </div>
              <div className="preview-scroll-list">
                {selectedCompaniesList.map((c) => (
                  <div key={c.id} className="preview-company-chip">
                    <Building2 size={12} />
                    {c.code && <span className="preview-code">{c.code}</span>}
                    <span className="preview-name">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bulk-assign-footer">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-confirm" disabled={submitting}>
              {submitting ? (
                <>
                  <ButtonSpinner />
                  <span>Aplicando...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Confirmar Atribuição ({selectedCompanyIds.length})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
