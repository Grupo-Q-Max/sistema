import { useEffect, useState } from 'react';
import { Printer, X, FileSpreadsheet } from 'lucide-react';
import { API } from '../api';
import './ExecutiveReportModal.css';

export interface ExecutiveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  month: number;
}

export function ExecutiveReportModal({ isOpen, onClose, year, month }: ExecutiveReportModalProps) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`${API}/api/dashboard?year=${year}&month=${month}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStats(data))
      .catch(() => {});
  }, [isOpen, year, month]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const monthCode = `${String(month + 1).padStart(2, '0')}/${year}`;
  const nowFormatted = new Date().toLocaleString('pt-BR');
  const progressList = stats?.progress || [];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="report-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="report-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Barra superior de ações na tela */}
        <div className="report-screen-header no-print">
          <div className="report-screen-title">
            <FileSpreadsheet size={20} />
            <span>Relatório Executivo de Fechamento · {monthCode}</span>
          </div>
          <div className="report-screen-actions">
            <button type="button" className="btn-report-print" onClick={handlePrint}>
              <Printer size={16} />
              <span>Imprimir / Salvar em PDF</span>
            </button>
            <button type="button" className="btn-report-close" onClick={onClose} aria-label="Fechar">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Folha do Relatório (Printable Area) */}
        <div className="report-paper">
          {/* Header da Folha */}
          <div className="report-doc-header">
            <div className="report-brand">
              <span className="brand-logo">Fechamento <strong>Pro</strong></span>
              <span className="brand-sub">Sistema de Gestão & Fechamento Contábil</span>
            </div>
            <div className="report-meta">
              <div className="meta-competence">Competência: <strong>{monthCode}</strong></div>
              <div className="meta-generated">Emitido em: {nowFormatted}</div>
            </div>
          </div>

          <div className="report-divider" />

          {/* Resumo Executivo em Cards */}
          <div className="report-kpi-grid">
            <div className="report-kpi-card">
              <span className="kpi-label">Total de Empresas Ativas</span>
              <span className="kpi-value">{stats?.totalActive || 0}</span>
            </div>
            <div className="report-kpi-card">
              <span className="kpi-label">Funcionários em Carteira</span>
              <span className="kpi-value">{stats?.totalEmployees || 0}</span>
            </div>
            <div className="report-kpi-card highlight">
              <span className="kpi-label">Média de Conclusão Geral</span>
              <span className="kpi-value">
                {progressList.length > 0
                  ? Math.round(progressList.reduce((acc: number, p: any) => acc + (p.percent || 0), 0) / progressList.length)
                  : 0}%
              </span>
            </div>
          </div>

          {/* Progresso Detalhado por Setor */}
          <div className="report-section-title">
            <span>1. Status de Entregas por Setor</span>
          </div>

          <table className="report-table">
            <thead>
              <tr>
                <th>Setor</th>
                <th style={{ textAlign: 'center' }}>Total</th>
                <th style={{ textAlign: 'center' }}>Concluídos</th>
                <th style={{ textAlign: 'center' }}>Em Andamento</th>
                <th style={{ textAlign: 'center' }}>Pendentes</th>
                <th style={{ textAlign: 'right' }}>Taxa de Entrega</th>
              </tr>
            </thead>
            <tbody>
              {progressList.map((p: any, idx: number) => {
                const sectorLabels: Record<string, string> = {
                  FISCAL: 'Setor Fiscal',
                  DP: 'Departamento Pessoal (DP)',
                  CONTABIL: 'Contábil & Balanços',
                  CUSHMAN: 'Cushman & Facilities',
                  PARCELAMENTO: 'Parcelamentos Federais/Estaduais',
                };
                return (
                  <tr key={idx}>
                    <td><strong>{sectorLabels[p.type] || p.type}</strong></td>
                    <td style={{ textAlign: 'center' }}>{p.total}</td>
                    <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{p.completed}</td>
                    <td style={{ textAlign: 'center', color: '#2563eb' }}>{p.inProgress}</td>
                    <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 600 }}>{p.pending}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="report-pct-badge">{p.percent}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Distribuição por Regime Tributário */}
          <div className="report-section-title" style={{ marginTop: '24px' }}>
            <span>2. Empresas Ativas por Regime Tributário</span>
          </div>

          <div className="report-regimes-summary">
            {Object.entries(stats?.regimes || {}).map(([key, count]: any) => (
              <div key={key} className="report-regime-item">
                <span className="regime-name">{key.replace(/_/g, ' ')}</span>
                <span className="regime-count">{count}</span>
              </div>
            ))}
          </div>

          {/* Assinatura e Encerramento */}
          <div className="report-doc-footer">
            <div className="sign-block">
              <div className="sign-line" />
              <span>Responsável Técnico / Contabilidade</span>
            </div>
            <div className="sign-block">
              <div className="sign-line" />
              <span>Diretoria / Sócios</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
