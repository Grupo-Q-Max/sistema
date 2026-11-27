import { useEffect, useState } from 'react';
import { Building2, AlertTriangle, Copy, Eye, EyeOff, ExternalLink, CheckCircle2 } from 'lucide-react';
import { formatCompanyCode } from '../utils/codeSort';
import { formatFlexibleDateBr, getCertificateExpirationStatus } from '../config/dateUtils';
import './Closings.css';

export function formatDateBr(dateVal?: string | Date | null): string {
  if (!dateVal) return '-';
  const formatted = formatFlexibleDateBr(dateVal, '-');
  return formatted || '-';
}

export function getCertificateStatus(expirationStr?: string | null) {
  if (!expirationStr) return null;
  const result = getCertificateExpirationStatus(expirationStr);
  if (result.status === 'NONE') return null;
  return {
    status: result.status === 'INVALID' ? 'EXPIRED' : result.status,
    days: Math.abs(result.days || 0),
    label: result.status === 'EXPIRED'
      ? `Vencido há ${Math.abs(result.days || 0)} dias`
      : result.status === 'INVALID'
      ? 'Vencimento inválido'
      : result.days === 0
      ? 'Vence hoje!'
      : (result.days || 0) <= 30
      ? `Vence em ${result.days} dias`
      : `${result.days} dias restantes`,
    isUrgent: result.status === 'EXPIRED' || result.status === 'WARNING' || result.status === 'INVALID',
    color: result.color
  };
}

export function formatCnpj(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length === 14) {
      return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }
    if (digits.length === 11) {
      return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    }
    return cnpj;
  };

export function formatRegimeLabel(regime: string) {
    const map: Record<string, string> = {
      SIMPLES_NACIONAL: 'Simples Nacional',
      SIMPLES_NACIONAL_HIBRIDO: 'Simples Nacional Híbrido',
      LUCRO_PRESUMIDO: 'Lucro Presumido',
      LUCRO_REAL_TRIMESTRAL: 'L. Real Trimestral',
      LUCRO_REAL_ESTIMATIVA: 'L. Real Estimativa',
      LUCRO_REAL_ANUAL: 'L. Real Anual',
      MEI: 'MEI',
      IMUNE_IRPJ: 'Imune IRPJ',
      CONDOMINIOS: 'Condomínio',
      DOMESTICA: 'Doméstica',
      ASSOCIACOES: 'Associação',
      PESSOA_FISICA: 'Pessoa Física',
    };
    return map[regime] || regime;
  };

export interface CompanyDetailsModalProps {
  company: any;
  onClose: () => void;
  notesLabel?: string;
  initialNotes?: string;
  canEditNotes?: boolean;
  onSaveNotes?: (newNotes: string) => Promise<void>;
  currentUser?: any;
}

