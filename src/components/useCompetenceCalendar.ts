import { useEffect, useState } from 'react';
import { latestOpenPeriod } from '../config/competenceCalendar';
import { API } from '../api';

// Revalida o calendário da API sem depender de atualizar a página na virada.
export function useCompetenceCalendar() {
  const [latest, setLatest] = useState(() => latestOpenPeriod());
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch(`${API}/api/competences`);
        if (!response.ok) return;
        const data = await response.json();
        const period = new Date(data.latestOpenPeriod);
        if (active && Number.isFinite(period.getTime())) setLatest(previous => previous.getTime() === period.getTime() ? previous : period);
      } catch { /* O erro de conexão é apresentado pela própria tela. */ }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return latest;
}
