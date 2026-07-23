"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ROUTER_STORAGE_PREFIX, RouterPlan, RouterPoint } from "../router-plan";
import styles from "./ruteador.module.css";

type Coordinates = { lat: number; lng: number };

const isTitular = (point: RouterPoint) => point.selection.toUpperCase() === "T";
const isSupplement = (point: RouterPoint) => /^S\d*$/.test(point.selection.toUpperCase());
const hasCoordinates = (point: RouterPoint): point is RouterPoint & Coordinates => point.lat !== null && point.lng !== null;
const coordinatesOf = (point: RouterPoint): Coordinates | null => hasCoordinates(point) ? { lat: point.lat, lng: point.lng } : null;
const escapeHtml = (entry: unknown) => String(entry ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);

const distanceKm = (a: Coordinates, b: Coordinates) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(b.lat - a.lat);
  const deltaLng = radians(b.lng - a.lng);
  const latA = radians(a.lat);
  const latB = radians(b.lat);
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const optimizeRoute = (points: RouterPoint[], startKey: string) => {
  const start = points.find((point) => point.key === startKey);
  if (!start) return [];
  const ordered = [start];
  const remaining = points.filter((point) => point.key !== start.key);
  let current = start;

  while (remaining.length) {
    const currentCoordinates = coordinatesOf(current);
    const candidates = currentCoordinates ? remaining.filter(hasCoordinates) : [];
    if (!candidates.length) {
      ordered.push(...remaining.sort((a, b) => a.name.localeCompare(b.name)));
      break;
    }
    let nearest = candidates[0];
    let nearestDistance = distanceKm(currentCoordinates!, coordinatesOf(nearest)!);
    for (const candidate of candidates.slice(1)) {
      const candidateDistance = distanceKm(currentCoordinates!, coordinatesOf(candidate)!);
      if (candidateDistance < nearestDistance) {
        nearest = candidate;
        nearestDistance = candidateDistance;
      }
    }
    ordered.push(nearest);
    remaining.splice(remaining.findIndex((point) => point.key === nearest.key), 1);
    current = nearest;
  }
  return ordered;
};

const mapChunks = (points: RouterPoint[]) => {
  const mapped = points.filter(hasCoordinates);
  if (mapped.length <= 25) return mapped.length ? [mapped] : [];
  const chunks: RouterPoint[][] = [];
  let offset = 0;
  while (offset < mapped.length) {
    const chunk = mapped.slice(offset, offset + 25);
    chunks.push(chunk);
    if (offset + 25 >= mapped.length) break;
    offset += 24;
  }
  return chunks;
};

