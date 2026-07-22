"use client";

import { ChangeEvent, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Row = Record<string, string | number | null | undefined>;
type ExportFile = { name: string; rows: Row[] };

const demoRows: Row[] = [
  { "ID cliente/PDV": "159155", "NAME Cliente (PDV)": "Comercial Raúl 2", DIRECCIÓN: "Centro de Haina", "TIPO CLIENTE ICE (D&N)": "HOME MARKET TRADICIONAL", "CLIENTE FIJO 30%": "NO", SELECCION: "T", TIPO: "T", DIA: 5, "Tabla11.auditor": "ARILEYSIS", "MUESTRA CUMPL.": "Cargar", "export.Estado": "Aprobada", LATITUD: 18.42038155, LONGITUD: -70.0312729 },
  { "ID cliente/PDV": "159200", "NAME Cliente (PDV)": "Colmado La Estrella", DIRECCIÓN: "Los Alcarrizos", "TIPO CLIENTE ICE (D&N)": "TRADICIONAL", "CLIENTE FIJO 30%": "SI", SELECCION: "S", TIPO: "S", DIA: 5, "Tabla11.auditor": "ARILEYSIS", "MUESTRA CUMPL.": "Cargar", "export.Estado": "", LATITUD: 18.512, LONGITUD: -70.01 },
  { "ID cliente/PDV": "160001", "NAME Cliente (PDV)": "Mini Market K&L", DIRECCIÓN: "Santo Domingo Oeste", "TIPO CLIENTE ICE (D&N)": "ON PREMISE", "CLIENTE FIJO 30%": "NO", SELECCION: "T", TIPO: "T", DIA: 5, "Tabla11.auditor": "ARILEYSIS", "MUESTRA CUMPL.": "Cargar", "export.Estado": "", LATITUD: 18.49, LONGITUD: -69.96 },
  { "ID cliente/PDV": "160145", "NAME Cliente (PDV)": "Bodega Santa Ana", DIRECCIÓN: "San Cristóbal", "TIPO CLIENTE ICE (D&N)": "TRADICIONAL", "CLIENTE FIJO 30%": "NO", SELECCION: "S", TIPO: "S", DIA: 5, "Tabla11.auditor": "ARILEYSIS", "MUESTRA CUMPL.": "Cargar", "export.Estado": "", LATITUD: 18.41, LONGITUD: -70.1 },
  { "ID cliente/PDV": "160300", "NAME Cliente (PDV)": "Café La Plaza", DIRECCIÓN: "Piantini", "TIPO CLIENTE ICE (D&N)": "ON PREMISE", "CLIENTE FIJO 30%": "SI", SELECCION: "T", TIPO: "T", DIA: 5, "Tabla11.auditor": "MARIANA", "MUESTRA CUMPL.": "Cargar", "export.Estado": "Aprobada", LATITUD: 18.47, LONGITUD: -69.93 },
  { "ID cliente/PDV": "160322", "NAME Cliente (PDV)": "Colmado Don Pepe", DIRECCIÓN: "Villa Mella", "TIPO CLIENTE ICE (D&N)": "TRADICIONAL", "CLIENTE FIJO 30%": "NO", SELECCION: "S", TIPO: "S", DIA: 5, "Tabla11.auditor": "MARIANA", "MUESTRA CUMPL.": "Cargar", "export.Estado": "", LATITUD: 18.55, LONGITUD: -69.92 },
  { "ID cliente/PDV": "160410", "NAME Cliente (PDV)": "Supermercado Omega", DIRECCIÓN: "Santo Domingo Este", "TIPO CLIENTE ICE (D&N)": "MODERNO", "CLIENTE FIJO 30%": "NO", SELECCION: "T", TIPO: "T", DIA: 6, "Tabla11.auditor": "MARIANA", "MUESTRA CUMPL.": "Cargar", "export.Estado": "", LATITUD: 18.49, LONGITUD: -69.84 },
  { "ID cliente/PDV": "160500", "NAME Cliente (PDV)": "Restaurante El Patio", DIRECCIÓN: "Naco", "TIPO CLIENTE ICE (D&N)": "ON PREMISE", "CLIENTE FIJO 30%": "SI", SELECCION: "S", TIPO: "S", DIA: 5, "Tabla11.auditor": "MARIANA", "MUESTRA CUMPL.": "Cargar", "export.Estado": "", LATITUD: 18.48, LONGITUD: -69.94 },
  { "ID cliente/PDV": "160670", "NAME Cliente (PDV)": "Colmado La 27", DIRECCIÓN: "Santo Domingo", "TIPO CLIENTE ICE (D&N)": "TRADICIONAL", "CLIENTE FIJO 30%": "NO", SELECCION: "T", TIPO: "T", DIA: 5, "Tabla11.auditor": "JOSÉ", "MUESTRA CUMPL.": "Cargar", "export.Estado": "", LATITUD: 18.46, LONGITUD: -69.9 },
  { "ID cliente/PDV": "160700", "NAME Cliente (PDV)": "Bar El Faro", DIRECCIÓN: "Boca Chica", "TIPO CLIENTE ICE (D&N)": "ON PREMISE", "CLIENTE FIJO 30%": "NO", SELECCION: "S", TIPO: "S", DIA: 5, "Tabla11.auditor": "JOSÉ", "MUESTRA CUMPL.": "Cargar", "export.Estado": "Aprobada", LATITUD: 18.45, LONGITUD: -69.61 },
];

const value = (row: Row, names: string[]) => {
  const key = Object.keys(row).find((header) => names.some((name) => header.trim().toLowerCase() === name.toLowerCase()));
  return key ? String(row[key] ?? "").trim() : "";
};
const dayOf = (row: Row) => Number(value(row, ["DIA", "Dia_Asignado"])) || 0;
const idOf = (row: Row) => value(row, ["ID cliente/PDV", "Codigo DN", "CODIGO D&N"]);
const auditorOf = (row: Row) => value(row, ["Tabla11.auditor", "auditor"]);
const selectedOf = (row: Row) => value(row, ["SELECCION"]);
const fixedOf = (row: Row) => value(row, ["CLIENTE FIJO 30%"]);
const statusOf = (row: Row) => value(row, ["export.Estado"]);
const nameOf = (row: Row) => value(row, ["NAME Cliente (PDV)", "Nombre"]);
const channelOf = (row: Row) => value(row, ["TIPO CLIENTE ICE (D&N)", "SUB CANAL", "TIPO"]);
const pointTypeOf = (row: Row) => value(row, ["TIPO"]);
const shouldLoad = (row: Row) => value(row, ["MUESTRA CUMPL."]).toLowerCase() === "cargar";
const csvEscape = (entry: unknown) => `"${String(entry ?? "").replaceAll('"', '""')}"`;
const toCsv = (rows: Row[]) => {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
};
const downloadCsv = (file: ExportFile) => {
  const href = URL.createObjectURL(new Blob(["\uFEFF" + toCsv(file.rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = href; link.download = file.name; link.click(); URL.revokeObjectURL(href);
};

export default function Home() {
  const [rows, setRows] = useState<Row[]>(demoRows);
  const [sourceName, setSourceName] = useState("Vista demostración · República Dominicana");
  const [day, setDay] = useState(5);
  const [tab, setTab] = useState<"inicio" | "rutas" | "dashboard" | "base">("inicio");
  const [role, setRole] = useState<"Administrador" | "Campo">("Administrador");
  const [country, setCountry] = useState("República Dominicana");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [exports, setExports] = useState<ExportFile[]>([]);
  const [notice, setNotice] = useState("");
  const [mapLink, setMapLink] = useState("");

  const scheduled = useMemo(() => rows.filter((row) => dayOf(row) === day), [day, rows]);
  const extras = useMemo(() => rows.filter((row) => extraIds.includes(idOf(row))), [extraIds, rows]);
  const filteredPoints = useMemo(() => rows.filter((row) => {
    const haystack = `${idOf(row)} ${nameOf(row)} ${auditorOf(row)} ${channelOf(row)}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && dayOf(row) !== day;
  }), [rows, search, day]);
  const visits = scheduled.filter((row) => Boolean(statusOf(row)));
  const completion = scheduled.length ? Math.round((visits.length / scheduled.length) * 100) : 0;
  const auditorProgress = useMemo(() => Array.from(new Set(scheduled.map(auditorOf).filter(Boolean))).map((auditor) => {
    const points = scheduled.filter((row) => auditorOf(row) === auditor);
    const done = points.filter((row) => Boolean(statusOf(row))).length;
    return { auditor, total: points.length, done, pending: points.length - done };
  }), [scheduled]);
  const bySelection = useMemo(() => ["T", "S"].map((selection) => {
    const points = scheduled.filter((row) => selectedOf(row) === selection);
    return { selection, total: points.length, done: points.filter((row) => Boolean(statusOf(row))).length };
  }), [scheduled]);

  const loadWorkbook = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const universe = workbook.Sheets[workbook.SheetNames.find((name) => name.trim().toUpperCase() === "UNIVERSO") ?? ""];
      if (!universe) throw new Error("No se encontró la hoja UNIVERSO.");
      const loaded = XLSX.utils.sheet_to_json<Row>(universe, { defval: "" });
      if (!loaded.length) throw new Error("UNIVERSO no tiene puntos para cargar.");
      setRows(loaded); setSourceName(file.name); setExports([]); setExtraIds([]);
      const firstDay = dayOf(loaded[0]); if (firstDay) setDay(firstDay);
      setNotice(`${loaded.length.toLocaleString("es-DO")} PDV cargados correctamente.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "No fue posible leer el Excel."); }
  };

  const createRoutes = () => {
    const base = rows.filter((row) => shouldLoad(row) && !statusOf(row) && dayOf(row) <= day);
    const all = [...base, ...extras.filter((row) => !base.some((baseRow) => idOf(baseRow) === idOf(row)))];
    const files: ExportFile[] = [];
    for (const auditor of Array.from(new Set(all.map(auditorOf).filter(Boolean)))) {
      const perAuditor = all.filter((row) => auditorOf(row) === auditor);
      const t = perAuditor.filter((row) => pointTypeOf(row) === "T");
      const s = perAuditor.filter((row) => pointTypeOf(row) === "S");
      const segments: [string, Row[]][] = [
        ["T", t], ["T_ON", t.filter((row) => channelOf(row).toUpperCase() === "ON PREMISE")], ["T_FIJOS", t.filter((row) => fixedOf(row).toUpperCase() === "SI")],
        ["S", s], ["S_FIJOS", s.filter((row) => fixedOf(row).toUpperCase() === "SI")],
      ];
      segments.filter(([, points]) => points.length).forEach(([segment, points]) => files.push({ name: `${auditor}_${segment}.csv`, rows: points }));
    }
    setExports(files); setTab("rutas"); setNotice(`${files.length} archivos CSV listos para el día ${day}. ${extras.length ? `${extras.length} excepción(es) incluida(s).` : ""}`);
  };

  const toggleExtra = (id: string) => setExtraIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const fieldMode = role === "Administrador";

  return <main>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">↗</span><span>Ruta<span>Viva</span></span></div>
      <p className="workspace-label">OPERACIÓN DE CAMPO</p>
      <nav>
        <button className={tab === "inicio" ? "nav active" : "nav"} onClick={() => setTab("inicio")}><i>⌂</i> Resumen</button>
        <button className={tab === "rutas" ? "nav active" : "nav"} onClick={() => setTab("rutas")}><i>⌁</i> Rutas diarias</button>
        <button className={tab === "dashboard" ? "nav active" : "nav"} onClick={() => setTab("dashboard")}><i>◔</i> Dashboard</button>
        {fieldMode && <button className={tab === "base" ? "nav active" : "nav"} onClick={() => setTab("base")}><i>▣</i> Base de datos</button>}
      </nav>
      <div className="sidebar-footer"><div className="avatar">MV</div><div><strong>María Valdez</strong><small>{role}</small></div><button className="more">•••</button></div>
    </aside>
    <section className="app-shell">
      <header className="topbar"><div className="crumb"><span>Ruteador</span><b>/</b><strong>{tab === "inicio" ? "Resumen operativo" : tab[0].toUpperCase() + tab.slice(1)}</strong></div><div className="top-actions"><span className="sync"><b></b> Base al día</span><select aria-label="Modo de acceso" value={role} onChange={(event) => { setRole(event.target.value as "Administrador" | "Campo"); if (event.target.value === "Campo" && tab === "base") setTab("inicio"); }}><option>Administrador</option><option>Campo</option></select></div></header>
      <div className="content">
        {notice && <div className="notice"><span>✓</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}
        {tab === "inicio" && <>
          <section className="hero"><div><p className="eyebrow">OPERACIÓN EN VIVO <span></span> DÍA {day}</p><h1>El día de campo,<br/><em>listo para avanzar.</em></h1><p className="hero-copy">Genera las rutas de tus auditores, incorpora solicitudes de última hora y sigue el avance de cada visita desde una sola base.</p><div className="hero-actions"><button className="button primary" onClick={() => setTab("rutas")}>Preparar rutas <span>→</span></button><button className="text-button" onClick={() => setTab("dashboard")}>Ver avance <span>↗</span></button></div></div><div className="route-graphic"><div className="route-line one"></div><div className="route-line two"></div><div className="route-line three"></div><div className="pin pin-a">●</div><div className="pin pin-b">●</div><div className="pin pin-c">●</div><div className="graphic-card"><span>VISITAS HOY</span><strong>{visits.length}<small> / {scheduled.length}</small></strong><b>{completion}% completo</b></div></div></section>
          <section className="metrics"><Metric label="Programados hoy" value={scheduled.length} change={`${auditorProgress.length} auditores activos`} tone="blue" icon="⌖"/><Metric label="Visitas completadas" value={visits.length} change={`${completion}% del plan`} tone="mint" icon="✓"/><Metric label="Pendientes" value={scheduled.length - visits.length} change="Por confirmar" tone="orange" icon="◷"/><Metric label="PDV fijos" value={scheduled.filter((row) => fixedOf(row).toUpperCase() === "SI").length} change="En la ruta de hoy" tone="purple" icon="◆"/></section>
          <section className="two-col"><article className="panel progress-panel"><div className="panel-head"><div><p className="eyebrow">AVANCE GENERAL</p><h2>Cumplimiento de hoy</h2></div><button className="mini-link" onClick={() => setTab("dashboard")}>Ver detalle →</button></div><div className="completion"><div className="donut" style={{ "--progress": `${completion * 3.6}deg` } as React.CSSProperties}><div><b>{completion}%</b><small>completado</small></div></div><div className="progress-list">{auditorProgress.slice(0, 3).map((item) => <div className="progress-row" key={item.auditor}><span className="person-dot">{item.auditor.slice(0, 1)}</span><div><strong>{item.auditor}</strong><small>{item.done} visitados · {item.pending} pendientes</small></div><b>{item.total ? Math.round(item.done / item.total * 100) : 0}%</b></div>)}</div></div></article><article className="panel map-preview"><div className="panel-head"><div><p className="eyebrow">MAPA DEL DÍA</p><h2>Rutas segmentadas</h2></div><button className="mini-link" onClick={() => setTab("rutas")}>Abrir rutas →</button></div><div className="map-grid"><span className="street s1"></span><span className="street s2"></span><span className="street s3"></span><span className="map-pin p1">●</span><span className="map-pin p2">●</span><span className="map-pin p3">●</span><span className="map-pin p4">●</span><div className="map-legend"><b><i></i> Selección T</b><b><i></i> Selección S</b></div></div></article></section>
        </>}
        {tab === "rutas" && <section className="routes-view"><div className="page-heading"><div><p className="eyebrow">PLANIFICADOR DE RUTAS</p><h1>Prepara la operación de campo</h1><p>El motor replica la estructura de la macro: auditor, tipo, ON PREMISE y PDV fijo.</p></div><div className="date-chip">Día de campo <strong>{day}</strong></div></div><div className="route-controls panel"><div className="control"><label>País</label><select value={country} onChange={(event) => setCountry(event.target.value)}><option>República Dominicana</option><option disabled>Colombia · próximamente</option><option disabled>Guatemala · próximamente</option></select></div><div className="control small"><label>Día de campo</label><input type="number" min="1" max="31" value={day} onChange={(event) => setDay(Number(event.target.value) || 1)}/></div><div className="control source"><label>Base activa</label><strong>▣ {sourceName}</strong><small>{rows.length.toLocaleString("es-DO")} PDV disponibles</small></div><button className="button primary generate" onClick={createRoutes}>Cargar rutas <span>→</span></button></div><div className="route-body"><article className="panel exceptions"><div className="panel-head"><div><p className="eyebrow">SOLICITUDES ESPECIALES</p><h2>PDV fuera del día</h2><p>Selecciona puntos que el cliente pidió atender antes de su fecha programada.</p></div><span className="counter">{extraIds.length} elegidos</span></div><div className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por PDV, auditor o canal"/></div><div className="point-list">{filteredPoints.slice(0, 7).map((row) => { const id = idOf(row); const checked = extraIds.includes(id); return <button key={id} className={checked ? "point checked" : "point"} onClick={() => toggleExtra(id)}><span className="check">{checked ? "✓" : ""}</span><span><strong>{nameOf(row)}</strong><small>{id} · Día {dayOf(row)} · {auditorOf(row)}</small></span><em>{selectedOf(row) || "—"}</em></button>; })}{!filteredPoints.length && <p className="empty">No hay otros PDV que coincidan con la búsqueda.</p>}</div></article><article className="panel export-panel"><div className="panel-head"><div><p className="eyebrow">ENTREGABLES</p><h2>CSV para Google My Maps</h2><p>Un archivo por auditor y segmento, listo para importar.</p></div></div>{exports.length ? <><div className="export-summary"><span>✓</span><div><strong>{exports.length} archivos generados</strong><small>Rutas del día {day} · {country}</small></div><button className="button secondary" onClick={() => exports.forEach(downloadCsv)}>Descargar todos</button></div><div className="file-list">{exports.map((file) => <button key={file.name} className="file" onClick={() => downloadCsv(file)}><span>CSV</span><div><strong>{file.name}</strong><small>{file.rows.length} puntos</small></div><b>↓</b></button>)}</div></> : <div className="empty-export"><span>↥</span><strong>Tus archivos aparecerán aquí</strong><p>Define el día y presiona <b>“Cargar rutas”</b> para preparar los CSV.</p></div>}<div className="map-link"><div><span>⌖</span><p><strong>Enlace compartido del mapa</strong><small>Se conserva para el equipo y se actualiza al importar los nuevos CSV.</small></p></div><input value={mapLink} onChange={(event) => setMapLink(event.target.value)} placeholder="Pega aquí el enlace de Google My Maps"/><a href={mapLink || "https://www.google.com/maps/d/u/0/"} target="_blank" rel="noreferrer">Abrir mapa ↗</a></div></article></div></section>}
        {tab === "dashboard" && <section className="dashboard-view"><div className="page-heading"><div><p className="eyebrow">CONTROL DE EJECUCIÓN</p><h1>Avance de visitas</h1><p>Lectura directa de <b>export.Estado</b>: un estado registrado equivale a PDV visitado.</p></div><div className="dashboard-filter"><label>Día</label><input type="number" value={day} min="1" max="31" onChange={(event) => setDay(Number(event.target.value) || 1)}/></div></div><section className="metrics"><Metric label="PDV programados" value={scheduled.length} change={`Día ${day}`} tone="blue" icon="⌖"/><Metric label="Visitados" value={visits.length} change="Con estado exportado" tone="mint" icon="✓"/><Metric label="Pendientes" value={scheduled.length - visits.length} change="Aún sin estado" tone="orange" icon="◷"/><Metric label="Cumplimiento" value={`${completion}%`} change="Meta diaria" tone="purple" icon="↗"/></section><section className="dashboard-grid"><article className="panel"><div className="panel-head"><div><p className="eyebrow">POR AUDITOR</p><h2>Seguimiento individual</h2></div></div><div className="data-table"><div className="table-row header"><span>Auditor</span><span>Programados</span><span>Visitados</span><span>Pendientes</span><span>Avance</span></div>{auditorProgress.map((item) => <div className="table-row" key={item.auditor}><span><i className="person-dot">{item.auditor[0]}</i>{item.auditor}</span><span>{item.total}</span><span className="done">{item.done}</span><span>{item.pending}</span><span><b>{item.total ? Math.round(item.done / item.total * 100) : 0}%</b><i className="tiny-bar"><i style={{ width: `${item.total ? item.done / item.total * 100 : 0}%` }}></i></i></span></div>)}</div></article><article className="panel selection-card"><p className="eyebrow">POR SELECCIÓN</p><h2>Prioridad de ejecución</h2>{bySelection.map((group) => { const percent = group.total ? Math.round(group.done / group.total * 100) : 0; return <div className="selection-row" key={group.selection}><div><span className={group.selection === "T" ? "selection-label t" : "selection-label s"}>{group.selection}</span><p><strong>Selección {group.selection}</strong><small>{group.done} de {group.total} visitados</small></p></div><b>{percent}%</b><div className="wide-bar"><i style={{ width: `${percent}%` }}></i></div></div>; })}<div className="status-note"><span>i</span> El avance cambia al cargar una base con nuevos valores en <b>export.Estado</b>.</div></article></section></section>}
        {tab === "base" && fieldMode && <section className="base-view"><div className="page-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Base de datos y configuración</h1><p>Reemplaza el archivo cuando cambie el universo de PDV. La estructura debe conservar la hoja <b>UNIVERSO</b>.</p></div></div><div className="base-grid"><label className="upload-card"><input type="file" accept=".xlsx,.xls" onChange={loadWorkbook}/><span className="upload-icon">↥</span><strong>Cargar nueva base</strong><p>Excel con UNIVERSO y DESCARGA</p><b>Seleccionar archivo</b></label><article className="panel base-status"><p className="eyebrow">BASE ACTIVA</p><h2>{sourceName}</h2><div className="base-stat"><strong>{rows.length.toLocaleString("es-DO")}</strong><span>PDV en Universo</span></div><div className="base-status-list"><p><span>✓</span> Hoja UNIVERSO detectada</p><p><span>✓</span> Campos de ruta reconocidos</p><p><span>✓</span> Listo para generar CSV</p></div></article></div><article className="panel field-reference"><p className="eyebrow">REGLAS DE RUTEO</p><h2>Campos usados para preparar las rutas</h2><div><span><b>MUESTRA CUMPL.</b><small>Solo “Cargar”</small></span><span><b>export.Estado</b><small>Vacío = pendiente</small></span><span><b>DIA</b><small>Hasta el día elegido</small></span><span><b>Tabla11.auditor</b><small>Archivo por auditor</small></span><span><b>TIPO</b><small>Segmentos T y S</small></span><span><b>CLIENTE FIJO 30%</b><small>Subsegmento fijo</small></span></div></article></section>}
      </div>
    </section>
  </main>;
}

function Metric({ label, value, change, tone, icon }: { label: string; value: string | number; change: string; tone: string; icon: string }) {
  return <article className={`metric ${tone}`}><span className="metric-icon">{icon}</span><p>{label}</p><h2>{value}</h2><small>{change}</small></article>;
}