export function CompanyDetailsModal({
  company: c,
  onClose,
  notesLabel = 'Observações do Fiscal',
  initialNotes,
  canEditNotes = true,
  onSaveNotes,
  currentUser,
}: CompanyDetailsModalProps) {
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copyMessage, setCopyMessage] = useState('');
  const [notesText, setNotesText] = useState<string>(initialNotes !== undefined ? initialNotes : (c.notes || ''));
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSavedSuccess, setNotesSavedSuccess] = useState(false);
  const [notesError, setNotesError] = useState('');

  const handleInsertStamp = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const author = currentUser?.name || currentUser?.email || 'Usuário';
    const stamp = `[${day}/${month} ${hours}:${minutes} - ${author}]: `;
    setNotesText((prev: string) => prev ? `${stamp}\n${prev}` : stamp);
    setNotesSavedSuccess(false);
  };

  useEffect(() => {
    if (initialNotes !== undefined) {
      setNotesText(initialNotes);
    } else {
      setNotesText(c.notes || '');
    }
  }, [initialNotes, c.notes]);

  const certInfo = c.hasClientCertificate ? getCertificateStatus(c.certificateExpiration) : null;
  const togglePasswordReveal = (key: string) => setRevealedPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(`${label} copiado!`);
    } catch {
      setCopyMessage('Não foi possível copiar.');
    }
  };
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onClose]);
  return (
            <div className="closing-modal-backdrop" onClick={onClose}>
              <div
                className="closing-modal-content large-info"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="closing-modal-header">
                  <div className="closing-modal-title">
                    <Building2 size={24} />
                    {c.name}
                  </div>
                  <button className="closing-modal-close-btn" onClick={onClose}>
                    &times;
                  </button>
                </div>

                <div className="closing-modal-body">
                  {copyMessage && <p role="status">{copyMessage}</p>}
                  {/* Banner de Status do Certificado com Exclamação se < 30 dias ou vencido */}
                  {certInfo && (
                    <div
                      className={`cert-expiration-banner ${
                        certInfo.status === 'EXPIRED'
                          ? 'expired'
                          : certInfo.status === 'WARNING'
                          ? 'warning'
                          : 'ok'
                      }`}
                    >
                      <AlertTriangle size={20} />
                      <div>
                        <strong>Certificado Digital: </strong>
                        <span>
                          {certInfo.status === 'EXPIRED'
                            ? `Certificado VENCIDO há ${certInfo.days} dias (${formatFlexibleDateBr(c.certificateExpiration)})! Regularização urgente necessária.`
                            : certInfo.status === 'WARNING'
                            ? `Atenção: Vence em ${certInfo.days} dias (${formatFlexibleDateBr(c.certificateExpiration)})! Menos de 30 dias para expirar.`
                            : `Certificado válido (${certInfo.days} dias restantes até ${formatFlexibleDateBr(c.certificateExpiration)}).`}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="company-info-grid">
                    {/* Bloco 1: Identificação */}
                    <div className="info-card-block">
                      <h4>Identificação & Tributação</h4>
                      <div className="info-item-row">
                        <span className="label">Código:</span>
                        <span className="value">{formatCompanyCode(c.code) || '-'}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Razão Social:</span>
                        <span className="value">{c.name}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Nome Fantasia:</span>
                        <span className="value">{c.tradeName || '-'}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">CNPJ:</span>
                        <span className="value">
                          {formatCnpj(c.cnpj)}
                          <button
                            className="copy-badge-btn"
                            onClick={() => handleCopy(c.cnpj, 'CNPJ')}
                          >
                            <Copy size={11} />
                          </button>
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Grupo:</span>
                        <span className="value">{c.groupName || '-'}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Tributação:</span>
                        <span className="value">{formatRegimeLabel(c.taxRegime)}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Município:</span>
                        <span className="value">{c.city || '-'}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Inscr. Estadual:</span>
                        <span className="value">{c.stateRegistration || '-'}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Inscr. Municipal:</span>
                        <span className="value">{c.municipalRegistration || '-'}</span>
                      </div>
                    </div>

                    {/* Bloco 2: Certificado Digital */}
                    <div
                      className={`info-card-block ${
                        certInfo?.isUrgent
                          ? certInfo.status === 'EXPIRED'
                            ? 'highlight-cert expired'
                            : 'highlight-cert'
                          : ''
                      }`}
                    >
                      <h4>Certificado Digital</h4>
                      <div className="info-item-row">
                        <span className="label">Possui Certificado:</span>
                        <span className="value">{c.hasClientCertificate ? 'SIM' : 'NÃO'}</span>
                      </div>
                      {c.hasClientCertificate ? (
                        <>
                          <div className="info-item-row">
                            <span className="label">Tipo de Certificado:</span>
                            <span className="value">{c.certificateType || '-'}</span>
                          </div>
                          <div className="info-item-row">
                            <span className="label">Emissão (MM/AAAA):</span>
                            <span className="value">{c.certificateIssue || '-'}</span>
                          </div>
                          <div className="info-item-row">
                            <span className="label">Vencimento:</span>
                            <span
                              className="value"
                              style={{
                                color: certInfo?.isUrgent ? certInfo.color : '#0f172a',
                                fontWeight: 700,
                              }}
                            >
                              {formatDateBr(c.certificateExpiration)}
                            </span>
                          </div>
                          <div className="info-item-row">
                            <span className="label">Dias para Vencer:</span>
                            <span
                              className="value"
                              style={{
                                color: certInfo?.isUrgent ? certInfo.color : '#10b981',
                                fontWeight: 700,
                              }}
                            >
                              {certInfo ? certInfo.label : '-'}
                            </span>
                          </div>
                          <div className="info-item-row">
                            <span className="label">Senha do Certificado:</span>
                            <span className="value">
                              {c.certificatePasswordDecrypted ? (
                                <div className="password-reveal-badge">
                                  <span>
                                    {revealedPasswords[`cert_${c.id}`]
                                      ? c.certificatePasswordDecrypted
                                      : '••••••'}
                                  </span>
                                  <button onClick={() => togglePasswordReveal(`cert_${c.id}`)}>
                                    {revealedPasswords[`cert_${c.id}`] ? (
                                      <EyeOff size={13} />
                                    ) : (
                                      <Eye size={13} />
                                    )}
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleCopy(c.certificatePasswordDecrypted, 'Senha Certificado')
                                    }
                                  >
                                    <Copy size={11} />
                                  </button>
                                </div>
                              ) : (
                                '-'
                              )}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '4px' }}>
                          Nenhum certificado digital cadastrado para este cliente.
                        </div>
                      )}
                    </div>

                    {/* Bloco 3: Procurações (Separado) */}
                    <div className="info-card-block">
                      <h4>Procurações</h4>
                      <div className="info-item-row">
                        <span className="label">Rec. Federal (eCAC):</span>
                        <span className="value">
                          {c.targetProxyIssueDate ? `${formatDateBr(c.targetProxyIssueDate)} até ` : ''}
                          {c.targetProxyDate ? formatDateBr(c.targetProxyDate) : 'Não'}
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">FGTS Digital:</span>
                        <span className="value">
                          {c.fgtsProxyIssueDate ? `${formatDateBr(c.fgtsProxyIssueDate)} até ` : ''}
                          {c.fgtsProxyDate ? formatDateBr(c.fgtsProxyDate) : 'Não'}
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Caixa Postal DEC:</span>
                        <span className="value">
                          {c.decProxyIssueDate ? `${formatDateBr(c.decProxyIssueDate)} até ` : ''}
                          {c.decProxyDate ? formatDateBr(c.decProxyDate) : 'Não'}
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Portal Empregador:</span>
                        <span className="value">
                          {c.empregadorProxyIssueDate ? `${formatDateBr(c.empregadorProxyIssueDate)} até ` : ''}
                          {c.empregadorProxyDate ? formatDateBr(c.empregadorProxyDate) : 'Não'}
                        </span>
                      </div>
                    </div>

                    {/* Bloco 4: Contrato & Prazos (Separado) */}
                    <div className="info-card-block">
                      <h4>Contrato & Prazos</h4>
                      <div className="info-item-row">
                        <span className="label">Data do Contrato:</span>
                        <span className="value">
                          {formatDateBr(c.contractDate)}
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Início Obrigação:</span>
                        <span className="value">
                          {formatDateBr(c.obligationStartDate)}
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Data de Saída:</span>
                        <span
                          className="value"
                          style={{
                            color: c.exitDate ? '#ef4444' : '#10b981',
                            fontWeight: 600,
                          }}
                        >
                          {c.exitDate
                            ? formatDateBr(c.exitDate)
                            : 'Cliente Ativa'}
                        </span>
                      </div>
                    </div>

                    {/* Bloco 3: Logins e Acessos da Prefeitura */}
                    <div className="info-card-block">
                      <h4>Prefeitura & Senhas</h4>
                      <div className="info-item-row">
                        <span className="label">Login Prefeitura:</span>
                        <span className="value">{c.cityHallLogin || '-'}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Link Prefeitura:</span>
                        <span className="value">
                          {c.cityHallLink ? (
                            <a
                              href={
                                c.cityHallLink.startsWith('http')
                                  ? c.cityHallLink
                                  : `https://${c.cityHallLink}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              Abrir Link <ExternalLink size={12} />
                            </a>
                          ) : (
                            '-'
                          )}
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Senha Ginfess / Pref:</span>
                        <span className="value">
                          {c.ginfessPasswordDecrypted ? (
                            <div className="password-reveal-badge">
                              <span>
                                {revealedPasswords[`ginfess_modal_${c.id}`]
                                  ? c.ginfessPasswordDecrypted
                                  : '••••••'}
                              </span>
                              <button
                                onClick={() => togglePasswordReveal(`ginfess_modal_${c.id}`)}
                              >
                                {revealedPasswords[`ginfess_modal_${c.id}`] ? (
                                  <EyeOff size={13} />
                                ) : (
                                  <Eye size={13} />
                                )}
                              </button>
                              <button
                                onClick={() =>
                                  handleCopy(c.ginfessPasswordDecrypted, 'Senha Prefeitura')
                                }
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Senha Giss Online:</span>
                        <span className="value">
                          {c.gissOnlinePasswordDecrypted ? (
                            <div className="password-reveal-badge">
                              <span>
                                {revealedPasswords[`giss_modal_${c.id}`]
                                  ? c.gissOnlinePasswordDecrypted
                                  : '••••••'}
                              </span>
                              <button
                                onClick={() => togglePasswordReveal(`giss_modal_${c.id}`)}
                              >
                                {revealedPasswords[`giss_modal_${c.id}`] ? (
                                  <EyeOff size={13} />
                                ) : (
                                  <Eye size={13} />
                                )}
                              </button>
                              <button
                                onClick={() =>
                                  handleCopy(c.gissOnlinePasswordDecrypted, 'Senha Giss')
                                }
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Tipo Acesso NF:</span>
                        <span className="value">{c.nfAccessType || '-'}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Login NF:</span>
                        <span className="value">
                          {c.nfLogin ? (
                            <div className="password-reveal-badge">
                              <span>{c.nfLogin}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(c.nfLogin, 'Login NF Contribuinte')}
                                title="Copiar Login NF Contribuinte"
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Senha NF:</span>
                        <span className="value">
                          {c.nfPasswordDecrypted ? (
                            <div className="password-reveal-badge">
                              <span>
                                {revealedPasswords[`nf_modal_${c.id}`]
                                  ? c.nfPasswordDecrypted
                                  : '••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordReveal(`nf_modal_${c.id}`)}
                                title={revealedPasswords[`nf_modal_${c.id}`] ? 'Ocultar' : 'Revelar'}
                              >
                                {revealedPasswords[`nf_modal_${c.id}`] ? (
                                  <EyeOff size={13} />
                                ) : (
                                  <Eye size={13} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(c.nfPasswordDecrypted, 'Senha NF Contribuinte')
                                }
                                title="Copiar Senha NF Contribuinte"
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Bloco 4: Operação & Observações */}
                    <div className="info-card-block">
                      <h4>Operação & Observações</h4>
                      <div className="info-item-row">
                        <span className="label">Tipo de Empresa:</span>
                        <span className="value">{c.companyType || '-'}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Método de Envio:</span>
                        <span className="value">{c.deliveryMethod || '-'}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">Mês/Ano Dissídio:</span>
                        <span className="value">{c.dissidioMonthYear || '-'}</span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">SD Login:</span>
                        <span className="value">
                          {c.sdLogin ? (
                            <div className="password-reveal-badge">
                              <span>{c.sdLogin}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(c.sdLogin, 'SD Login')}
                                title="Copiar SD Login"
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </span>
                      </div>
                      <div className="info-item-row">
                        <span className="label">SD Senha:</span>
                        <span className="value">
                          {c.sdPasswordDecrypted ? (
                            <div className="password-reveal-badge">
                              <span>
                                {revealedPasswords[`sd_modal_${c.id}`]
                                  ? c.sdPasswordDecrypted
                                  : '••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordReveal(`sd_modal_${c.id}`)}
                                title={revealedPasswords[`sd_modal_${c.id}`] ? 'Ocultar' : 'Revelar'}
                              >
                                {revealedPasswords[`sd_modal_${c.id}`] ? (
                                  <EyeOff size={13} />
                                ) : (
                                  <Eye size={13} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(c.sdPasswordDecrypted, 'SD Senha')
                                }
                                title="Copiar SD Senha"
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </span>
                      </div>
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span className="label" style={{ fontWeight: 600, color: '#334155' }}>
                            {notesLabel}:
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {canEditNotes && onSaveNotes && (
                              <button
                                type="button"
                                onClick={handleInsertStamp}
                                title="Inserir data e nome do usuário na observação"
                                style={{
                                  background: 'rgba(99, 102, 241, 0.1)',
                                  border: '1px solid rgba(129, 140, 248, 0.4)',
                                  color: '#4338ca',
                                  fontSize: '0.76rem',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                }}
                              >
                                + Inserir Data e Autor
                              </button>
                            )}
                            {notesSavedSuccess && (
                              <span style={{ fontSize: '0.8rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle2 size={14} /> Salvo com sucesso!
                              </span>
                            )}
                          </div>
                        </div>
                        {onSaveNotes ? (
                          <div>
                            <textarea
                              value={notesText}
                              onChange={(e) => {
                                setNotesText(e.target.value);
                                setNotesSavedSuccess(false);
                              }}
                              disabled={!canEditNotes || isSavingNotes}
                              placeholder="Digite observações sobre a empresa..."
                              rows={4}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                color: '#1e293b',
                                backgroundColor: canEditNotes ? '#ffffff' : '#f8fafc',
                                resize: 'vertical',
                                boxSizing: 'border-box',
                                outline: 'none',
                              }}
                            />
                            {notesError && <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: '4px 0 0' }}>{notesError}</p>}
                            {canEditNotes && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                <button
                                  type="button"
                                  className="btn-primary-gradient"
                                  style={{ fontSize: '0.8rem', padding: '5px 12px' }}
                                  disabled={isSavingNotes}
                                  onClick={async () => {
                                    setIsSavingNotes(true);
                                    setNotesError('');
                                    try {
                                      await onSaveNotes(notesText);
                                      setNotesSavedSuccess(true);
                                      setTimeout(() => setNotesSavedSuccess(false), 3000);
                                    } catch (err: any) {
                                      setNotesError(err?.message || 'Erro ao salvar observação.');
                                    } finally {
                                      setIsSavingNotes(false);
                                    }
                                  }}
                                >
                                  {isSavingNotes ? 'Salvando...' : 'Salvar Observações'}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              background: '#e2e8f0',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              fontSize: '0.85rem',
                              color: '#334155',
                              minHeight: '40px',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {notesText || 'Nenhuma observação cadastrada.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                    <button className="btn-primary-gradient" onClick={onClose}>
                      Fechar Detalhes
                    </button>
                  </div>
                </div>
              </div>
            </div>
);
}
