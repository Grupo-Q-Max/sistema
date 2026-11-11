import { useState, useEffect } from 'react';
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  X,
  Clock,
  Building2,
  Users
} from 'lucide-react';
import { API } from '../api';
import './WarRoomModal.css';

export interface WarRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  month: number;
}

export function WarRoomModal({ isOpen, onClose, year, month }: WarRoomModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [now, setNow] = useState(new Date());

  const totalSlides = 3;

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/api/dashboard?year=${year}&month=${month}`);
      if (res.ok) {
        const json = await res.json();
        setStats(json);
      }
    } catch {
      // Ignora falhas transitórias
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [isOpen, year, month]);

  // Relógio do telão
  useEffect(() => {
    const clockInterval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Rotação de slides a cada 18 segundos
  useEffect(() => {
    if (!isOpen || !isPlaying) return;
    const slideTimer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, 18000);
    return () => clearInterval(slideTimer);
  }, [isOpen, isPlaying]);

  // Tecla ESC fecha e F alterna tela cheia
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'ArrowRight') setCurrentSlide((prev) => (prev + 1) % totalSlides);
      if (e.key === 'ArrowLeft') setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
      if (e.key === ' ') setIsPlaying((p) => !p);
    };
    if (isOpen) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  if (!isOpen) return null;

  const periodLabel = `${String(month + 1).padStart(2, '0')}/${year}`;
  const progressList = stats?.progress || [];
  const overallPct = progressList.length > 0
    ? Math.round(progressList.reduce((acc: number, p: any) => acc + (p.percent || 0), 0) / progressList.length)
    : 0;

  // Cálculo da contagem regressiva para o dia 20
  const currentDay = now.getDate();
  const daysTo20 = 20 - currentDay;

  return (
    <div className="war-room-backdrop" role="dialog" aria-modal="true">
      {/* Topo do Telão */}
      <div className="war-room-topbar">
        <div className="war-room-brand">
          <div className="war-room-live-badge">
            <span className="live-dot" /> LIVE
          </div>
          <div className="war-room-brand-text">
            <h2>GRUPO Q-MAX • WAR ROOM OPERACIONAL</h2>
            <p>Fechamento Mensal • Competência {periodLabel}</p>
          </div>
        </div>

        {/* Controles de Apresentação */}
        <div className="war-room-nav-controls">
          <div className="war-room-slide-dots">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button
                key={i}
                type="button"
                className={`slide-dot ${currentSlide === i ? 'active' : ''}`}
                onClick={() => setCurrentSlide(i)}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>

          <button
            type="button"
            className="war-room-btn-action"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pausar rotação automática' : 'Retomar rotação'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlaying ? 'Pausar' : 'Rodar'}</span>
          </button>

          <button
            type="button"
            className="war-room-btn-action"
            onClick={toggleFullscreen}
            title="Alternar Tela Cheia"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{isFullscreen ? 'Normal' : 'Tela Cheia'}</span>
          </button>

          <button
            type="button"
            className="war-room-btn-action"
            onClick={onClose}
            title="Fechar War Room (ESC)"
            style={{ color: '#ef4444' }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Conteúdo Principal dos Slides */}
      <div className="war-room-body">
        {currentSlide === 0 && (
          <div className="war-room-overview-grid">
            {/* Velocímetro Geral */}
            <div className="war-room-hero-dial">
              <div
                className="dial-circle-outer"
                style={{
                  background: `conic-gradient(#10b981 0% ${overallPct}%, rgba(30, 41, 59, 0.7) ${overallPct}% 100%)`,
                }}
              >
                <div
                  style={{
                    width: 175,
                    height: 175,
                    borderRadius: '50%',
                    background: '#0b1120',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div className="dial-center-text">
                    <span className="dial-number">{overallPct}%</span>
                    <span className="dial-label">Conclusão Geral</span>
                  </div>
                </div>
              </div>

              {/* Contagem Regressiva para Dia 20 */}
              <div className="war-room-countdown-box">
                <div className="countdown-icon-box">
                  <Clock size={20} />
                </div>
                <div className="countdown-text-block">
                  <div className="countdown-label">Vencimento DAS / DCTFWeb</div>
                  <div className="countdown-val">
                    {daysTo20 > 0
                      ? `${daysTo20} dias restantes`
                      : daysTo20 === 0
                      ? 'HOJE É O DIA 20!'
                      : 'PRAZO CONCLUÍDO'}
                  </div>
                </div>
              </div>
            </div>

            {/* Grid dos 4 Setores */}
            <div className="war-room-sectors-grid">
              {progressList.map((p: any) => {
                const labels: Record<string, string> = {
                  FISCAL: 'Setor Fiscal',
                  DP: 'Departamento Pessoal',
                  CONTABIL: 'Contábil & Balanços',
                  CUSHMAN: 'Cushman Facilities',
                  PARCELAMENTO: 'Parcelamentos',
                };
                const colors: Record<string, string> = {
                  FISCAL: '#3b82f6',
                  DP: '#8b5cf6',
                  CONTABIL: '#10b981',
                  CUSHMAN: '#f59e0b',
                  PARCELAMENTO: '#06b6d4',
                };
                const color = colors[p.type] || '#3b82f6';

                return (
                  <div key={p.type} className="war-room-sector-card">
                    <div className="sector-card-header">
                      <div className="sector-card-title">
                        <Building2 size={20} color={color} />
                        <h3>{labels[p.type] || p.type}</h3>
                      </div>
                      <span className="sector-pct-pill" style={{ color }}>
                        {p.percent}%
                      </span>
                    </div>

                    <div className="sector-progress-track">
                      <div
                        className="sector-progress-fill"
                        style={{ width: `${p.percent}%`, background: color }}
                      />
                    </div>

                    <div className="sector-card-metrics">
                      <div>
                        Concluídos: <strong>{p.completed}</strong>
                      </div>
                      <div>
                        Em Andamento: <strong>{p.inProgress}</strong>
                      </div>
                      <div>
                        Pendentes: <strong style={{ color: '#ef4444' }}>{p.pending}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Slide 2: Setor Fiscal e Regimes */}
        {currentSlide === 1 && (
          <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
            <h2 style={{ fontSize: 24, margin: '0 0 20px 0', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Building2 size={24} /> Desempenho Tributário por Regime • Fiscal
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              {Object.entries(stats?.regimes || {}).map(([regime, count]: any) => (
                <div key={regime} className="war-room-sector-card" style={{ padding: 28 }}>
                  <span style={{ fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                    {regime.replace(/_/g, ' ')}
                  </span>
                  <div style={{ fontSize: 38, fontWeight: 900, color: '#f8fafc', margin: '10px 0' }}>
                    {count} <span style={{ fontSize: 16, color: '#64748b' }}>empresas</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#34d399' }}>
                    ✔ Obrigações PGDAS / EFD em apuração
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Slide 3: Departamento Pessoal */}
        {currentSlide === 2 && (
          <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
            <h2 style={{ fontSize: 24, margin: '0 0 20px 0', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={24} /> Departamento Pessoal • Vidas & Folha
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              <div className="war-room-sector-card highlight" style={{ padding: 28 }}>
                <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>Total de Funcionários Processados</span>
                <div style={{ fontSize: 44, fontWeight: 900, color: '#ffffff', margin: '12px 0' }}>
                  {stats?.totalEmployees || 0}
                </div>
                <div style={{ fontSize: 13, color: '#93c5fd' }}>Colaboradores em carteira ativa</div>
              </div>

              <div className="war-room-sector-card" style={{ padding: 28 }}>
                <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>Empresas com Folha Ativa</span>
                <div style={{ fontSize: 44, fontWeight: 900, color: '#34d399', margin: '12px 0' }}>
                  {stats?.totalActive || 0}
                </div>
                <div style={{ fontSize: 13, color: '#a7f3d0' }}>eSocial S-1200 / DCTFWeb Web</div>
              </div>

              <div className="war-room-sector-card" style={{ padding: 28 }}>
                <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>FGTS Digital</span>
                <div style={{ fontSize: 44, fontWeight: 900, color: '#f59e0b', margin: '12px 0' }}>
                  Dia 20
                </div>
                <div style={{ fontSize: 13, color: '#fde68a' }}>Guias e fechamentos integrados</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé do Telão com Relógio ao Vivo */}
      <div className="war-room-footer">
        <div>Fechamento PRO • Monitoramento Contínuo em Tempo Real</div>
        <div style={{ fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.05em' }}>
          {now.toLocaleDateString('pt-BR')} • {now.toLocaleTimeString('pt-BR')}
        </div>
      </div>
    </div>
  );
}
