import { useEffect, useState } from 'react';
import { toIsoDate, today } from '../lib/dates';
import { myPayKey, paymentUrl } from '../lib/payments';
import { confirmAction, Notice, Spinner, toast } from './common';
import { Icon } from './icons';

/**
 * Ajustes → Apuntar al pagar con Apple Pay: la dirección del atajo de cada persona y la guía,
 * paso a paso, para crear la automatización de Cartera en la app Atajos del iPhone.
 */
export default function ApplePaySettings() {
  // undefined = cargando; null = falta la migración 0012 en Supabase.
  const [key, setKey] = useState<{ key: string; lastUsedAt: string | null } | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    myPayKey().then((k) => alive && setKey(k), () => alive && setKey(null));
    return () => {
      alive = false;
    };
  }, []);

  const url = key ? paymentUrl(key.key) : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast('Dirección copiada. Ahora pégala en el atajo.');
    } catch {
      toast('No se ha podido copiar: mantén el dedo sobre la dirección y elige Copiar.', 'error');
    }
  }

  async function renew() {
    const ok = await confirmAction({
      title: '¿Cambiar la dirección?',
      message: 'La dirección de ahora dejará de funcionar y tendrás que pegar la nueva en el atajo del iPhone. Hazlo solo si crees que alguien más la tiene.',
      confirmLabel: 'Cambiar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      setKey(await myPayKey(true));
      setOpen(true);
      toast('Dirección nueva creada. Cópiala en el atajo.');
    } catch {
      toast('No se ha podido cambiar. Revisa la conexión.', 'error');
    }
    setBusy(false);
  }

  return (
    <section className="settings-group" aria-labelledby="set-applepay">
      <h2 id="set-applepay">Apuntar al pagar con Apple Pay</h2>
      <div className="card stack">
        <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--s3)' }}>
          <span className="icon-tile accent"><Icon name="card" /></span>
          <div className="grow stack-sm">
            <p className="row-title">Que el gasto se apunte casi solo</p>
            <p className="muted small">
              Con un atajo del iPhone, cada vez que pagues con el móvil el importe y la tienda llegan a la app. Te llega un aviso,
              lo tocas, eliges si es común o personal y confirmas. Si no tocas el aviso, te espera en Inicio. Cada uno lo configura en su iPhone.
            </p>
          </div>
        </div>

        {key === undefined && <Spinner label="Comprobando…" />}
        {key === null && <Notice icon="info">Falta un paso en Supabase para activarlo (la actualización 0012). Cuando esté, aquí verás la guía.</Notice>}

        {key && (
          <>
            {key.lastUsedAt ? (
              <Notice kind="success">Funcionando: último pago recibido {whenText(new Date(key.lastUsedAt))}.</Notice>
            ) : (
              <Notice icon="clock">Aún no ha llegado ningún pago de tu iPhone.</Notice>
            )}
            <button className={open ? 'secondary' : 'primary'} onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? 'Ocultar la guía' : key.lastUsedAt ? 'Ver cómo se configura' : 'Configurar el atajo paso a paso'}
            </button>
            {open && <Guide url={url} onCopy={() => void copy()} />}
            <button className="sm secondary" onClick={() => void renew()} disabled={busy} style={{ alignSelf: 'flex-start' }}>
              Cambiar la dirección
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function Guide({ url, onCopy }: { url: string; onCopy: () => void }) {
  return (
    <div className="stack applepay-guide">
      <Notice icon="bell">
        Para que te llegue el aviso «Toca para apuntarlo», activa también los avisos (arriba, «Avisos en el móvil»), con la app instalada.
      </Notice>
      <div className="stack-sm">
        <span className="field-label">Tu dirección (es solo tuya, no la compartas)</span>
        <code className="applepay-url">{url}</code>
        <button className="primary" onClick={onCopy}><Icon name="check" size={18} /> Copiar la dirección</button>
      </div>
      <ol className="applepay-steps small">
        <li>Abre la app <strong>Atajos</strong> del iPhone (ya viene instalada).</li>
        <li>Abajo, toca <strong>Automatización</strong>. Luego toca el <strong>+</strong> de arriba a la derecha.</li>
        <li>En la lista, busca y toca <strong>Cartera</strong>. Deja <strong>Cualquier tarjeta</strong>, <strong>Cualquier categoría</strong> y <strong>Cualquier comercio</strong>, con <strong>Automatización</strong> encendido (o <strong>Ejecutar inmediatamente</strong>) y <strong>Notificaciones</strong> apagado. Si sale el botón <strong>Siguiente</strong>, tócalo.</li>
        <li>Toca la barra <strong>Buscar</strong> de abajo (o <strong>Nueva automatización en blanco</strong> si te sale). Escribe <strong>URL</strong> y toca <strong>Obtener contenido de URL</strong> (no «Abrir URL»).</li>
        <li>Mantén el dedo sobre la palabra gris <strong>URL</strong> de la acción y elige <strong>Pegar</strong>: debe salir tu dirección, que empieza por https://.</li>
        <li>Toca la flechita de la acción para ver más opciones. En <strong>Método</strong> elige <strong>POST</strong>. En <strong>Cuerpo de la solicitud</strong> deja <strong>JSON</strong>.</li>
        <li>Toca <strong>Añadir nuevo campo</strong> → <strong>Texto</strong>. A la izquierda, donde pone <strong>Clave</strong>, escribe <code>importe</code>. Toca el hueco de la derecha y, encima del teclado, <strong>Entrada del atajo</strong>.</li>
        <li>Toca la burbuja azul <strong>Entrada del atajo</strong>. En <strong>Tipo</strong> elige <strong>Transacción</strong> y, debajo, marca <strong>Importe</strong>.</li>
        <li>Otra vez <strong>Añadir nuevo campo</strong> → <strong>Texto</strong>: clave <code>tienda</code> y, igual, <strong>Entrada del atajo</strong> → Tipo <strong>Transacción</strong> → <strong>Comercio</strong>.</li>
        <li>Sal con la flecha de arriba a la izquierda (o toca <strong>OK</strong>). ¡Listo!</li>
      </ol>
      <p className="muted small">
        Para comprobarlo, paga algo con el móvil. En unos segundos te llegará el aviso y aquí pondrá «Funcionando». Solo funciona en iPhone, con pagos de Apple Pay.
      </p>
    </div>
  );
}

function whenText(d: Date): string {
  const iso = toIsoDate(d);
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (iso === today()) return `hoy a las ${time}`;
  return `el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} a las ${time}`;
}
