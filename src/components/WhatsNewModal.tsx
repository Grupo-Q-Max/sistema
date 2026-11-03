import { useState } from 'react';
import {
  X,
  Sparkles,
  ShieldAlert,
  Clock,
  Copy,
  BarChart3,
  Users,
  Eye,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import './WhatsNewModal.css';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  versionKey?: string;
}

interface UpdateItem {
  id: string;
  icon: any;
  color: string;
  badge: string;
  badgeType: 'feature' | 'improvement' | 'productivity';
  title: string;
  description: string;
  sectors: string[];
}

const UPDATES: UpdateItem[] = [
  {
    id: 'cert-filter',
    icon: ShieldAlert,
    color: '#f59e0b',
    badge: 'Novo Filtro',
    badgeType: 'feature',
    title: 'Filtro Rápido de Certificados Digitais',
    description:
      'Filtre empresas instantaneamente por certificados vencidos, vencendo em até 30 dias, válidos ou sem certificado cadastrado nos módulos Contábil, DP e Fiscal.',
    sectors: ['Contábil', 'DP', 'Fiscal'],
  },
  {
    id: 'notes-stamp',
    icon: Clock,
    color: '#8b5cf6',
    badge: 'Rastreabilidade',
    badgeType: 'improvement',
    title: 'Carimbo de Data e Autor nas Observações',
    description:
      'Clique no novo botão "+ Inserir Data e Autor" dentro de "Ver detalhes" da empresa para adicionar automaticamente [DD/MM HH:MM - Seu Nome], garantindo histórico transparente das anotações.',
    sectors: ['Contábil', 'DP', 'Fiscal'],
  },
  {
    id: 'copy-cnpjs',
    icon: Copy,
    color: '#3b82f6',
    badge: 'Produtividade',
    badgeType: 'productivity',
    title: 'Copiar CNPJs em Lote em 1 Clique',
    description:
      'Novo botão "Copiar CNPJs" na barra de ferramentas. Copia todos os CNPJs limpos (apenas números) das empresas atualmente filtradas na tela para colar no e-CAC, robôs e planilhas.',
    sectors: ['Contábil', 'DP', 'Fiscal'],
  },
  {
    id: 'workload-modal',
    icon: BarChart3,
    color: '#10b981',
    badge: 'Gestão & Equipe',
    badgeType: 'feature',
    title: 'Painel de Carga de Trabalho por Responsável',
    description:
      'Clique em "Carga da Equipe" para abrir um ranking com a distribuição de empresas, total concluído, em andamento, pendências e percentual de progresso de cada colaborador, com atalho para filtrar.',
    sectors: ['Contábil', 'DP', 'Fiscal'],
  },
  {
    id: 'bulk-assign',
    icon: Users,
    color: '#ec4899',
    badge: 'Ação em Massa',
    badgeType: 'productivity',
    title: 'Atribuição em Massa de Responsáveis',
    description:
      'Selecione várias empresas pelas caixas de seleção da tabela e defina o responsável do setor de uma só vez através da barra de ações flutuante.',
    sectors: ['Contábil', 'DP', 'Fiscal'],
  },
  {
    id: 'company-details',
    icon: Eye,
    color: '#06b6d4',
    badge: 'Visão 360°',
    badgeType: 'improvement',
    title: 'Observações Integradas no Detalhe da Empresa',
    description:
      'Consulte dados cadastrais, sócios, CNAEs, regime tributário e edite observações completas sem poluir a tabela de fechamento.',
    sectors: ['Contábil', 'DP', 'Fiscal'],
  },
  {
    id: 'compact-density',
    icon: Sliders,
    color: '#6366f1',
    badge: 'Usabilidade',
    badgeType: 'improvement',
    title: 'Alternância entre Modo Padrão e Compacto',
    description:
      'Alterne a densidade das linhas da tabela com o botão "Modo Compacto" para visualizar mais empresas sem precisar rolar tanto a página.',
    sectors: ['Contábil', 'DP', 'Fiscal'],
  },
];

export function WhatsNewModal({
  isOpen,
  onClose,
  versionKey = 'v2.4-nov-2026',
}: WhatsNewModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(() => {
    try {
      return localStorage.getItem('fechamento_whats_new_seen') === versionKey;
    } catch {
      return false;
    }
  });

  if (!isOpen) return null;

  const handleClose = () => {
    try {
      if (dontShowAgain) {
        localStorage.setItem('fechamento_whats_new_seen', versionKey);
      } else {
        localStorage.removeItem('fechamento_whats_new_seen');
      }
    } catch {}
    onClose();
  };

  const handleCheckboxChange = (checked: boolean) => {
    setDontShowAgain(checked);
    try {
      if (checked) {
        localStorage.setItem('fechamento_whats_new_seen', versionKey);
      } else {
        localStorage.removeItem('fechamento_whats_new_seen');
      }
    } catch {}
  };

  return (
    <div className="whats-new-backdrop" onClick={handleClose}>
      <div className="whats-new-modal" onClick={e => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="whats-new-header">
          <div className="whats-new-header-title">
            <div className="whats-new-header-badge">
              <Sparkles size={16} />
              <span>Novidades do Sistema</span>
            </div>
            <h2>O que há de novo no Fechamento Pro</h2>
            <p>
              Preparamos novas ferramentas e melhorias para agilizar o fluxo diário dos setores <strong>Contábil</strong>, <strong>DP</strong> e <strong>Fiscal</strong>.
            </p>
          </div>
          <button
            type="button"
            className="whats-new-close-btn"
            aria-label="Fechar novidades"
            onClick={handleClose}
          >
            <X size={20} />
          </button>
        </div>

        {/* Lista de Novidades */}
        <div className="whats-new-body">
          <div className="whats-new-grid">
            {UPDATES.map(item => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="whats-new-card">
                  <div
                    className="whats-new-card-icon"
                    style={{
                      background: `${item.color}18`,
                      borderColor: `${item.color}35`,
                      color: item.color,
                    }}
                  >
                    <Icon size={22} />
                  </div>
                  <div className="whats-new-card-content">
                    <div className="whats-new-card-top">
                      <span className={`whats-new-tag tag-${item.badgeType}`}>
                        {item.badge}
                      </span>
                      <div className="whats-new-sectors">
                        {item.sectors.map(sector => (
                          <span key={sector} className="sector-chip">
                            {sector}
                          </span>
                        ))}
                      </div>
                    </div>
                    <h4>{item.title}</h4>
                    <p>{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rodapé com ação e checkbox */}
        <div className="whats-new-footer">
          <label className="whats-new-checkbox-label">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={e => handleCheckboxChange(e.target.checked)}
            />
            <span>Não mostrar este aviso automaticamente na próxima vez</span>
          </label>
          <button
            type="button"
            className="whats-new-btn-confirm"
            onClick={handleClose}
          >
            <CheckCircle2 size={16} />
            Entendido, vamos lá!
          </button>
        </div>
      </div>
    </div>
  );
}
