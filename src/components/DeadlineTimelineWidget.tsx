import { useState, useMemo } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight
} from 'lucide-react';
import { computeDeadlinesSummary, type ColumnDeadlineSummary } from '../config/legalDeadlines';
import './DeadlineTimelineWidget.css';

export interface DeadlineTimelineWidgetProps {
  columns: any[];
  rows: any[];
  period: Date;
  onFilterPending?: (columnKey: string) => void;
}

export function DeadlineTimelineWidget({
  columns,
  rows,
  period,
  onFilterPending
}: DeadlineTimelineWidgetProps) {
  const [open, setOpen] = useState(true);

  const summaries = useMemo(() => {
    return computeDeadlinesSummary(columns, rows, period);
  }, [columns, rows, period]);

  if (!summaries.length) return null;

  const totalOverdue = summaries.filter(s => s.urgency.type === 'OVERDUE' && s.totalPending > 0).length;
  const totalUrgent = summaries.filter(s => (s.urgency.type === 'DUE_TODAY' || s.urgency.type === 'DUE_SOON') && s.totalPending > 0).length;
  const totalCompleted = summaries.filter(s => s.totalPending === 0 && s.totalEligible > 0).length;

  const containerClass = totalOverdue > 0
    ? 'deadline-timeline-container has-overdue'
    : totalUrgent > 0
    ? 'deadline-timeline-container has-urgent'
    : 'deadline-timeline-container';

  const nextMonthName = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1))
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className={containerClass}>
      <div className="deadline-timeline-header" onClick={() => setOpen(prev => !prev)}>
        <div className="deadline-timeline-title-area">
          <div className={`deadline-timeline-icon-box ${totalOverdue > 0 ? 'overdue' : totalUrgent > 0 ? 'urgent' : ''}`}>
            <CalendarClock size={18} />
          </div>
          <div className="deadline-timeline-titles">
            <h3>
              Prazos Legais das Obrigações • {nextMonthName}
              {totalOverdue > 0 && (
                <span className="deadline-summary-pill overdue">
                  <AlertCircle size={12} />
                  {totalOverdue} com atraso
                </span>
              )}
              {totalUrgent > 0 && (
                <span className="deadline-summary-pill urgent">
                  <Clock size={12} />
                  {totalUrgent} vencendo em breve
                </span>
              )}
            </h3>
            <p>
              Acompanhe a contagem regressiva legal e clique em qualquer obrigação para filtrar as pendências
            </p>
          </div>
        </div>

        <div className="deadline-summary-pills">
          <span className="deadline-summary-pill ok">
            <CheckCircle2 size={12} />
            {totalCompleted}/{summaries.length} obrigações 100% entregues
          </span>
          <button
            type="button"
            className="bulk-btn-clear"
            style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }}
            aria-label={open ? 'Recolher prazos' : 'Expandir prazos'}
          >
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="deadline-timeline-body">
          {summaries.map((item: ColumnDeadlineSummary) => {
            const isOverdue = item.urgency.type === 'OVERDUE' && item.totalPending > 0;
            const isUrgent = (item.urgency.type === 'DUE_TODAY' || item.urgency.type === 'DUE_SOON') && item.totalPending > 0;
            const isCompleted = item.totalPending === 0 && item.totalEligible > 0;
            const percent = item.totalEligible > 0
              ? Math.round((item.totalCompleted / item.totalEligible) * 100)
              : 0;

            const cardClass = isOverdue
              ? 'deadline-card is-overdue'
              : isUrgent
              ? 'deadline-card is-urgent'
              : isCompleted
              ? 'deadline-card is-completed'
              : 'deadline-card';

            const fillColor = isOverdue
              ? '#ef4444'
              : isUrgent
              ? '#f59e0b'
              : isCompleted
              ? '#10b981'
              : '#6366f1';

            return (
              <div
                key={item.columnKey}
                className={cardClass}
                onClick={() => onFilterPending?.(item.columnKey)}
                title={`Clique para filtrar ${item.totalPending} empresa(s) pendente(s) em ${item.name}`}
              >
                <div className="deadline-card-top">
                  <span className="deadline-card-title">{item.name}</span>
                  <span className="deadline-card-date">Dia {item.day}</span>
                </div>

                <div className="deadline-card-progress">
                  <div className="deadline-progress-bar-bg">
                    <div
                      className="deadline-progress-bar-fill"
                      style={{ width: `${percent}%`, background: fillColor }}
                    />
                  </div>
                </div>

                <div className="deadline-card-meta">
                  <span>
                    {item.totalCompleted}/{item.totalEligible} entregues ({percent}%)
                  </span>
                  <span
                    className="deadline-badge-status"
                    style={{ color: item.urgency.color, background: item.urgency.bgColor }}
                  >
                    {isOverdue && <AlertCircle size={10} />}
                    {isUrgent && <AlertTriangle size={10} />}
                    {isCompleted && <CheckCircle2 size={10} />}
                    {isCompleted ? '100% OK' : isOverdue ? `${item.totalPending} atrasadas` : item.urgency.badgeText}
                  </span>
                </div>

                {item.totalPending > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: '#818cf8', marginTop: '2px' }}>
                    <span>Filtrar {item.totalPending} pendentes</span>
                    <ArrowRight size={10} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

