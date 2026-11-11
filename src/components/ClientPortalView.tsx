import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, ShieldCheck, AlertCircle, FileText, Upload, FolderUp, Check, FileCheck } from 'lucide-react';
import { API } from '../api';
import './ClientPortalView.css';

interface ClientPortalViewProps {
  token: string;
}

export function ClientPortalView({ token }: ClientPortalViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<any[]>([]);
  const [uploadCategory, setUploadCategory] = useState<'bank' | 'fiscal' | 'payroll' | 'other'>('bank');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchUploads = () => {
    fetch(`${API}/api/client-portal/${token}/uploads`)
      .then((res) => res.json())
      .then((list) => {
        if (Array.isArray(list)) setUploads(list);
      })
      .catch(() => {});
  };

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/client-portal/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('Link expirado ou token inválido');
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
        fetchUploads();
      })
      .catch((err) => {
        setError(err.message || 'Erro ao carregar portal do cliente');
        setLoading(false);
      });
  }, [token]);

  const handleSendFile = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadSuccess(null);
    try {
      const res = await fetch(`${API}/api/client-portal/${token}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: uploadCategory,
          fileSize: `${(selectedFile.size / 1024).toFixed(1)} KB`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao enviar arquivo');
      setUploadSuccess(`Arquivo '${selectedFile.name}' recebido com sucesso pela contabilidade!`);
      setSelectedFile(null);
      fetchUploads();
    } catch (e: any) {
      alert(e.message || 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#090d16', color: '#94a3b8', gap: '1rem' }}>
        <div style={{ fontSize: '2rem' }}>⏳</div>
        <span style={{ fontSize: '0.875rem' }}>Carregando dados seguros da sua empresa...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#090d16', color: '#f8fafc', padding: '1.5rem', textAlign: 'center' }}>
        <AlertCircle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Link Indisponível ou Expirado</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', maxWidth: '400px' }}>
          Este link seguro de consulta não foi encontrado. Favor solicitar um novo link de acesso à equipe de contabilidade.
        </p>
      </div>
    );
  }

  const { company, period, closingStatus, guides, certificates, announcement } = data;

  return (
    <div className="client-portal-wrapper">
      <header className="client-portal-header">
        <div className="client-portal-logo">
          Área do Cliente · <span>Fechamento Pro</span>
        </div>
        <div style={{ fontSize: '0.8125rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={16} color="#10b981" />
          <span>Ambiente Seguro & Autenticado</span>
        </div>
      </header>

      <main className="client-portal-container">
        {/* Card da Empresa */}
        <div className="client-portal-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
              Competência em Aberto: {period.label}
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 4px 0', color: '#f8fafc' }}>
              {company.name}
            </h1>
            <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
              CNPJ: <code>{company.cnpj || '-'}</code> · Regime: {company.taxRegime || 'Não informado'}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Situação do Fechamento</span>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: closingStatus.fiscal === 'COMPLETED' ? '#10b981' : '#38bdf8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {closingStatus.fiscal === 'COMPLETED' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
              {closingStatus.fiscal === 'COMPLETED' ? 'Obrigações Concluídas' : 'Apuração em Andamento'}
            </div>
          </div>
        </div>

        {/* Envio de Documentos (Dropzone do Cliente) */}
        <div className="client-portal-card">
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderUp size={20} color="#a855f7" />
            <span>Envio de Documentos da Competência ({period.label})</span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
            Envie seus extratos, relatórios de vendas ou cartões de ponto diretamente para o escritório contábil.
          </p>

          {uploadSuccess && (
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', padding: '10px 14px', color: '#6ee7b7', fontSize: '0.8125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Check size={16} />
              <span>{uploadSuccess}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={uploadCategory}
                onChange={e => setUploadCategory(e.target.value as any)}
                style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', padding: '0.55rem 0.8rem', fontSize: '0.8125rem', outline: 'none' }}
              >
                <option value="bank">Extrato Bancário (OFX / PDF)</option>
                <option value="fiscal">Notas Fiscais / XMLs / Vendas</option>
                <option value="payroll">Cartão Ponto / Folha / Recibos</option>
                <option value="other">Outros Comprovantes</option>
              </select>

              <label style={{ background: '#1e293b', border: '1px dashed #38bdf8', color: '#38bdf8', borderRadius: '8px', padding: '0.55rem 1rem', fontSize: '0.8125rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Upload size={14} />
                <span>{selectedFile ? selectedFile.name : 'Escolher Arquivo...'}</span>
                <input
                  type="file"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]); }}
                />
              </label>
            </div>

            <button
              type="button"
              disabled={!selectedFile || uploading}
              onClick={handleSendFile}
              style={{
                background: selectedFile ? 'linear-gradient(135deg, #a855f7, #7e22ce)' : '#334155',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.6rem 1.2rem',
                fontSize: '0.8125rem',
                fontWeight: 700,
                cursor: selectedFile && !uploading ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FileCheck size={16} />
              <span>{uploading ? 'Enviando...' : 'Entregar à Contabilidade'}</span>
            </button>
          </div>

          {/* Histórico de Arquivos Enviados */}
          {uploads.length > 0 && (
            <div style={{ marginTop: '1.25rem', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                Arquivos Entregues nesta Competência:
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                {uploads.map((u: any) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', padding: '8px 12px', borderRadius: '6px', fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={14} color="#38bdf8" />
                      <strong style={{ color: '#f8fafc' }}>{u.fileName}</strong>
                      <span style={{ color: '#64748b' }}>({u.fileSize})</span>
                    </div>
                    <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                      <CheckCircle2 size={13} /> Recebido em {new Date(u.uploadedAt).toLocaleDateString('pt-BR')} às {new Date(u.uploadedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Guias de Pagamento e Tributos */}
        <div className="client-portal-card">
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="#38bdf8" />
            <span>Guias & Impostos do Mês</span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
            Acompanhe a emissão das guias e tributos para quitação antes do vencimento.
          </p>

          <div>
            {guides.map((g: any, idx: number) => {
              const isReady = g.status === 'DISPONIVEL';

              return (
                <div key={idx} className="client-portal-guide-item">
                  <div>
                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.95rem' }}>{g.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                      Vencimento: <strong>{g.dueDate}</strong>
                    </div>
                  </div>

                  <div>
                    {isReady ? (
                      <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={14} /> Guia Emitida
                      </span>
                    ) : (
                      <span style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} /> Em Apuração
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Certidões de Regularidade Fiscal (CNDs) */}
        <div className="client-portal-card">
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} color="#10b981" />
            <span>Regularidade Fiscal & Certidões (CNDs)</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>RECEITA FEDERAL / PGFN</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                {certificates.federal === 'REGULAR' ? '✓ Regular' : 'Em Análise'}
              </div>
            </div>

            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>FGTS / CAIXA</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                {certificates.fgts === 'REGULAR' ? '✓ Regular' : 'Em Análise'}
              </div>
            </div>

            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>TRABALHISTA (CNDT)</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                {certificates.trabalhista === 'REGULAR' ? '✓ Regular' : 'Em Análise'}
              </div>
            </div>
          </div>
        </div>

        {/* Comunicados do Escritório */}
        {announcement && (
          <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '12px', padding: '1.25rem', fontSize: '0.8125rem', color: '#cbd5e1' }}>
            <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '0.25rem' }}>
              📢 Mensagem da Contabilidade:
            </div>
            <span>{announcement}</span>
          </div>
        )}
      </main>
    </div>
  );
}
