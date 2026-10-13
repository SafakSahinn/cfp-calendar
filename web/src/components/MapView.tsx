// Harita görünümü: filtrelenmiş çağrılar, etkinlik şehrine göre kümelenmiş işaretlerle (OpenStreetMap + Leaflet).
// Leaflet ağır olduğu için bu bileşen ayrı parça olarak yalnızca "Harita" sekmesi açılınca yüklenir.

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { eventHref } from '../lib/events';
import { formatDeadline } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { EventRow } from '../lib/supabase';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export default function MapView({ events }: { events: EventRow[] }) {
  const { t, lang } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  // Aynı noktadaki çağrılar tek işarette
  const places = useMemo(() => {
    const m = new Map<string, EventRow[]>();
    for (const e of events) {
      if (e.lat == null || e.lng == null) continue;
      const k = `${e.lat.toFixed(3)},${e.lng.toFixed(3)}`;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.values()];
  }, [events]);
  const placed = places.reduce((n, p) => n + p.length, 0);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { worldCopyJump: true, minZoom: 2 }).setView([30, 10], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // markercluster eklentisi global L bekler
      (window as unknown as { L: typeof L }).L = L;
      await import('leaflet.markercluster');
      if (!alive || !map.current) return;
      layer.current?.remove();
      const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
      for (const list of places) {
        const sorted = [...list].sort((a, b) => (a.submission_deadline ?? '').localeCompare(b.submission_deadline ?? ''));
        const icon = L.divIcon({ className: 'map-pin', html: `<span>${list.length > 1 ? list.length : ''}</span>`, iconSize: [22, 22] });
        const rows = sorted.slice(0, 12).map((e) =>
          `<li><a href="${eventHref(e.id)}"><strong>${esc(e.acronym ?? '')}</strong> ${esc(e.title.slice(0, 90))}</a>` +
          `<br><small>${esc(t.deadline)}: ${esc(e.submission_deadline ? formatDeadline(e.submission_deadline, lang) : '—')}</small></li>`,
        );
        if (sorted.length > 12) rows.push(`<li><small>+${sorted.length - 12}</small></li>`);
        const marker = L.marker([list[0].lat!, list[0].lng!], { icon, title: list[0].location ?? '' });
        marker.bindPopup(`<div class="map-popup"><p>📍 ${esc(list[0].location ?? '')}</p><ul>${rows.join('')}</ul></div>`, { maxWidth: 320 });
        group.addLayer(marker);
      }
      group.addTo(map.current);
      layer.current = group;
    })();
    return () => {
      alive = false;
    };
  }, [places, t, lang]);

  return (
    <div className="map-wrap">
      <div ref={el} className="map" role="region" aria-label={t.viewMap} />
      <p className="muted small">{t.mapNote(placed, events.length)}</p>
    </div>
  );
}
