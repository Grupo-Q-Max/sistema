import { useEffect, useState, useCallback, useRef } from 'react';
import { API } from '../api';

export interface ActivePresenceUser {
  userId: string;
  userName: string;
  userEmail: string;
  sector: string;
  companyId?: string;
  closingId?: string;
  columnKey?: string;
  lastSeen: number;
}

export function usePresence(options: {
  sector: string;
  companyId?: string | null;
  closingId?: string | null;
  columnKey?: string | null;
  currentUserId?: string | null;
  enabled?: boolean;
}) {
  const { sector, companyId, closingId, columnKey, currentUserId, enabled = true } = options;
  const [activeUsers, setActiveUsers] = useState<ActivePresenceUser[]>([]);
  const latestParams = useRef({ sector, companyId, closingId, columnKey });
  latestParams.current = { sector, companyId, closingId, columnKey };

  const sendPing = useCallback(async () => {
    if (!enabled) return;
    try {
      const { sector, companyId, closingId, columnKey } = latestParams.current;
      const res = await fetch(`${API}/api/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector,
          companyId: companyId || undefined,
          closingId: closingId || undefined,
          columnKey: columnKey || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.activeUsers)) {
          setActiveUsers(data.activeUsers);
        }
      }
    } catch {
      // Ignora falhas temporárias de ping
    }
  }, [enabled]);

  // Envia ping inicial e periódico a cada 18 segundos
  useEffect(() => {
    if (!enabled) return;
    void sendPing();
    const interval = setInterval(() => {
      void sendPing();
    }, 18000);
    return () => clearInterval(interval);
  }, [sendPing, enabled, sector, companyId, closingId, columnKey]);

  // Escuta broadcast SSE do backend
  useEffect(() => {
    const handleUpdate = (e: any) => {
      const detail = e.detail;
      if (detail && detail.type === 'PRESENCE_SYNC' && Array.isArray(detail.payload)) {
        setActiveUsers(detail.payload);
      }
    };
    window.addEventListener('app-realtime-update', handleUpdate);
    return () => window.removeEventListener('app-realtime-update', handleUpdate);
  }, []);

  // Helper para saber quem está na empresa ou célula
  const getEditorsForCompany = useCallback(
    (targetCompanyId: string) => {
      return activeUsers.filter(
        (u) => u.companyId === targetCompanyId && u.userId !== currentUserId
      );
    },
    [activeUsers, currentUserId]
  );

  const getEditorsForCell = useCallback(
    (targetCompanyId: string, targetColumnKey: string) => {
      return activeUsers.filter(
        (u) =>
          u.companyId === targetCompanyId &&
          u.columnKey === targetColumnKey &&
          u.userId !== currentUserId
      );
    },
    [activeUsers, currentUserId]
  );

  return {
    activeUsers,
    getEditorsForCompany,
    getEditorsForCell,
  };
}
