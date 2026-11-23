import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { personColor } from '../lib/couple';
import { currentSpot, locationAllowed, setLocationAllowed } from '../lib/geo';
import { formatEuros } from '../lib/money';
import { groupPlaces, placedExpenses, spotRadius, type Place } from '../lib/places';
import { EmptyState, MonthNav, Segmented, toast, type ViewProps, useMonth } from './common';

type Range = 'month' | 'all';

/** Gastos → Mapa: dónde apuntasteis los gastos y en qué sitios se os va más dinero. */
export default function MapView({ data }: ViewProps) {
  const [month, setMonth] = useMonth();
  const [range, setRange] = useState<Range>('month');
  const [allowed, setAllowed] = useState(locationAllowed);
  const placed = useMemo(() => placedExpenses(data.expenses, range === 'month' ? month : null), [data.expenses, month, range]);
  const places = useMemo(() => groupPlaces(placed, data.categories), [placed, data.categories]);
  const anyPlaced = useMemo(() => data.expenses.some((e) => typeof e.lat === 'number'), [data.expenses]);
  const mapRef = useRef<L.Map | null>(null);

  async function allow() {
    setLocationAllowed(true);
    setAllowed(true);
    const spot = await currentSpot();
    if (spot) toast('Listo: los gastos nuevos guardarán dónde estabais');
    else if (!locationAllowed()) {
      setAllowed(false);
      toast('El móvil no deja usar la ubicación. Actívala en los ajustes del móvil para esta app.', 'info', { ms: 6000 });
    }
  }

  function focus(place: Place) {
    mapRef.current?.flyTo([place.lat, place.lng], 17, { duration: 0.6 });
    document.querySelector('.spend-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <>
      <Segmented legend="Qué gastos" hideLegend value={range} onChange={setRange} options={[{ value: 'month', label: 'Un mes' }, { value: 'all', label: 'Todo' }]} />
      {range === 'month' && <MonthNav month={month} onChange={setMonth} />}

      {!anyPlaced ? (
        <EmptyState
          icon="pin"
          title="Aún no hay gastos en el mapa"
          text="Desde ahora, cada gasto nuevo que apuntéis guarda dónde estabais (si el móvil da permiso). Los fijos y los de Apple Pay no tienen sitio."
          action={!allowed && <button className="primary" onClick={allow}>Permitir la ubicación</button>}
        />
      ) : (
        <>
          {!allowed && (
            <p className="card small muted">
              En este móvil no se guarda la ubicación. <button className="link-btn" onClick={allow}>Permitirla</button>
            </p>
          )}
          <SpendMap data={data} places={places} placed={placed} mapRef={mapRef} />
          <section className="section" aria-labelledby="map-places-title">
            <div className="section-header">
              <h2 id="map-places-title">Vuestros sitios</h2>
              {places.length > 0 && <span className="muted small">{placed.length} {placed.length === 1 ? 'gasto' : 'gastos'}</span>}
            </div>
            {places.length === 0 ? (
              <p className="card muted small">Ningún gasto con sitio {range === 'month' ? 'en este mes' : 'todavía'}.</p>
            ) : (
              <ul className="card list map-places" aria-label="Sitios donde más gastáis">
                {places.slice(0, 10).map((p, i) => (
                  <li key={p.key}>
                    <button type="button" className="map-place" onClick={() => focus(p)}>
                      <span className="map-rank">{i + 1}</span>
                      <span className="grow">
                        <span className="strong">{p.name}</span>
                        <span className="muted small"> · {p.count} {p.count === 1 ? 'vez' : 'veces'}</span>
                      </span>
                      <strong className="money">{formatEuros(p.cents)}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

function SpendMap({ data, places, placed, mapRef }: {
  data: ViewProps['data'];
  places: Place[];
  placed: ReturnType<typeof placedExpenses>;
  mapRef: React.MutableRefObject<L.Map | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const map = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([40.4168, -3.7038], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix(false);
    layer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layer.current = null;
    };
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layer.current;
    if (!map || !group) return;
    group.clearLayers();
    const css = getComputedStyle(document.documentElement);
    const payerOf = (ids: string[]) => {
      // El color de quien más pagó en ese sitio.
      const byPayer = new Map<string, number>();
      for (const e of placed) if (ids.includes(e.id)) byPayer.set(e.paid_by, (byPayer.get(e.paid_by) ?? 0) + e.amount_cents);
      const top = [...byPayer.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return top ? css.getPropertyValue(`--person-${personColor(data.members, top)}`).trim() || '#3f6f4e' : '#3f6f4e';
    };
    const max = Math.max(0, ...places.map((p) => p.cents));
    for (const p of places) {
      const color = payerOf(p.expenseIds);
      L.circleMarker([p.lat, p.lng], { radius: spotRadius(p.cents, max), color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.85 })
        .bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${p.count} ${p.count === 1 ? 'vez' : 'veces'} · ${formatEuros(p.cents)}`)
        .addTo(group);
    }
    if (places.length === 1) map.setView([places[0].lat, places[0].lng], 16);
    else if (places.length > 1) map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 16 });
  }, [places, placed, data.members, mapRef]);

  return <div ref={box} className="card spend-map" role="region" aria-label="Mapa de vuestros gastos" />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
