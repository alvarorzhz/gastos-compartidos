import { useEffect } from 'react';

/*
 * La pantalla de carga de index.html se ve nada más abrir la app, antes de que llegue el código.
 * Se queda mientras haya alguna pantalla de carga de React montada (primero la sesión y luego los datos,
 * sin cortes entre una y otra) y se quita con un fundido cuando ya hay algo que enseñar.
 */
let mounted = 0;

function hideIfIdle() {
  if (mounted > 0) return;
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('out')) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 350);
}

/** Llamar desde la raíz de la app: quita la pantalla si lo primero que se enseña no es una carga. */
export function useHideSplash() {
  useEffect(() => {
    const t = setTimeout(hideIfIdle, 0);
    return () => clearTimeout(t);
  }, []);
}

/** Llamar desde cada pantalla de carga de React: mientras esté montada, la de index.html sigue. */
export function useKeepSplash() {
  useEffect(() => {
    mounted++;
    return () => {
      mounted--;
      setTimeout(hideIfIdle, 0);
    };
  }, []);
}
