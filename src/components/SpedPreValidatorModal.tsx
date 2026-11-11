import React, { useState, useEffect } from 'react';
import {
  FileCode,
  X,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { API } from '../api';
import './SpedPreValidatorModal.css';

interface SpedPreValidatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies?: Array<{
    id: string;
    code?: string | null;
    name: string;
    cnpj: string;
  }>;
}

interface SpedHeaderData {
  layoutVersion: string;
  purpose: string; // 0 = Original, 1 = Retificador
  periodStart: string;
  periodEnd: string;
  companyName: string;
  cnpj: string;
  uf: string;
  ie: string;
  cityCode: string;
  totalLines: number;
  spedType: 'SPED_FISCAL' | 'SPED_CONTRIBUICOES' | 'ECD_ECF' | 'OUTRO';
}

export const SpedPreValidatorModal: React.FC<SpedPreValidatorModalProps> = ({
  isOpen,
  onClose,
  companies: initialCompanies = [],
}) => {
  const [localCompanies, setLocalCompanies] = useState<any[]>(initialCompanies);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [headerData, setHeaderData] = useState<SpedHeaderData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCompanies.length > 0) {
      setLocalCompanies(initialCompanies);
    } else if (isOpen) {
      fetch(`${API}/api/companies`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setLocalCompanies(data);
        })
        .catch(() => {});
    }
  }, [isOpen, initialCompanies]);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const parseBrDateFromSped = (str: string) => {
    if (!str || str.length !== 8) return str;
    const d = str.slice(0, 2);
    const m = str.slice(2, 4);
    const y = str.slice(4, 8);
    return `${d}/${m}/${y}`;
  };

  const processFile = (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setHeaderData(null);
    setParsing(true);

    const reader = new FileReader();

    // Lê os primeiros 64KB do arquivo para extrair o registro |0000|
    const slice = selectedFile.slice(0, 65536);
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error('Não foi possível ler o arquivo.');

        const lines = text.split(/\r?\n/);
        const headerLine = lines.find((l) => l.startsWith('|0000|'));

        if (!headerLine) {
          throw new Error('Registro de abertura |0000| não encontrado. Verifique se o arquivo é um SPED válido.');
        }

        const fields = headerLine.split('|');
        // Layout padrão SPED Fiscal / Contribuições:
        // |0000|COD_VER|COD_FIN|DT_INI|DT_FIN|NOME|CNPJ|UF|IE|COD_MUN|IM|SUFRAMA|IND_PERFIL|IND_ATIV|
        const layoutVersion = fields[2] || '';
        const purposeCode = fields[3] || '0';
        const purpose = purposeCode === '1' ? 'Retificadora (Substitutivo)' : 'Original';
        const periodStart = parseBrDateFromSped(fields[4] || '');
        const periodEnd = parseBrDateFromSped(fields[5] || '');
        const compName = fields[6] || '';
        const rawCnpj = fields[7] || '';
        const uf = fields[8] || '';
        const ie = fields[9] || '';
        const cityCode = fields[10] || '';

        // Tenta detectar tipo de SPED
        let spedType: SpedHeaderData['spedType'] = 'SPED_FISCAL';
        if (text.includes('|0110|') || text.includes('|M200|') || text.includes('|M600|')) {
          spedType = 'SPED_CONTRIBUICOES';
        } else if (text.includes('|C100|') || text.includes('|E110|')) {
          spedType = 'SPED_FISCAL';
        }

        setHeaderData({
          layoutVersion,
          purpose,
          periodStart,
          periodEnd,
          companyName: compName,
          cnpj: rawCnpj.replace(/\D/g, ''),
          uf,
          ie,
          cityCode,
          totalLines: 0,
          spedType,
        });
      } catch (err: any) {
        setError(err.message || 'Erro ao processar o arquivo SPED.');
      } finally {
        setParsing(false);
      }
    };

    reader.onerror = () => {
      setError('Falha ao ler o arquivo no navegador.');
      setParsing(false);
    };

    reader.readAsText(slice, 'latin1'); // SPED usa ISO-8859-1 / Latin1
  };

  const selectedCompany = localCompanies.find((c) => c.id === selectedCompanyId);
  const cleanSelectedCnpj = selectedCompany ? selectedCompany.cnpj.replace(/\D/g, '') : null;
  const isCnpjMatch = headerData && cleanSelectedCnpj ? headerData.cnpj === cleanSelectedCnpj : null;

  return (
    <div className="sped-modal-overlay" onClick={onClose}>
      <div className="sped-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sped-modal-header">
          <div className="sped-title-wrap">
            <div className="sped-icon-box">
              <FileCode size={22} color="#38bdf8" />
            </div>
            <div>
              <h3>Pré-Validador Express de SPED & EFD (.txt)</h3>
              <p>Conferência instantânea de CNPJ, período e finalidade antes de abrir o PVA</p>
            </div>
          </div>
          <button className="sped-btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="sped-modal-body">
          {/* Seletor de Empresa para Cruzamento */}
          <div className="sped-comp-select-wrap">
            <label>Comparar com o Cadastro da Empresa (Opcional):</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
            >
              <option value="">Selecione uma empresa para conferir o CNPJ...</option>
              {localCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `[${c.code}] ` : ''}{c.name} ({c.cnpj})
                </option>
              ))}
            </select>
          </div>

          {/* Dropzone */}
          <div
            className="sped-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
          >
            <input
              type="file"
              accept=".txt"
              id="sped-file-input"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <label htmlFor="sped-file-input" className="sped-dropzone-label">
              <div className="sped-upload-icon">
                <Upload size={24} color="#38bdf8" />
              </div>
              <strong>Clique ou arraste o arquivo .txt do SPED aqui</strong>
              <span>SPED Fiscal (EFD ICMS/IPI) ou SPED Contribuições (PIS/COFINS)</span>
            </label>
            {file && (
              <div className="sped-file-loaded">
                <FileText size={15} color="#34d399" />
                <span>
                  Arquivo carregado: <strong>{file.name}</strong> ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
            )}
          </div>

          {parsing && (
            <div className="sped-parsing-msg">
              <Sparkles size={16} className="spin" color="#38bdf8" />
              <span>Analisando estrutura dos registros do arquivo...</span>
            </div>
          )}

          {error && (
            <div className="sped-alert sped-alert-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Resultado da Leitura do Cabeçalho |0000| */}
          {headerData && (
            <div className="sped-results-card">
              <div className="sped-results-header">
                <div className="sped-results-title">
                  <CheckCircle2 size={18} color="#10b981" />
                  <strong>Cabeçalho |0000| Identificado com Sucesso</strong>
                </div>
                <span className="sped-type-badge">
                  {headerData.spedType === 'SPED_FISCAL' ? 'SPED Fiscal (ICMS/IPI)' : 'SPED Contribuições'}
                </span>
              </div>

              {/* Status do Cruzamento de CNPJ */}
              {selectedCompany && (
                <div
                  className={`sped-cross-banner ${
                    isCnpjMatch ? 'match-ok' : 'match-error'
                  }`}
                >
                  {isCnpjMatch ? (
                    <>
                      <CheckCircle2 size={18} />
                      <span>
                        <strong>CNPJ Compatível!</strong> O CNPJ do arquivo corresponde à empresa selecionada (<strong>{selectedCompany.name}</strong>).
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={18} />
                      <span>
                        <strong>ALERTA DE INCONSISTÊNCIA:</strong> O CNPJ do arquivo ({headerData.cnpj}) NÃO confere com o da empresa selecionada ({cleanSelectedCnpj})!
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="sped-grid-data">
                <div className="sped-item">
                  <span className="sped-lbl">Razão Social Informada:</span>
                  <strong className="sped-val">{headerData.companyName || 'Não informada'}</strong>
                </div>

                <div className="sped-item">
                  <span className="sped-lbl">CNPJ no Arquivo:</span>
                  <strong className="sped-val">{headerData.cnpj}</strong>
                </div>

                <div className="sped-item">
                  <span className="sped-lbl">Período da Escrituração:</span>
                  <strong className="sped-val">
                    {headerData.periodStart} até {headerData.periodEnd}
                  </strong>
                </div>

                <div className="sped-item">
                  <span className="sped-lbl">Finalidade da Remessa:</span>
                  <strong
                    className="sped-val"
                    style={{ color: headerData.purpose.includes('Retificadora') ? '#f59e0b' : '#34d399' }}
                  >
                    {headerData.purpose}
                  </strong>
                </div>

                <div className="sped-item">
                  <span className="sped-lbl">UF / Inscrição Estadual:</span>
                  <strong className="sped-val">
                    {headerData.uf} - {headerData.ie || 'Isento / Não informada'}
                  </strong>
                </div>

                <div className="sped-item">
                  <span className="sped-lbl">Versão do Leiaute (COD_VER):</span>
                  <strong className="sped-val">{headerData.layoutVersion}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sped-modal-footer">
          <small className="sped-footer-tip">
            ⚡ A validação expressa ocorre 100% no seu navegador sem consumir tráfego ou upload para servidores externos.
          </small>
          <button type="button" className="sped-btn-done" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
