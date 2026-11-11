import React, { useState, useEffect } from 'react';
import {
  Database,
  Download,
  RefreshCw,
  Clock,
  ShieldCheck,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  FileArchive,
  X
} from 'lucide-react';
import { API } from '../api';
import './DatabaseBackupModal.css';

interface BackupItem {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  totalRecords?: number;
}

interface DatabaseBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: any;
}

export const DatabaseBackupModal: React.FC<DatabaseBackupModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchBackups = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/backups`);
      if (!res.ok) throw new Error('Falha ao carregar lista de backups');
      const data = await res.json();
      setBackups(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBackups();
    }
  }, [isOpen]);

  const handleGenerateBackup = async () => {
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API}/api/backups/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorName: currentUser?.name || 'ADMINISTRADOR' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar backup');
      setSuccess(`Backup gerado com sucesso! Arquivo: ${data.backup?.filename} (${data.backup?.sizeFormatted})`);
      await fetchBackups();
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar backup');
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  const totalStorageBytes = backups.reduce((acc, b) => acc + (b.sizeBytes || 0), 0);
  const totalStorageFormatted =
    totalStorageBytes > 1024 * 1024
      ? `${(totalStorageBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(totalStorageBytes / 1024).toFixed(1)} KB`;

  const lastBackup = backups[0];

  return (
    <div className="backup-modal-overlay" onClick={onClose}>
      <div className="backup-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="backup-modal-header">
          <div className="backup-header-title">
            <div className="backup-header-icon">
              <Database size={22} color="#38bdf8" />
            </div>
            <div>
              <h3>Central de Backups do Banco de Dados</h3>
              <p>Segurança contínua, histórico compactado e recuperação de desastres</p>
            </div>
          </div>
          <button className="backup-btn-close" onClick={onClose} title="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="backup-alert backup-alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="backup-alert backup-alert-success">
            <CheckCircle2 size={18} />
            <span>{success}</span>
          </div>
        )}

        {/* Stats Cards */}
        <div className="backup-stats-grid">
          <div className="backup-stat-card">
            <div className="backup-stat-icon">
              <Clock size={20} color="#a855f7" />
            </div>
            <div>
              <span className="backup-stat-label">Último Backup</span>
              <strong className="backup-stat-val">
                {lastBackup
                  ? new Date(lastBackup.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Nenhum ainda'}
              </strong>
            </div>
          </div>

          <div className="backup-stat-card">
            <div className="backup-stat-icon">
              <HardDrive size={20} color="#38bdf8" />
            </div>
            <div>
              <span className="backup-stat-label">Espaço Total Usado</span>
              <strong className="backup-stat-val">{totalStorageFormatted}</strong>
            </div>
          </div>

          <div className="backup-stat-card">
            <div className="backup-stat-icon">
              <ShieldCheck size={20} color="#10b981" />
            </div>
            <div>
              <span className="backup-stat-label">Agendador Automático</span>
              <strong className="backup-stat-val" style={{ color: '#34d399' }}>
                Ativo (03:00 AM)
              </strong>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="backup-action-bar">
          <div className="backup-action-info">
            <FileArchive size={16} color="#94a3b8" />
            <span>
              Formato gzip (.json.gz) · Todas as tabelas, fechamentos e logs · Retenção de 30 dias
            </span>
          </div>
          <button
            type="button"
            className="backup-btn-generate"
            onClick={handleGenerateBackup}
            disabled={generating}
          >
            <RefreshCw size={16} className={generating ? 'spin' : ''} />
            <span>{generating ? 'Gerando Snapshot...' : 'Gerar Backup Agora'}</span>
          </button>
        </div>

        {/* Backup List */}
        <div className="backup-table-wrapper">
          <table className="backup-table">
            <thead>
              <tr>
                <th>Arquivo de Snapshot</th>
                <th>Data & Hora</th>
                <th>Tamanho</th>
                <th style={{ textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    Carregando histórico de backups...
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    Nenhum backup encontrado. Clique em "Gerar Backup Agora" para criar o primeiro.
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.filename}>
                    <td>
                      <div className="backup-filename-cell">
                        <Database size={15} color="#38bdf8" />
                        <code>{b.filename}</code>
                      </div>
                    </td>
                    <td>
                      {new Date(b.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td>
                      <span className="backup-size-badge">{b.sizeFormatted}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <a
                        href={`${API}/api/backups/${b.filename}/download`}
                        download={b.filename}
                        className="backup-btn-download"
                        title="Baixar arquivo compactado"
                      >
                        <Download size={14} />
                        <span>Baixar</span>
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="backup-modal-footer">
          <p className="backup-footer-tip">
            💡 Dica: Mantenha cópias periódicas dos arquivos baixados em armazenamento externo seguro para conformidade e continuidade do negócio.
          </p>
          <button type="button" className="backup-btn-done" onClick={onClose}>
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};

