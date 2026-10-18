import { useEffect, useState } from 'react';
import { toIsoDate, today } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { Notice } from './common';
import { Icon } from './icons';

interface Status {
  scheduled: boolean;
  last_run_at: string | null;
  last_notified_at: string | null;
}

/** Ajustes → Lo que la app hace sola: qué hace cada mañana y si está funcionando. */
export default function AutomationStatus() {
  const [status, setStatus] = useState<Status | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void supabase.rpc('automation_status').then(({ data, error }) => {
      if (alive) setStatus(error ? null : ((data as Status[] | null)?.[0] ?? null));
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="settings-group" aria-labelledby="set-auto">
      <h2 id="set-auto">Lo que la app hace sola</h2>
      <div className="card stack">
        <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--s3)' }}>
          <span className="icon-tile accent"><Icon name="sparkles" /></span>
          <div className="grow stack-sm">
            <p className="row-title">Cada mañana, sin abrir la app</p>
            <ul className="muted small auto-list">
              <li>Apunta los gastos fijos comunes y personales que tocan ese día.</li>
              <li>Os avisa en el móvil de lo que se ha apuntado solo.</li>
              <li>Los lunes, resumen de la semana; el día 1, cómo fue el mes y cómo queda el saldo.</li>
            </ul>
            <p className="muted small">Y al apuntar un gasto, elige la categoría, quién suele pagar y el reparto como otras veces.</p>
          </div>
        </div>
        {status !== undefined && <StatusLine status={status} />}
      </div>
    </section>
  );
}

function StatusLine({ status }: { status: Status | null }) {
  if (!status || (!status.scheduled && !status.last_run_at)) {
    return <Notice icon="info">Todavía no está activado en el servidor. Mientras tanto, los gastos fijos se apuntan al abrir la app.</Notice>;
  }
  if (!status.last_run_at) return <Notice icon="clock">Activado. Empezará mañana por la mañana.</Notice>;
  const ran = new Date(status.last_run_at);
  const ageHours = (Date.now() - ran.getTime()) / 3600000;
  const when = `${whenText(ran)} a las ${ran.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  if (ageHours > 30) return <Notice kind="warn">No trabaja desde {when}. Revisa en Supabase que el trabajo «gastos-cada-manana» siga activo.</Notice>;
  const notified = status.last_notified_at && Math.abs(new Date(status.last_notified_at).getTime() - ran.getTime()) < 3600000;
  if (!notified) return <Notice kind="warn">Los gastos fijos se apuntaron {when}, pero los avisos no salieron. Revisa la función «avisar» en Supabase.</Notice>;
  return <Notice kind="success">Funcionando: última vez {when}.</Notice>;
}

function whenText(d: Date): string {
  const iso = toIsoDate(d);
  if (iso === today()) return 'hoy';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === toIsoDate(yesterday)) return 'ayer';
  return 'el ' + d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}
