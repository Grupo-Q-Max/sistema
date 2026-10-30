import { useEffect, useState } from 'react';
import { Building2, AlertTriangle, Copy, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { formatCompanyCode } from '../utils/codeSort';
import './Closings.css';

export function formatDateBr(dateVal?: string | Date | null): string {
  if (!dateVal) return '-';
  const str = String(dateVal).trim();
  if (!str) return '-';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export function getCertificateStatus(expirationStr?: string | null) {
  if (!expirationStr) return null;
  
  let expDate: Date | null = null;
  const clean = expirationStr.trim();
  const parts = clean.split('/');

  if (parts.length === 2) {
    // MM/AAAA
    const m = parseInt(parts[0], 10) - 1;
    const y = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(y)) {
      expDate = new Date(y, m + 1, 0, 23, 59, 59);
    }
  } else if (parts.length === 3) {
    // DD/MM/AAAA
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      expDate = new Date(y, m, d, 23, 59, 59);
    }
  } else {
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) expDate = parsed;
  }

  if (!expDate) return null;

  const now = new Date();
  const diffMs = expDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      status: 'EXPIRED',
      days: Math.abs(diffDays),
      label: `Vencido há ${Math.abs(diffDays)} dias`,
      isUrgent: true,
      color: '#ef4444',
    };
  } else if (diffDays <= 30) {
    return {
      status: 'WARNING',
      days: diffDays,
      label: diffDays === 0 ? 'Vence hoje!' : `Vence em ${diffDays} dias`,
      isUrgent: true,
      color: '#f59e0b',
    };
  } else {
    return {
      status: 'OK',
      days: diffDays,
      label: `${diffDays} dias restantes`,
      isUrgent: false,
      color: '#10b981',
    };
  }
}

export function formatCnpj(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length === 14) {
      return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }
    return cnpj;
  };

export function formatRegimeLabel(regime: string) {
    const map: Record<string, string> = {
      SIMPLES_NACIONAL: 'Simples Nacional',
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

export function CompanyDetailsModal({company:c,onClose,notesLabel='Observações do Fiscal'}:{company:any;onClose:()=>void;notesLabel?:string}) {
  const [revealedPasswords,setRevealedPasswords]=useState<Record<string,boolean>>({});
  const [copyMessage,setCopyMessage]=useState('');
  const certInfo=c.hasClientCertificate?getCertificateStatus(c.certificateExpiration):null;
  const togglePasswordReveal=(key:string)=>setRevealedPasswords(prev=>({...prev,[key]:!prev[key]}));
  const handleCopy=async(text:string,label:string)=>{
    try{await navigator.clipboard.writeText(text);setCopyMessage(`${label} copiado!`);}catch{setCopyMessage('Não foi possível copiar.');}
  };
  useEffect(()=>{const keydown=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[onClose]);
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
                            ? `Certificado VENCIDO há ${certInfo.days} dias (${c.certificateExpiration})! Regularização urgente necessária.`
                            : certInfo.status === 'WARNING'
                            ? `Atenção: Vence em ${certInfo.days} dias (${c.certificateExpiration})! Menos de 30 dias para expirar.`
                            : `Certificado válido (${certInfo.days} dias restantes até ${c.certificateExpiration}).`}
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
                      <div style={{ marginTop: '6px' }}>
                        <span className="label" style={{ display: 'block', marginBottom: '4px' }}>
                          {notesLabel}:
                        </span>
                        <div
                          style={{
                            background: '#e2e8f0',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            color: '#334155',
                            minHeight: '40px',
                          }}
                        >
                          {c.notes || 'Nenhuma observação cadastrada.'}
                        </div>
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
