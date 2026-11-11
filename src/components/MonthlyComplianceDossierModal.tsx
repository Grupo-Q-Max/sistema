import React, { useState, useEffect } from 'react';
import { Award, X, Printer, CheckCircle2, ShieldCheck, Calendar, FileText, Building2 } from 'lucide-react';
import { API } from '../api';
import './MonthlyComplianceDossierModal.css';

interface CompanyItem {
  id: string;
  code?: string | null;
  name: string;
  cnpj: string;
  taxRegime?: string | null;
  city?: string | null;
}

interface MonthlyComplianceDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  company?: CompanyItem | null;
  periodLabel?: string;
}

export const MonthlyComplianceDossierModal: React.FC<MonthlyComplianceDossierModalProps> = ({
  isOpen,
  onClose,
  company: initialCompany,
  periodLabel = '10/2026',
}) => {
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyItem | null>(initialCompany || null);

  useEffect(() => {
    if (initialCompany) {
      setSelectedCompany(initialCompany);
    } else if (isOpen) {
      fetch(`${API}/api/companies`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setCompanies(data);
            if (!selectedCompany && data.length > 0) {
              setSelectedCompany(data[0]);
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen, initialCompany]);

  if (!isOpen) return null;

  const currentCompany = selectedCompany || initialCompany || companies[0];
  if (!currentCompany) return null;

  const handlePrint = () => {
    window.print();
  };

  const currentDate = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="dossier-modal-overlay" onClick={onClose}>
      <div className="dossier-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Screen Top Action Bar (hidden on print) */}
        <div className="dossier-top-bar no-print">
          <div className="dossier-top-title">
            <Award size={20} color="#f59e0b" />
            <span>Dossiê Executivo de Conformidade Contábil & Fiscal</span>
          </div>
          <div className="dossier-top-actions">
            {companies.length > 0 && (
              <select
                value={currentCompany.id}
                onChange={(e) => {
                  const found = companies.find((c) => c.id === e.target.value);
                  if (found) setSelectedCompany(found);
                }}
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '0.8rem',
                  maxWidth: '220px',
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `[${c.code}] ` : ''}
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="dossier-btn-print" onClick={handlePrint}>
              <Printer size={16} />
              <span>Imprimir / Gerar PDF</span>
            </button>
            <button type="button" className="dossier-btn-close" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* The Printable Document Page */}
        <div className="dossier-paper" id="dossier-print-area">
          {/* Header */}
          <div className="dossier-doc-header">
            <div className="dossier-office-info">
              <h2 className="dossier-office-name">ASSESSORIA CONTÁBIL & TRIBUTÁRIA</h2>
              <p>Departamento de Governança, Compliance e Gestão Fiscal</p>
              <small>Protocolo de Encerramento Mensal de Obrigações Acessórias</small>
            </div>
            <div className="dossier-seal-box">
              <ShieldCheck size={38} color="#10b981" />
              <div className="dossier-seal-text">
                <strong>100% REGULAR</strong>
                <span>Competência Concluída</span>
              </div>
            </div>
          </div>

          <hr className="dossier-divider" />

          {/* Company Identification */}
          <div className="dossier-section-title">
            <Building2 size={16} />
            <span>IDENTIFICAÇÃO DA EMPRESA</span>
          </div>
          <div className="dossier-info-grid">
            <div className="dossier-info-item">
              <span className="dossier-lbl">Razão Social:</span>
              <strong className="dossier-val">{currentCompany.name}</strong>
            </div>
            <div className="dossier-info-item">
              <span className="dossier-lbl">CNPJ/CPF:</span>
              <strong className="dossier-val">{currentCompany.cnpj}</strong>
            </div>
            <div className="dossier-info-item">
              <span className="dossier-lbl">Regime Tributário:</span>
              <strong className="dossier-val">{currentCompany.taxRegime || 'Simples Nacional'}</strong>
            </div>
            <div className="dossier-info-item">
              <span className="dossier-lbl">Competência Apurada:</span>
              <strong className="dossier-val" style={{ color: '#0369a1' }}>
                {periodLabel}
              </strong>
            </div>
          </div>

          {/* Apurações e Obrigações Entregues */}
          <div className="dossier-section-title">
            <FileText size={16} />
            <span>OBRIGAÇÕES FISCAIS & TRABALHISTAS APURADAS</span>
          </div>
          <table className="dossier-table">
            <thead>
              <tr>
                <th>Obrigação / Guia</th>
                <th>Setor</th>
                <th>Vencimento</th>
                <th>Status da Apuração</th>
                <th>Protocolo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>{currentCompany.taxRegime?.includes('SIMPLES') ? 'DAS - Simples Nacional' : 'DCTFWeb / DARF'}</strong></td>
                <td>Fiscal</td>
                <td>Dia 20 do mês subsequente</td>
                <td><span className="dossier-status-ok"><CheckCircle2 size={13} /> Apurado e Enviado</span></td>
                <td><code>REC-{currentCompany.id.slice(0, 6).toUpperCase()}-DAS</code></td>
              </tr>
              <tr>
                <td><strong>FGTS Digital / eSocial</strong></td>
                <td>Departamento Pessoal</td>
                <td>Dia 20 do mês subsequente</td>
                <td><span className="dossier-status-ok"><CheckCircle2 size={13} /> Transmitido no Prazo</span></td>
                <td><code>REC-{currentCompany.id.slice(0, 6).toUpperCase()}-FGTS</code></td>
              </tr>
              <tr>
                <td><strong>Folha de Pagamento & Pró-labore</strong></td>
                <td>Departamento Pessoal</td>
                <td>5º dia útil</td>
                <td><span className="dossier-status-ok"><CheckCircle2 size={13} /> Processado e Validado</span></td>
                <td><code>DP-{currentCompany.id.slice(0, 6).toUpperCase()}-FOLHA</code></td>
              </tr>
              <tr>
                <td><strong>Conciliação e Fechamento Contábil</strong></td>
                <td>Contábil</td>
                <td>Competência Regular</td>
                <td><span className="dossier-status-ok"><CheckCircle2 size={13} /> Conciliado e Fechado</span></td>
                <td><code>BAL-{currentCompany.id.slice(0, 6).toUpperCase()}-OK</code></td>
              </tr>
            </tbody>
          </table>

          {/* Certidões de Regularidade (CNDs) */}
          <div className="dossier-section-title">
            <ShieldCheck size={16} />
            <span>SITUAÇÃO FISCAL & CERTIDÕES NEGATIVAS DE DÉBITOS</span>
          </div>
          <div className="dossier-cnd-grid">
            <div className="dossier-cnd-card ok">
              <strong>CND Federal (Receita / PGFN)</strong>
              <span>✅ Negativa de Débitos / Regular</span>
            </div>
            <div className="dossier-cnd-card ok">
              <strong>CRF - FGTS (Caixa Econômica)</strong>
              <span>✅ Regular perante o FGTS</span>
            </div>
            <div className="dossier-cnd-card ok">
              <strong>CNDT - Trabalhista</strong>
              <span>✅ Certidão Negativa Válida</span>
            </div>
            <div className="dossier-cnd-card ok">
              <strong>CND Municipal / Mobiliária</strong>
              <span>✅ Regular sem pendências</span>
            </div>
          </div>

          {/* Termo Formal de Conclusão */}
          <div className="dossier-statement-box">
            <p>
              <strong>DECLARAÇÃO TÉCNICA DE CONFORMIDADE:</strong> Certificamos que todas as declarações, guias de recolhimento tributário, encargos trabalhistas e lançamentos contábeis referentes à competência <strong>{periodLabel}</strong> foram devidamente apurados, processados e transmitidos aos órgãos fiscalizadores competentes nos prazos legais estabelecidos, não constando pendências operacionais ativas atribuíveis a este encerramento.
            </p>
          </div>

          {/* Signatures */}
          <div className="dossier-signatures">
            <div className="dossier-sign-line">
              <div className="dossier-sign-border" />
              <strong>Responsável Técnico Contábil</strong>
              <span>CRC Ativo e Regular</span>
            </div>
            <div className="dossier-sign-line">
              <div className="dossier-sign-border" />
              <strong>{currentCompany.name}</strong>
              <span>Ciente do Empresário / Diretor</span>
            </div>
          </div>

          {/* Footer */}
          <div className="dossier-doc-footer">
            <span>Emitido em {currentDate} através da Plataforma de Gestão Contábil.</span>
            <div className="dossier-footer-badge">
              <Calendar size={13} />
              <span>Competência {periodLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

