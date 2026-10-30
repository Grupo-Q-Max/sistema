import { useEffect, useState } from 'react';
import { latestOpenPeriod } from '../config/competenceCalendar';
import { API } from '../api';

let cachedLatest: Date | null = null;
let cachedAt = 0;
let inFlight: Promise<Date | null> | null = null;

async function fetchLatestCompetence(force = false): Promise<Date | null> {
  const now = Date.now();
  if (!force && cachedLatest && now - cachedAt < 30_000) {
    return cachedLatest;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch(`${API}/api/competences`);
      if (!response.ok) return cachedLatest;
      const data = await response.json();
      const period = new Date(data.latestOpenPeriod);
      if (Number.isFinite(period.getTime())) {
        cachedLatest = period;
        cachedAt = Date.now();
      }
      return cachedLatest;
    } catch {
      return cachedLatest;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// Revalida o calendário da API com cache compartilhado entre todas as telas (evita requisições repetidas ao trocar de aba).
export function useCompetenceCalendar() {
  const [latest, setLatest] = useState<Date>(() => cachedLatest || latestOpenPeriod());
  useEffect(() => {
    let active = true;
    async function refresh(force = false) {
      const period = await fetchLatestCompetence(force);
      if (active && period) {
        setLatest(previous => previous.getTime() === period.getTime() ? previous : period);
      }
    }
    void refresh(false);
    const timer = window.setInterval(() => { void refresh(true); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return latest;
}
