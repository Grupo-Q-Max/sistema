
import './LoadingSkeleton.css';

interface SpinnerProps {
  text?: string;
  size?: 'small' | 'medium' | 'large';
  compact?: boolean;
}

export function LoadingSpinner({ text = 'Carregando dados...', size = 'large', compact = false }: SpinnerProps) {
  return (
    <div className={`modern-spinner-container ${compact ? 'compact' : ''}`}>
      <div className={`modern-spinner-ring ${size}`}>
        <div className="spinner-outer-track" />
        <div className="spinner-glow-head" />
        {size === 'large' && <div className="spinner-center-dot" />}
      </div>
      {text && (
        <div className="spinner-text-glow">
          {text} <span>•</span>
        </div>
      )}
    </div>
  );
}

export function ButtonSpinner() {
  return (
    <div className="modern-spinner-ring small" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <div className="spinner-outer-track" style={{ borderWidth: '2px' }} />
      <div className="spinner-glow-head" style={{ borderWidth: '2px' }} />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      {/* 11 Regimes Cards Skeleton */}
      <div className="skeleton-regimes-grid">
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={i} className="skeleton-regime-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="skeleton-box" style={{ width: '28px', height: '28px', borderRadius: '8px' }} />
              <span className="skeleton-box" style={{ width: '22px', height: '16px', borderRadius: '4px' }} />
            </div>
            <span className="skeleton-box" style={{ width: '85%', height: '12px' }} />
            <span className="skeleton-box" style={{ width: '45%', height: '10px' }} />
          </div>
        ))}
      </div>

      {/* 5 Sectors Progress Skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span className="skeleton-box" style={{ width: '220px', height: '16px', borderRadius: '4px' }} />
        <div className="skeleton-sectors-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-sector-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="skeleton-box" style={{ width: '80px', height: '14px' }} />
                <span className="skeleton-box" style={{ width: '36px', height: '14px' }} />
              </div>
              <span className="skeleton-box" style={{ width: '100%', height: '6px', borderRadius: '999px' }} />
              <span className="skeleton-box" style={{ width: '110px', height: '10px' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Movements Skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span className="skeleton-box" style={{ width: '140px', height: '16px', borderRadius: '4px' }} />
        <div className="skeleton-movements-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-movement-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="skeleton-box" style={{ width: '20px', height: '20px', borderRadius: '6px' }} />
                <span className="skeleton-box" style={{ width: '120px', height: '14px' }} />
              </div>
              <span className="skeleton-box" style={{ width: '100%', height: '24px', borderRadius: '6px' }} />
              <span className="skeleton-box" style={{ width: '70%', height: '10px' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Companies Table Skeleton */}
      <div className="skeleton-table-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="skeleton-box" style={{ width: '180px', height: '18px' }} />
          <span className="skeleton-box" style={{ width: '220px', height: '36px', borderRadius: '8px' }} />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-table-row">
            <span className="skeleton-box" style={{ width: '36px', height: '36px', borderRadius: '10px' }} />
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span className="skeleton-box" style={{ width: '60%', height: '14px' }} />
              <span className="skeleton-box" style={{ width: '40%', height: '11px' }} />
            </div>
            <span className="skeleton-box" style={{ flex: 1, height: '20px', borderRadius: '6px' }} />
            <span className="skeleton-box" style={{ flex: 1, height: '14px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-table-row">
          <span className="skeleton-box" style={{ width: '40px', height: '24px', borderRadius: '6px' }} />
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span className="skeleton-box" style={{ width: '60%', height: '14px' }} />
            <span className="skeleton-box" style={{ width: '35%', height: '11px' }} />
          </div>
          <span className="skeleton-box" style={{ flex: 1, height: '22px', borderRadius: '8px' }} />
          <span className="skeleton-box" style={{ flex: 1, height: '18px', borderRadius: '6px' }} />
          <span className="skeleton-box" style={{ flex: 1, height: '18px', borderRadius: '6px' }} />
          <span className="skeleton-box" style={{ width: '70px', height: '26px', borderRadius: '6px' }} />
        </div>
      ))}
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="settings-skeleton-panel">
      {/* 3 Top Stat Cards Skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ padding: '18px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span className="skeleton-box" style={{ width: '42px', height: '42px', borderRadius: '10px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
              <span className="skeleton-box" style={{ width: '40px', height: '22px' }} />
              <span className="skeleton-box" style={{ width: '100px', height: '11px' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar Skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span className="skeleton-box" style={{ width: '240px', height: '20px' }} />
          <span className="skeleton-box" style={{ width: '380px', height: '13px' }} />
        </div>
        <span className="skeleton-box" style={{ width: '140px', height: '38px', borderRadius: '8px' }} />
      </div>

      {/* Table rows Skeleton */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton-table-row">
          <span className="skeleton-box" style={{ width: '36px', height: '36px', borderRadius: '10px' }} />
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span className="skeleton-box" style={{ width: '50%', height: '14px' }} />
            <span className="skeleton-box" style={{ width: '35%', height: '11px' }} />
          </div>
          <span className="skeleton-box" style={{ flex: 1, height: '22px', borderRadius: '8px' }} />
          <span className="skeleton-box" style={{ flex: 2, height: '18px', borderRadius: '999px' }} />
          <span className="skeleton-box" style={{ width: '60px', height: '26px', borderRadius: '6px' }} />
        </div>
      ))}
    </div>
  );
}
