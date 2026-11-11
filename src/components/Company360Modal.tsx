import { useEffect, useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  X,
  FileText,
  Users,
  ShieldCheck,
  TrendingUp,
  ExternalLink,
  Award,
  Calculator,
} from 'lucide-react';
import { API } from '../api';
import type { CurrentUser } from '../types/auth';
import { formatFlexibleDateBr } from '../config/dateUtils';
import { CompanyDeliveryReportModal } from './CompanyDeliveryReportModal';
import { TaxSimulatorModal } from './TaxSimulatorModal';
import './Company360Modal.css';

export interface Company360ModalProps {
  companyId: string | null;
  onClose: () => void;
  onNavigateToCompany?: (companyId: string) => void;
  onNavigateToSector?: (sector: string, companyId: string) => void;
  currentUser?: CurrentUser | null;
}

export function Company360Modal({
  companyId,
  onClose,
  onNavigateToCompany,
  onNavigateToSector,
  currentUser,
}: Company360ModalProps) {
  const isPrivileged = currentUser?.role === 'ADMIN' || currentUser?.role === 'SOCIO';
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [isTaxSimOpen, setIsTaxSimOpen] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let isCurrent = true;
    setLoading(true);

    fetch(`${API}/api/companies/${companyId}/history-360?year=${year}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((resData) => {
        if (isCurrent && resData) setData(resData);
      })
      .catch((err) => console.error('Erro ao carregar Raio-X 360:', err))
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [companyId, year]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!companyId) return null;

  const company = data?.company;
  const complianceRate = data?.complianceRate ?? 100;
  const months = data?.months || [];

  return (
    <div className="company-360-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="company-360-panel" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="company-360-header">
          <div className="c360-header-info">
            <div className="c360-brand-icon">
              <Building2 size={24} />
            </div>
            <div>
              <div className="c360-title-line">
                <span className="c360-code-badge">{company?.code || 'S/C'}</span>
                <h3>{company?.name || 'Carregando empresa...'}</h3>
                {company?.taxRegime && <span className="c360-regime-pill">{company.taxRegime}</span>}
              </div>
              <p className="c360-subtitle">
                CNPJ: <code>{company?.cnpj || '-'}</code> · Cidade: {company?.city || 'Não informada'} {company?.groupName ? `· Grupo: ${company.groupName}` : ''}
              </p>
            </div>
          </div>

          <div className="c360-header-actions">
            <button
              type="button"
              onClick={() => setIsTaxSimOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#3b82f6',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
              title="Comparador Tributário (Simples vs Presumido vs Real)"
            >
              <Calculator size={15} />
              <span>Simulador Tributário</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDeliveryModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#10b981',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <Award size={15} />
              <span>Extrato do Cliente</span>
            </button>

            <div className="c360-year-select">
              <Calendar size={14} />
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                <option value={currentYear + 1}>{currentYear + 1}</option>
                <option value={currentYear}>{currentYear}</option>
                <option value={currentYear - 1}>{currentYear - 1}</option>
                <option value={currentYear - 2}>{currentYear - 2}</option>
              </select>
            </div>

            <button type="button" className="c360-close-btn" onClick={onClose} aria-label="Fechar">
              <X size={20} />
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="c360-loading">
            <div className="animate-spin-fast">⏳</div>
            <span>Carregando Raio-X Histórico Anual...</span>
          </div>
        ) : (
          <div className="company-360-body">
            {/* KPI METRICS BAR */}
            <div className="c360-kpis-grid">
              <div className="c360-kpi-card">
                <span className="c360-kpi-label">Índice de Conformidade Anual</span>
                <div className="c360-kpi-val-row">
                  <span className={`c360-kpi-val ${complianceRate >= 85 ? 'good' : complianceRate >= 65 ? 'warning' : 'bad'}`}>
                    {complianceRate}%
                  </span>
                  <TrendingUp size={18} className={complianceRate >= 85 ? 'text-emerald' : 'text-amber'} />
                </div>
                <span className="c360-kpi-sub">{data?.totalCompletedClosings} de {data?.totalExpectedClosings} fechamentos entregues</span>
              </div>

              <div className="c360-kpi-card">
                <span className="c360-kpi-label">Certificado Digital</span>
                <div className="c360-kpi-val-row">
                  <span className="c360-kpi-val small">
                    {company?.hasClientCertificate ? (company.certificateType || 'A1') : 'Não possui'}
                  </span>
                  <ShieldCheck size={18} className={company?.hasClientCertificate ? 'text-emerald' : 'text-slate'} />
                </div>
                <span className="c360-kpi-sub">
                  {company?.certificateExpiration ? `Validade: ${formatFlexibleDateBr(company.certificateExpiration)}` : 'Sem data de validade'}
                </span>
              </div>

              {isPrivileged && (
                <div className="c360-kpi-card">
                  <span className="c360-kpi-label">Equipe Responsável</span>
                  <div className="c360-resp-chips">
                    {company?.responsibles?.length === 0 ? (
                      <span className="text-muted">Nenhum definido</span>
                    ) : (
                      company?.responsibles?.map((r: any, i: number) => (
                        <span key={i} className="c360-resp-tag">
                          <strong>{r.sector}:</strong> {r.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* TABELA / GRADE DOS 12 MESES */}
            <div className="c360-timeline-section">
              <h4 className="c360-section-title">
                <Calendar size={16} /> Linha do Tempo de Entregas · Exercício {year}
              </h4>

              <div className="c360-table-wrapper">
                <table className="c360-timeline-table">
                  <thead>
                    <tr>
                      <th>COMPETÊNCIA</th>
                      <th>SETOR FISCAL</th>
                      <th>DEPARTAMENTO PESSOAL</th>
                      <th>CONTÁBIL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m: any) => {
                      const fiscal = m.sectors.fiscal;
                      const dp = m.sectors.dp;
                      const contabil = m.sectors.contabil;

                      const renderStatus = (sectorObj: any, sectorName: string) => {
                        if (!sectorObj) {
                          return <span className="c360-badge na">Sem fechamento</span>;
                        }
                        if (sectorObj.status === 'COMPLETED') {
                          return (
                            <span className="c360-badge completed" title="Concluído">
                              <CheckCircle2 size={12} />
                              Concluído
                            </span>
                          );
                        }
                        if (sectorObj.status === 'IN_PROGRESS') {
                          return (
                            <span className="c360-badge in-progress" title="Em Andamento">
                              <Clock size={12} />
                              Em Andamento
                            </span>
                          );
                        }
                        if (sectorObj.status === 'NOT_APPLICABLE') {
                          return <span className="c360-badge na">N/A</span>;
                        }
                        return (
                          <span
                            className="c360-badge pending"
                            style={{ cursor: onNavigateToSector ? 'pointer' : 'default' }}
                            onClick={() => {
                              if (onNavigateToSector) {
                                onNavigateToSector(sectorName.toLowerCase(), company.id);
                                onClose();
                              }
                            }}
                            title={onNavigateToSector ? `Ir para Fechamento de ${sectorName}` : undefined}
                          >
                            Pendente
                          </span>
                        );
                      };

                      return (
                        <tr key={m.month}>
                          <td className="c360-month-cell">
                            <strong>{m.label}</strong>
                            <span>{m.periodStr}</span>
                          </td>
                          <td>{renderStatus(fiscal, 'fiscal')}</td>
                          <td>
                            {renderStatus(dp, 'dp')}
                            {dp?.employees !== undefined && dp.employees > 0 && (
                              <span className="c360-sub-metric" title="Funcionários / Vidas">
                                <Users size={11} /> {dp.employees} vidas
                              </span>
                            )}
                          </td>
                          <td>{renderStatus(contabil, 'contabil')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* OBSERVAÇÕES E NOTAS */}
            {company?.notes && (
              <div className="c360-notes-box">
                <FileText size={16} />
                <div>
                  <strong>Anotação Cadastral:</strong>
                  <p>{company.notes}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FOOTER */}
        <div className="company-360-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          {onNavigateToCompany && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onNavigateToCompany(company.id);
                onClose();
              }}
            >
              <ExternalLink size={15} />
              <span>Abrir Cadastro Completo da Empresa</span>
            </button>
          )}
        </div>
      </div>

      {isDeliveryModalOpen && companyId && (
        <CompanyDeliveryReportModal
          isOpen={isDeliveryModalOpen}
          onClose={() => setIsDeliveryModalOpen(false)}
          companyId={companyId}
          period={`${year}-11-01`}
        />
      )}

      {isTaxSimOpen && (
        <TaxSimulatorModal
          isOpen={isTaxSimOpen}
          onClose={() => setIsTaxSimOpen(false)}
          companyName={company?.name}
          currentRegime={company?.taxRegime || undefined}
        />
      )}
    </div>
  );
}

