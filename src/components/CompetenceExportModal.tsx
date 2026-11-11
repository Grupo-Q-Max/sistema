import { useState } from 'react';
import { Download, X, FileSpreadsheet, CheckCircle, ShieldCheck } from 'lucide-react';
import { API } from '../api';
import './CompetenceExportModal.css';

interface CompetenceExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CompetenceExportModal({ isOpen, onClose }: CompetenceExportModalProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [exporting, setExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen) return null;

  const handleDownloadCsv = async () => {
    setExporting(true);
    setDownloadSuccess(false);
    try {
      const res = await fetch(`${API}/api/competence/consolidated-export?year=${year}&month=${month}`);
      const json = await res.json();
      const rows = json.rows || [];

      // Montar CSV com cabeçalho limpo
      const headers = [
        'Código',
        'Razão Social',
        'CNPJ',
        'Regime Tributário',
        'Status Fiscal',
        'Progresso Fiscal (%)',
        'Status Folha',
        'Progresso Folha (%)',
        'Situação Financeira',
        'Docs Notas Fiscais',
        'Docs Extrato Bancário',
        'Docs Ponto/Folha',
        'Atraso Culpa do Cliente',
      ];

      const csvContent = [
        headers.join(';'),
        ...rows.map((r: any) =>
          [
            `"${r.code}"`,
            `"${r.name.replace(/"/g, '""')}"`,
            `"${r.cnpj}"`,
            `"${r.taxRegime}"`,
            `"${r.fiscalStatus}"`,
            r.fiscalProgress,
            `"${r.payrollStatus}"`,
            r.payrollProgress,
            `"${r.financialStatus}"`,
            `"${r.docsFiscal}"`,
            `"${r.docsBank}"`,
            `"${r.docsPayroll}"`,
            `"${r.clientBlamed}"`,
          ].join(';')
        ),
      ].join('\r\n');

      // Adicionar BOM UTF-8 (\uFEFF) para abrir com acentuação perfeita no Excel
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `fechamento_consolidado_${year}_${String(month).padStart(2, '0')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadSuccess(true);
    } catch (err) {
      console.error('Erro ao baixar exportação:', err);
      alert('Erro ao gerar exportação.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-overlay" onClick={onClose}>
      <div className="export-card" onClick={e => e.stopPropagation()}>
        <div className="export-header">
          <div className="export-title-group">
            <Download className="export-icon" />
            <div>
              <h2 className="export-title">Central de Exportação Consolidada</h2>
              <div className="export-subtitle">
                Exportação completa de Fiscal, Folha, Financeiro e Auditoria para Excel
              </div>
            </div>
          </div>
          <button className="export-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="export-content">
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileSpreadsheet size={18} color="#10b981" />
              Selecione o Mês e Ano de Referência
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem' }}>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                style={{
                  background: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>Mês {String(m).padStart(2, '0')}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                style={{
                  background: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
              >
                {[2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
              <ShieldCheck size={16} color="#38bdf8" />
              <span>
                O arquivo gerado é compatível diretamente com o Microsoft Excel, LibreOffice e Google Planilhas.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  padding: '0.55rem 1.25rem',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={handleDownloadCsv}
                style={{
                  background: '#10b981',
                  border: 'none',
                  color: '#ffffff',
                  padding: '0.55rem 1.5rem',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: exporting ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Download size={16} />
                <span>{exporting ? 'Gerando Planilha...' : 'Baixar Arquivo Completo (.CSV)'}</span>
              </button>
            </div>
          </div>

          {downloadSuccess && (
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.8125rem', fontWeight: 600 }}>
              <CheckCircle size={16} />
              <span>Download concluído com sucesso! O arquivo já está na sua pasta de Downloads.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
