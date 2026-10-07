import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, Lock, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { API } from '../api';
import type { CurrentUser } from '../types/auth';
import './ChangePasswordModal.css';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CurrentUser | null;
  targetUser?: { id: string; name?: string | null; email: string } | null;
  onSuccess?: () => void;
}

export function ChangePasswordModal({
  isOpen,
  onClose,
  currentUser,
  targetUser,
  onSuccess,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetId = targetUser?.id || currentUser?.id;
  const targetLabel = targetUser ? (targetUser.name || targetUser.email) : (currentUser?.name || currentUser?.email);
  const isSelf = !targetUser || targetUser.id === currentUser?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (isSelf && !currentPassword) {
      setErrorMsg('Informe sua senha atual.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('A nova senha deve possuir no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('A confirmação da nova senha não confere.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API}/api/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetId,
          currentPassword: isSelf ? currentPassword : undefined,
          newPassword,
          requesterId: currentUser?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Erro ao alterar a senha.');
        return;
      }

      setSuccessMsg(data.message || 'Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1600);
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro de comunicação com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="password-modal-overlay" onClick={onClose}>
      <div
        className="password-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-modal-title"
      >
        <button
          type="button"
          className="password-modal-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={20} />
        </button>

        <div className="password-modal-header">
          <div className="password-modal-icon">
            <KeyRound size={24} />
          </div>
          <div>
            <h2 id="password-modal-title">
              {isSelf ? 'Alterar Minha Senha' : `Redefinir Senha de ${targetLabel}`}
            </h2>
            <p className="password-modal-subtitle">
              {isSelf
                ? 'Atualize sua credencial de acesso com segurança.'
                : `Defina uma nova senha de acesso para ${targetLabel}.`}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="password-modal-alert is-error" role="alert">
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="password-modal-alert is-success" role="status">
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="password-modal-form">
          {isSelf && (
            <div className="password-form-group">
              <label htmlFor="current-password">Senha Atual</label>
              <div className="password-input-wrapper">
                <Lock size={16} className="input-icon-left" />
                <input
                  id="current-password"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="input-btn-toggle"
                  onClick={() => setShowCurrent(!showCurrent)}
                  aria-label={showCurrent ? 'Ocultar senha atual' : 'Mostrar senha atual'}
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          <div className="password-form-group">
            <label htmlFor="new-password">Nova Senha</label>
            <div className="password-input-wrapper">
              <Lock size={16} className="input-icon-left" />
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="input-btn-toggle"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? 'Ocultar nova senha' : 'Mostrar nova senha'}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="password-form-group">
            <label htmlFor="confirm-password">Confirmar Nova Senha</label>
            <div className="password-input-wrapper">
              <Lock size={16} className="input-icon-left" />
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="input-btn-toggle"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? 'Ocultar confirmação' : 'Mostrar confirmação'}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="password-modal-actions">
            <button
              type="button"
              className="password-btn-cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="password-btn-submit"
              disabled={loading || Boolean(successMsg)}
            >
              {loading ? 'Salvando...' : 'Atualizar Senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
