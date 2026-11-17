import { useEffect, useState } from 'react';
import { reportError } from './errorLog';
import { supabase } from './supabase';

/*
 * ¿Se están haciendo las copias de seguridad?
 *
 * El servidor guarda una copia cada noche (a las 3:00 UTC). Si la última es de hace más de dos
 * días, algo falla en el servidor, y la app lo dice en Inicio y en Ajustes → Copias de
 * seguridad para que no pase desapercibido.
 */

/** Horas sin copia a partir de las que se avisa: dos noches seguidas sin copia, con margen. */
export const STALE_HOURS = 50;

export interface BackupHealth {
  /** Días enteros desde la última copia. */
  days: number;
  stale: boolean;
}

/** Estado de las copias según la fecha de la última. Sin ninguna todavía, no hay nada que avisar. */
export function backupHealth(lastTakenAt: string | null, now: Date = new Date()): BackupHealth | null {
  if (!lastTakenAt) return null;
  const last = new Date(lastTakenAt).getTime();
  if (Number.isNaN(last)) return null;
  const hours = Math.max(0, (now.getTime() - last) / 3_600_000);
  return { days: Math.floor(hours / 24), stale: hours > STALE_HOURS };
}

/** Frase para el aviso: «hace 3 días». */
export function staleText(h: BackupHealth): string {
  return `La última copia de seguridad es de hace ${h.days} ${h.days === 1 ? 'día' : 'días'}. Se hace cada noche, así que algo falla en el servidor.`;
}

/** La más reciente de una lista de fechas (el servidor ya las da ordenadas, pero por si acaso). */
export function latest(dates: (string | null | undefined)[]): string | null {
  return dates.reduce<string | null>((max, d) => (d && (!max || d > max) ? d : max), null);
}

const REFRESH_MS = 60 * 60 * 1000;
let cached: { at: number; promise: Promise<string | null> } | null = null;

async function fetchLatest(): Promise<string | null> {
  const { data, error } = await supabase.from('backups').select('taken_at').order('taken_at', { ascending: false }).limit(1);
  if (error) {
    reportError(error, 'comprobar copias');
    return null;
  }
  return latest(((data ?? []) as { taken_at: string }[]).map((r) => r.taken_at));
}

/** Fecha de la última copia; se pregunta como mucho una vez por hora. */
export function lastBackupAt(): Promise<string | null> {
  if (!cached || Date.now() - cached.at > REFRESH_MS) {
    cached = { at: Date.now(), promise: fetchLatest().catch(() => null) };
  }
  return cached.promise;
}

/** Solo para las pruebas: olvida lo preguntado. */
export function resetBackupHealth() {
  cached = null;
}

/** Estado de las copias para enseñarlo en pantalla (null mientras carga o si todo va bien sin datos). */
export function useBackupHealth(): BackupHealth | null {
  const [health, setHealth] = useState<BackupHealth | null>(null);
  useEffect(() => {
    let alive = true;
    void lastBackupAt().then((at) => {
      if (alive) setHealth(backupHealth(at));
    });
    return () => {
      alive = false;
    };
  }, []);
  return health;
}
