import { roundSpot, type Spot } from './places';

/** 'no' = dijisteis que no a la ubicación: no se vuelve a preguntar hasta que se active en el mapa. */
const KEY = 'gastos.ubicacion';

export function locationAllowed(): boolean {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return false;
  try {
    return localStorage.getItem(KEY) !== 'no';
  } catch {
    return true;
  }
}

export function setLocationAllowed(allowed: boolean): void {
  try {
    if (allowed) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'no');
  } catch {
    // Sin almacenamiento: se volverá a preguntar.
  }
}

/**
 * Dónde estáis ahora (redondeado), o null si no se sabe: sin permiso, sin señal o tarda mucho.
 * La primera vez el móvil pregunta si se permite.
 */
export function currentSpot(timeoutMs = 10000): Promise<Spot | null> {
  if (!locationAllowed()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(roundSpot(pos.coords.latitude, pos.coords.longitude)),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setLocationAllowed(false);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 120000 },
      );
    } catch {
      resolve(null);
    }
  });
}

/** Espera a una promesa como mucho `ms`; si no llega, null. */
export function within<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}