const mapsRouteUrl = (points: RouterPoint[]) => {
  const coordinates = points.map(coordinatesOf).filter((point): point is Coordinates => Boolean(point));
  if (!coordinates.length) return "https://www.google.com/maps";
  if (coordinates.length === 1) return `https://www.google.com/maps/search/?api=1&query=${coordinates[0].lat},${coordinates[0].lng}`;
  const print = (point: Coordinates) => `${point.lat},${point.lng}`;
  const params = new URLSearchParams({
    api: "1",
    origin: print(coordinates[0]),
    destination: print(coordinates[coordinates.length - 1]),
    travelmode: "driving",
  });
  if (coordinates.length > 2) params.set("waypoints", coordinates.slice(1, -1).map(print).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

const pointMapsUrl = (point: RouterPoint) => {
  const coordinates = coordinatesOf(point);
  return coordinates ? `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}` : "https://www.google.com/maps";
};

function PlannerMap({
  points,
  ordered,
  startKey,
  supplementalKeys,
  userLocation,
  onSelectStart,
  onToggleSupplement,
}: {
  points: RouterPoint[];
  ordered: RouterPoint[];
  startKey: string;
  supplementalKeys: string[];
  userLocation: Coordinates | null;
  onSelectStart: (key: string) => void;
  onToggleSupplement: (key: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const orderByKey = useMemo(() => new Map(ordered.map((point, index) => [point.key, index + 1])), [ordered]);
  const signature = points.map((point) => `${point.key}:${point.lat},${point.lng}:${point.selection}:${point.fixed}`).join("|") + `|${startKey}|${supplementalKeys.join(",")}|${userLocation?.lat ?? ""},${userLocation?.lng ?? ""}`;

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let routeMap: import("leaflet").Map | null = null;

    void import("leaflet").then((L) => {
      if (disposed || !containerRef.current) return;
      routeMap = L.map(containerRef.current, { zoomControl: true, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(routeMap);

      const bounds: [number, number][] = [];
      points.forEach((point) => {
        const coordinates = coordinatesOf(point);
        if (!coordinates || !routeMap) return;
        const titular = isTitular(point);
        const selectedSupplement = supplementalKeys.includes(point.key);
        const order = orderByKey.get(point.key);
        const markerLabel = order ? String(order) : titular ? "T" : point.selection || "S";
        const background = point.key === startKey ? "#0b8f69" : titular ? "#1267d9" : selectedSupplement ? "#7354d6" : "#9b8fc0";
        const ring = point.fixed ? "#f08a24" : "#ffffff";
        const opacity = titular || selectedSupplement ? "1" : ".72";
        const icon = L.divIcon({
          className: "router-marker-shell",
          html: `<span style="width:34px;height:34px;border:3px solid ${ring};border-radius:50%;display:grid;place-items:center;background:${background};color:white;font:800 10px Arial;box-shadow:0 4px 12px #123d6a66;opacity:${opacity}">${escapeHtml(markerLabel)}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const instruction = titular ? "Haz clic para iniciar aquí" : selectedSupplement ? "Haz clic para quitarlo" : "Haz clic para agregarlo como suplente";
        const marker = L.marker([coordinates.lat, coordinates.lng], { icon })
          .addTo(routeMap)
          .bindTooltip(escapeHtml(point.name), { direction: "top", offset: [0, -17] })
          .bindPopup(`<strong>${escapeHtml(point.name)}</strong><br><span>${escapeHtml(point.selection)} · ${point.fixed ? "PDV fijo" : "PDV no fijo"}</span><br><small>${instruction}</small>`);
        marker.on("click", () => titular ? onSelectStart(point.key) : onToggleSupplement(point.key));
        bounds.push([coordinates.lat, coordinates.lng]);
      });

      const routeCoordinates = ordered.map(coordinatesOf).filter((point): point is Coordinates => Boolean(point));
      if (routeCoordinates.length > 1) {
        L.polyline(routeCoordinates.map((point) => [point.lat, point.lng]), { color: "#1767d3", weight: 4, opacity: .72, dashArray: "8 7" }).addTo(routeMap);
      }
      if (userLocation) {
        L.circleMarker([userLocation.lat, userLocation.lng], { radius: 9, color: "#ffffff", weight: 3, fillColor: "#10a37f", fillOpacity: 1 })
          .addTo(routeMap)
          .bindPopup("<strong>Tu ubicación actual</strong>");
        bounds.push([userLocation.lat, userLocation.lng]);
      }
      if (bounds.length === 1) routeMap.setView(bounds[0], 16);
      else if (bounds.length > 1) routeMap.fitBounds(bounds, { padding: [44, 44], maxZoom: 16 });
      else routeMap.setView([18.7357, -70.1627], 8);
    });

    return () => {
      disposed = true;
      routeMap?.remove();
    };
  }, [signature, orderByKey, onSelectStart, onToggleSupplement, ordered, points, startKey, supplementalKeys, userLocation]);

  return <div ref={containerRef} className={styles.mapCanvas} aria-label="Mapa para escoger el inicio y revisar el recorrido" />;
}

export default function AuditorRouterPage() {
  const [plan, setPlan] = useState<RouterPlan | null | undefined>(undefined);
  const [startKey, setStartKey] = useState("");
  const [supplementalKeys, setSupplementalKeys] = useState<string[]>([]);
  const [showSupplements, setShowSupplements] = useState(false);
  const [search, setSearch] = useState("");
  const [supplementSearch, setSupplementSearch] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storageKey = new URLSearchParams(window.location.search).get("plan");
      if (!storageKey || !storageKey.startsWith(ROUTER_STORAGE_PREFIX)) {
        setPlan(null);
        return;
      }
      try {
        const stored = window.localStorage.getItem(storageKey);
        setPlan(stored ? JSON.parse(stored) as RouterPlan : null);
      } catch {
        setPlan(null);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const titulars = useMemo(() => plan?.points.filter(isTitular) ?? [], [plan]);
  const supplements = useMemo(() => plan?.points.filter(isSupplement) ?? [], [plan]);
  const activePoints = useMemo(() => [...titulars, ...supplements.filter((point) => supplementalKeys.includes(point.key))], [supplementalKeys, supplements, titulars]);
  const ordered = useMemo(() => optimizeRoute(activePoints, startKey), [activePoints, startKey]);
  const startPoint = activePoints.find((point) => point.key === startKey);
  const chunks = useMemo(() => mapChunks(ordered), [ordered]);
  const totalDistance = useMemo(() => ordered.slice(1).reduce((total, point, index) => {
    const previous = coordinatesOf(ordered[index]);
    const current = coordinatesOf(point);
    return previous && current ? total + distanceKm(previous, current) : total;
  }, 0), [ordered]);
  const filteredTitulars = useMemo(() => {
    const term = search.trim().toLowerCase();
    return titulars.filter((point) => `${point.name} ${point.id} ${point.route} ${point.channel}`.toLowerCase().includes(term));
  }, [search, titulars]);
  const filteredSupplements = useMemo(() => {
    const term = supplementSearch.trim().toLowerCase();
    return supplements.filter((point) => `${point.name} ${point.id} ${point.route} ${point.channel}`.toLowerCase().includes(term));
  }, [supplementSearch, supplements]);

  const selectStart = useCallback((key: string) => {
    const point = titulars.find((candidate) => candidate.key === key);
    if (!point || !hasCoordinates(point)) return;
    setStartKey(key);
  }, [titulars]);

  const toggleSupplement = useCallback((key: string) => {
    setSupplementalKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }, []);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Este dispositivo no permite consultar la ubicación.");
      return;
    }
    setLocationStatus("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition((position) => {
      const current = { lat: position.coords.latitude, lng: position.coords.longitude };
      setUserLocation(current);
      const candidates = titulars.filter(hasCoordinates);
      if (!candidates.length) {
        setLocationStatus("No hay titulares con coordenadas para sugerir un inicio.");
        return;
      }
      const nearest = candidates.reduce((best, point) => distanceKm(current, coordinatesOf(point)!) < distanceKm(current, coordinatesOf(best)!) ? point : best);
      setStartKey(nearest.key);
      setLocationStatus(`Inicio sugerido: ${nearest.name}. Puedes cambiarlo en el mapa o la lista.`);
    }, () => setLocationStatus("No fue posible obtener tu ubicación. Puedes elegir el inicio manualmente."), { enableHighAccuracy: true, timeout: 12000 });
  };

  if (plan === undefined) return <main className={styles.statePage}><div className={styles.loader}></div><p>Preparando tus puntos…</p></main>;
  if (!plan) return <main className={styles.statePage}><img src="/dn-logo.jpg" alt="Dichter & Neira"/><h1>No encontramos esta ruta</h1><p>Vuelve al detalle del auditor y presiona <b>Ruteador</b> nuevamente.</p><button onClick={() => window.close()}>Cerrar pestaña</button></main>;

  return <main className={styles.routerPage}>
    <header className={styles.header}>
      <div className={styles.brand}><img src="/dn-logo.jpg" alt="Dichter & Neira"/><span><b>Ruteador</b><small>planeación</small></span></div>
      <div className={styles.auditor}>
        <span>RUTA DEL AUDITOR</span>
        <h1>{plan.auditor}</h1>
        <p>{plan.country} · {titulars.length} titulares · {supplements.length} suplentes disponibles</p>
      </div>
      <button className={styles.closeButton} onClick={() => window.close()}>Cerrar pestaña ×</button>
    </header>

    <section className={styles.summary}>
      <div><span>1</span><p><b>Escoge el inicio</b><small>En el mapa o en la lista</small></p></div>
      <i></i>
      <div className={startKey ? styles.ready : ""}><span>2</span><p><b>Revisa el orden</b><small>Calculado por cercanía</small></p></div>
      <i></i>
      <div className={startKey ? styles.ready : ""}><span>3</span><p><b>Abre la ruta</b><small>Google Maps te guiará</small></p></div>
    </section>

    <section className={styles.workspace}>
      <div className={styles.mapPanel}>
        <PlannerMap
          points={plan.points}
          ordered={ordered}
          startKey={startKey}
          supplementalKeys={supplementalKeys}
          userLocation={userLocation}
          onSelectStart={selectStart}
          onToggleSupplement={toggleSupplement}
        />
        <div className={styles.mapLegend}>
          <b>Mapa de puntos</b>
          <span><i className={styles.tDot}></i>Titular <i className={styles.sDot}></i>Suplente <i className={styles.fixedRing}></i>Aro naranja: fijo</span>
          <small>{startKey ? "Los números muestran el orden recomendado." : "Toca un titular para elegirlo como inicio."}</small>
        </div>
        <button className={styles.locationButton} onClick={useCurrentLocation}>⌖ Usar mi ubicación</button>
      </div>

      <aside className={styles.plannerPanel}>
        {!startPoint ? <>
          <div className={styles.panelIntro}><span>PASO 1</span><h2>¿Con cuál punto deseas iniciar?</h2><p>Elige un titular con coordenadas. A partir de ese punto ordenaremos los demás por cercanía.</p></div>
          <button className={styles.gpsButton} onClick={useCurrentLocation}>⌖ Sugerir el más cercano a mí</button>
          {locationStatus && <p className={styles.locationStatus}>{locationStatus}</p>}
          <label className={styles.search}><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar titular por nombre, código o ruta"/></label>
          <div className={styles.startList}>{filteredTitulars.map((point) => <button key={point.key} disabled={!hasCoordinates(point)} onClick={() => selectStart(point.key)}>
            <i className={point.fixed ? styles.fixedPoint : styles.regularPoint}>T</i>
            <span><b>{point.name}</b><small>{point.id} · Ruta {point.route || "—"} · {point.channel || "Sin canal"}</small></span>
            <em>{hasCoordinates(point) ? "Iniciar aquí →" : "Sin coordenadas"}</em>
          </button>)}</div>
        </> : <>
          <div className={styles.routeHead}>
            <div><span>RUTA RECOMENDADA</span><h2>{ordered.length} puntos en orden</h2><p>Inicio: <b>{startPoint.name}</b></p></div>
            <button onClick={() => setStartKey("")}>Cambiar inicio</button>
          </div>
          {locationStatus && <p className={styles.locationStatus}>{locationStatus}</p>}
          <div className={styles.routeStats}><div><b>{titulars.length}</b><small>Titulares</small></div><div><b>{supplementalKeys.length}</b><small>Suplentes agregados</small></div><div><b>{totalDistance.toFixed(1)} km</b><small>Distancia aproximada</small></div></div>
          <div className={styles.routeActions}>
            {chunks.map((chunk, index) => <a href={mapsRouteUrl(chunk)} target="_blank" rel="noreferrer" key={index}>{chunks.length === 1 ? "Abrir ruta en Google Maps" : `Abrir tramo ${index + 1} en Maps`} ↗</a>)}
            <button onClick={() => setShowSupplements(true)}>+ Agregar suplente <b>{supplementalKeys.length || ""}</b></button>
          </div>
          <p className={styles.routeNote}>El orden se calcula por proximidad geográfica. Google Maps aplica las calles y el tráfico al abrir la ruta.</p>
          <div className={styles.itinerary}>{ordered.map((point, index) => <article key={point.key}>
            <span className={isTitular(point) ? styles.itineraryT : styles.itineraryS}>{index + 1}</span>
            <div><b>{point.name}</b><small>{point.id} · {isTitular(point) ? "Titular" : `Suplente ${point.selection}`} · {point.fixed ? "Fijo" : "No fijo"}</small></div>
            {index === 0 && <em>INICIO</em>}
            {isSupplement(point) && <button onClick={() => toggleSupplement(point.key)} aria-label={`Quitar ${point.name}`}>×</button>}
            <a href={pointMapsUrl(point)} target="_blank" rel="noreferrer" aria-label={`Ver ${point.name} en Google Maps`}>⌖</a>
          </article>)}</div>
        </>}
      </aside>
    </section>

    {showSupplements && <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Agregar suplentes a la ruta">
      <section>
        <header><div><span>RESPALDO DE LA RUTA</span><h2>Agregar suplentes</h2><p>Solo se incorporarán a la ruta los puntos que selecciones.</p></div><button onClick={() => setShowSupplements(false)}>×</button></header>
        <label className={styles.search}><span>⌕</span><input autoFocus value={supplementSearch} onChange={(event) => setSupplementSearch(event.target.value)} placeholder="Buscar suplente por nombre, código o ruta"/></label>
        <div className={styles.supplementList}>{filteredSupplements.map((point) => {
          const selected = supplementalKeys.includes(point.key);
          return <button className={selected ? styles.selectedSupplement : ""} key={point.key} onClick={() => toggleSupplement(point.key)}>
            <i>S</i><span><b>{point.name}</b><small>{point.id} · {point.selection} · Ruta {point.route || "—"}</small></span><em>{selected ? "✓ Agregado" : "+ Agregar"}</em>
          </button>;
        })}{!filteredSupplements.length && <p>No hay suplentes que coincidan con la búsqueda.</p>}</div>
        <footer><span>{supplementalKeys.length} suplente(s) en la ruta</span><button onClick={() => setShowSupplements(false)}>Aplicar y recalcular</button></footer>
      </section>
    </div>}
  </main>;
}
