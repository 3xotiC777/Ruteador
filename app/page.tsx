"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ROUTER_STORAGE_PREFIX, RouterPlan } from "./router-plan";

type Row = Record<string, string | number | null | undefined>;
type ExportFile = { name: string; rows: Row[] };
type CountryId = "rd" | "gt-embocen" | "gt-abvo" | "cr";
type AuditorLimits = Record<string, number>;
type UserRole = "Administrador" | "Campo";
type SessionIdentity = { username: string; role: UserRole };
type CountryBase = { rows: Row[]; sourceName: string; auditorLimits: AuditorLimits; defaultDay: number; updatedAt: number };
type VisitUploadEntry = { country: string; id: string };
type VisitSnapshot = {
  keys: string[];
  sourceName: string;
  sourceRows: number;
  uniqueVisits: number;
  countryCounts: Record<string, number>;
  stateCounts: Record<string, number>;
  waveCounts: Record<string, number>;
  uploadedAt: number;
};
type CountryProfile = {
  label: string;
  shortLabel: string;
  engine: "rd" | "guatemala" | "cr";
  description: string;
  uploadHint: string;
  cutoffLabel: string;
  required: Array<{ label: string; aliases: string[] }>;
  rules: Array<{ field: string; detail: string }>;
};

const COUNTRY_PROFILES: Record<CountryId, CountryProfile> = {
  rd: {
    label: "República Dominicana",
    shortLabel: "Rep. Dominicana",
    engine: "rd",
    description: "Auditor, titulares, suplentes, ON PREMISE y PDV fijos según la macro de República Dominicana.",
    uploadHint: "Excel de República Dominicana con hoja UNIVERSO",
    cutoffLabel: "Día de campo",
    required: [
      { label: "MUESTRA CUMPL.", aliases: ["MUESTRA CUMPL."] },
      { label: "export.Estado", aliases: ["export.Estado"] },
      { label: "DIA", aliases: ["DIA"] },
      { label: "Tabla11.auditor", aliases: ["Tabla11.auditor"] },
      { label: "SELECCION", aliases: ["SELECCION"] },
      { label: "CLIENTE FIJO 30%", aliases: ["CLIENTE FIJO 30%"] },
    ],
    rules: [
      { field: "MUESTRA CUMPL.", detail: "Solo “Cargar”" },
      { field: "export.Estado", detail: "Vacío = pendiente" },
      { field: "DIA", detail: "Día elegido; arrastre anterior opcional" },
      { field: "Tabla11.auditor", detail: "Archivo por auditor" },
      { field: "SELECCION", detail: "Segmentos T y S" },
      { field: "CLIENTE FIJO 30%", detail: "Subsegmento fijo" },
    ],
  },
  "gt-embocen": {
    label: "Guatemala · EMBOCEN",
    shortLabel: "GT EMBOCEN",
    engine: "guatemala",
    description: "MT, titulares, suplentes S1/S2/S3, ON PREMISE y fijos con la estructura EMBOCEN.",
    uploadHint: "Excel Guatemala EMBOCEN con hoja UNIVERSO",
    cutoffLabel: "Día de corte",
    required: [
      { label: "MUESTRA CUMPL.", aliases: ["MUESTRA CUMPL."] },
      { label: "export.Estado", aliases: ["export.Estado"] },
      { label: "DIA", aliases: ["DIA"] },
      { label: "MT", aliases: ["MT"] },
      { label: "SELECCION", aliases: ["SELECCION"] },
      { label: "FIJO", aliases: ["FIJO"] },
      { label: "Tipo Canal", aliases: ["Tipo Canal"] },
    ],
    rules: [
      { field: "MUESTRA CUMPL.", detail: "Solo “Cargar” · columna V" },
      { field: "export.Estado", detail: "Vacío · columna U" },
      { field: "DIA", detail: "Día elegido; arrastre anterior opcional · columna T" },
      { field: "MT", detail: "Archivo por MT · columna R" },
      { field: "SELECCION", detail: "T y combinado S1/S2/S3" },
      { field: "FIJO / Tipo Canal", detail: "T_FIJOS y T_ON" },
    ],
  },
  "gt-abvo": {
    label: "Guatemala · ABVO",
    shortLabel: "GT ABVO",
    engine: "guatemala",
    description: "MT, titulares, suplentes S1/S2/S3, ON PREMISE y fijos con la estructura ABVO.",
    uploadHint: "Excel Guatemala ABVO con hoja UNIVERSO",
    cutoffLabel: "Día de corte",
    required: [
      { label: "MUESTRA CUMPL.", aliases: ["MUESTRA CUMPL."] },
      { label: "EXPORT.Estado", aliases: ["EXPORT.Estado"] },
      { label: "DIA", aliases: ["DIA"] },
      { label: "MT", aliases: ["MT"] },
      { label: "SELECCION", aliases: ["SELECCION"] },
      { label: "Cliente Fijo", aliases: ["Cliente Fijo"] },
      { label: "Tipo de Canal", aliases: ["Tipo de Canal"] },
    ],
    rules: [
      { field: "MUESTRA CUMPL.", detail: "Solo “Cargar” · columna AC" },
      { field: "EXPORT.Estado", detail: "Vacío · columna AB" },
      { field: "DIA", detail: "Día elegido; arrastre anterior opcional · columna AA" },
      { field: "MT", detail: "Archivo por MT · columna Y" },
      { field: "SELECCION", detail: "T y combinado S1/S2/S3" },
      { field: "Cliente Fijo / Tipo de Canal", detail: "T_FIJOS y T_ON" },
    ],
  },
  cr: {
    label: "Costa Rica",
    shortLabel: "Costa Rica",
    engine: "cr",
    description: "Responsable, corte DIA, pendientes por EXPORT.Estado y PDV fijos según la macro de Costa Rica.",
    uploadHint: "Excel Costa Rica con UNIVERSO; Cargue A:B es opcional",
    cutoffLabel: "Día / corte",
    required: [
      { label: "DESCARGAR", aliases: ["DESCARGAR"] },
      { label: "EXPORT.Estado", aliases: ["EXPORT.Estado"] },
      { label: "DIA", aliases: ["DIA"] },
      { label: "Responsable", aliases: ["Responsable"] },
      { label: "PDV FIJO/PRIORITARIO", aliases: ["PDV FIJO/PRIORITARIO"] },
    ],
    rules: [
      { field: "DESCARGAR", detail: "Solo “Cargar” · columna S" },
      { field: "EXPORT.Estado", detail: "Vacío · columna R" },
      { field: "DIA", detail: "Día elegido; menor o igual solo con arrastre · columna P" },
      { field: "Responsable", detail: "Archivo por auditor · columna M" },
      { field: "Cargue A:B", detail: "Corte por auditor cuando existe" },
      { field: "PDV FIJO/PRIORITARIO", detail: "Archivo _T_FIJO" },
    ],
  },
};
const COUNTRY_IDS = Object.keys(COUNTRY_PROFILES) as CountryId[];
const COUNTRY_VISIT_ALIASES: Record<CountryId, string[]> = {
  rd: ["REPUBLICA DOMINICANA", "R DOMINICANA"],
  "gt-embocen": ["EMBOCEN GUATEMALA", "GUATEMALA EMBOCEN", "GUATEMALA"],
  "gt-abvo": ["GUATEMALA ABVO", "ABVO GUATEMALA", "GUATEMALA"],
  cr: ["COSTA RICA"],
};

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

const normalize = (entry: unknown) => String(entry ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
const normalizeVisitCountry = (entry: unknown) => String(entry ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().replace(/\s+/g, " ").toUpperCase();
const normalizeVisitId = (entry: unknown) => String(entry ?? "").trim().replace(/^["']|["']$/g, "").replace(/\.0+$/, "").toUpperCase();
const visitKey = (country: unknown, id: unknown) => {
  const normalizedCountry = normalizeVisitCountry(country);
  const normalizedId = normalizeVisitId(id);
  return normalizedCountry && normalizedId ? `${normalizedCountry}|${normalizedId}` : "";
};
const value = (row: Row, names: string[]) => {
  const key = Object.keys(row).find((header) => names.some((name) => normalize(header) === normalize(name)));
  return key ? String(row[key] ?? "").trim() : "";
};
const hasField = (row: Row, names: string[]) => Object.keys(row).some((header) => names.some((name) => normalize(header) === normalize(name)));
const dayOf = (row: Row) => Number(value(row, ["DIA", "Dia_Asignado"]).match(/\d+/)?.[0]) || 0;
const idOf = (row: Row) => value(row, ["ID cliente/PDV", "Codigo DN", "CODIGO D&N", "Código DN", "Codigo", "CÓDIGO", "RefID"]);
const auditorOf = (row: Row) => {
  if (hasField(row, ["Tabla11.auditor"])) return value(row, ["Tabla11.auditor"]);
  if (hasField(row, ["Responsable"])) return value(row, ["Responsable"]);
  return value(row, ["MT", "auditor"]);
};
const selectedOf = (row: Row) => value(row, ["SELECCION"]).toUpperCase() || (hasField(row, ["DESCARGAR"]) ? "T" : "");
const isTitular = (row: Row) => selectedOf(row) === "T";
const isSupplemental = (row: Row) => /^S\d*$/.test(selectedOf(row));
const selectionGroupOf = (row: Row) => isTitular(row) ? "T" : isSupplemental(row) ? "S" : "";
const fixedOf = (row: Row) => value(row, ["CLIENTE FIJO 30%", "FIJO", "Cliente Fijo", "PDV FIJO/PRIORITARIO"]);
const statusOf = (row: Row) => value(row, ["export.Estado"]);
const nameOf = (row: Row) => value(row, ["NAME Cliente (PDV)", "Nombre", "Negocio", "Nombre de Cliente", "PDV"]);
const channelOf = (row: Row) => value(row, ["TIPO CLIENTE ICE (D&N)", "SUB CANAL", "TIPO", "Tipo Canal", "Tipo de Canal", "SubCanal", "Canal"]);
const routeLabelOf = (row: Row) => value(row, ["RUTA PREVENTA", "Ruta DN", "Ruta Venta", "Ruta"]);
const addressOf = (row: Row) => value(row, ["DIRECCIÓN", "Direccion 1", "Dirección 1", "DireccionPDV", "Direccion"]);
const pointTypeOf = (row: Row) => selectedOf(row);
const routeOrderOf = (row: Row) => Number(value(row, ["Orden_Ruta"]).match(/\d+/)?.[0]) || Number.MAX_SAFE_INTEGER;
const shouldLoad = (row: Row) => normalize(value(row, ["MUESTRA CUMPL.", "DESCARGAR"])) === "CARGAR";
const coordinatesOf = (row: Row) => {
  const lat = Number(value(row, ["LATITUD", "LATITUDE", "Latitud"]).replace(",", "."));
  const lng = Number(value(row, ["LONGITUD", "LONGITUDE", "Longitud"]).replace(",", "."));
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 ? { lat, lng } : null;
};
const matchesRequiredHeaders = (headers: string[], profile: CountryProfile) => profile.required.every((field) => field.aliases.some((alias) => headers.some((header) => normalize(header) === normalize(alias))));
const detectCountry = (headers: string[]) => COUNTRY_IDS.find((countryId) => matchesRequiredHeaders(headers, COUNTRY_PROFILES[countryId]));
const mapsRouteUrl = (points: Row[]) => {
  const coordinates = points.map(coordinatesOf).filter((point): point is { lat: number; lng: number } => Boolean(point)).slice(0, 25);
  if (!coordinates.length) return "https://www.google.com/maps";
  if (coordinates.length === 1) return `https://www.google.com/maps/search/?api=1&query=${coordinates[0].lat},${coordinates[0].lng}`;
  const point = (item: { lat: number; lng: number }) => `${item.lat},${item.lng}`;
  const params = new URLSearchParams({ api: "1", origin: point(coordinates[0]), destination: point(coordinates[coordinates.length - 1]), travelmode: "driving" });
  if (coordinates.length > 2) params.set("waypoints", coordinates.slice(1, -1).map(point).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};
const pointMapsUrl = (row: Row) => {
  const point = coordinatesOf(row);
  return point ? `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}` : "https://www.google.com/maps";
};
const escapeHtml = (entry: unknown) => String(entry ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
const routeChunks = (points: Row[]) => Array.from({ length: Math.ceil(points.length / 25) }, (_, index) => points.slice(index * 25, (index + 1) * 25));
const openRouteDetails = (auditor: string, points: Row[]) => {
  const detailWindow = window.open("", "_blank");
  if (!detailWindow) return;
  const mapped = points.map((row, index) => ({ row, index, point: coordinatesOf(row) })).filter((item): item is { row: Row; index: number; point: { lat: number; lng: number } } => Boolean(item.point));
  const bounds = mapped.length ? { minLat: Math.min(...mapped.map((item) => item.point.lat)), maxLat: Math.max(...mapped.map((item) => item.point.lat)), minLng: Math.min(...mapped.map((item) => item.point.lng)), maxLng: Math.max(...mapped.map((item) => item.point.lng)) } : null;
  const markerHtml = bounds ? mapped.map(({ row, index, point }) => { const x = 8 + ((point.lng - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, .01)) * 84; const y = 87 - ((point.lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, .01)) * 75; return `<a class="marker ${fixedOf(row).toUpperCase() === "SI" ? "fixed" : "regular"}" style="left:${x}%;top:${y}%" href="${escapeHtml(pointMapsUrl(row))}" target="_blank" title="${escapeHtml(nameOf(row))}">${index + 1}</a>`; }).join("") : "<p class='no-coordinates'>No hay coordenadas disponibles para estos puntos.</p>";
  const pointRows = points.map((row, index) => `<article class="point-card"><span class="number ${fixedOf(row).toUpperCase() === "SI" ? "fixed" : "regular"}">${index + 1}</span><div><h3>${escapeHtml(nameOf(row))}</h3><p>${escapeHtml(idOf(row))} · ${escapeHtml(value(row, ["RUTA PREVENTA"]))}</p><div class="badges"><span>${escapeHtml(channelOf(row) || "Sin canal")}</span><span class="${fixedOf(row).toUpperCase() === "SI" ? "badge-fixed" : "badge-regular"}">${fixedOf(row).toUpperCase() === "SI" ? "PDV fijo" : "PDV no fijo"}</span><span>Selección ${escapeHtml(selectedOf(row))}</span></div></div><a class="point-map" href="${escapeHtml(pointMapsUrl(row))}" target="_blank">Ver en Google Maps ↗</a></article>`).join("");
  const chunks = routeChunks(points);
  const routeLinks = chunks.map((chunk, index) => `<a class="route-link" href="${escapeHtml(mapsRouteUrl(chunk))}" target="_blank">Abrir ${chunks.length === 1 ? "ruta en Maps" : `tramo ${index + 1} (${index * 25 + 1}–${Math.min((index + 1) * 25, points.length)})`} ↗</a>`).join("");
  detailWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ruta de ${escapeHtml(auditor)}</title><style>body{margin:0;background:#f4f7fb;color:#142a50;font-family:Arial,sans-serif}.top{background:#092d66;color:white;padding:28px max(5vw,28px)}.top p{color:#aed2ff;margin:5px 0 0;font-size:14px}.top h1{margin:0;font-size:27px}.actions{padding:18px max(5vw,28px);background:white;border-bottom:1px solid #e2eaf5;display:flex;gap:9px;flex-wrap:wrap}.route-link{background:#1669de;color:white;border-radius:8px;padding:10px 12px;text-decoration:none;font-size:12px;font-weight:bold}.hint{font-size:11px;color:#6e7e97;align-self:center}.layout{max-width:1200px;margin:22px auto;padding:0 22px;display:grid;grid-template-columns:.8fr 1.2fr;gap:20px}.map{height:520px;position:sticky;top:18px;overflow:hidden;border:1px solid #9acdb7;border-radius:14px;background:linear-gradient(135deg,#a8ddc0,#dff3e5 52%,#9cd9ec);box-shadow:inset 0 0 0 5px #ffffff80}.map:before{content:'';position:absolute;inset:0;background-image:linear-gradient(#519a9455 1px,transparent 1px),linear-gradient(90deg,#519a9455 1px,transparent 1px);background-size:32px 32px}.map-head{position:absolute;z-index:2;left:14px;top:14px;background:#fffffff2;border-radius:8px;padding:9px 11px;font-size:12px;box-shadow:0 4px 12px #17456322}.marker{position:absolute;z-index:3;transform:translate(-50%,-50%);height:28px;min-width:28px;border:2px solid white;border-radius:50%;display:grid;place-items:center;color:white;text-decoration:none;font-weight:bold;font-size:10px;box-shadow:0 3px 8px #123e726b}.marker.fixed,.number.fixed{background:#e68124}.marker.regular,.number.regular{background:#1267d9}.legend{position:absolute;z-index:2;bottom:12px;left:12px;background:#ffffffe8;border-radius:8px;padding:8px;font-size:10px}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 4px 0 8px}.dot:first-child{margin-left:0}.points{display:grid;gap:9px}.point-card{background:white;border:1px solid #e0e8f2;border-radius:12px;padding:13px;display:grid;grid-template-columns:32px 1fr auto;gap:10px;align-items:center}.number{height:27px;width:27px;border-radius:8px;color:white;display:grid;place-items:center;font-size:11px;font-weight:bold}.point-card h3{font-size:13px;margin:0}.point-card p{font-size:10px;color:#718098;margin:4px 0 7px}.badges{display:flex;flex-wrap:wrap;gap:5px}.badges span{font-size:9px;background:#edf3fb;color:#537093;padding:4px 6px;border-radius:20px}.badges .badge-fixed{background:#fff0df;color:#b85f0e}.badges .badge-regular{background:#e7f2ff;color:#1d65c8}.point-map{color:#1766d3;font-size:11px;font-weight:bold;text-decoration:none;white-space:nowrap}@media(max-width:800px){.layout{grid-template-columns:1fr}.map{position:relative;height:340px}.point-card{grid-template-columns:28px 1fr}.point-map{grid-column:2}}</style></head><body><header class="top"><h1>Ruta de ${escapeHtml(auditor)}</h1><p>${points.length} puntos programados · Día de campo</p></header><section class="actions">${routeLinks}<span class="hint">Google Maps permite hasta 25 paradas por tramo.</span></section><main class="layout"><section class="map"><div class="map-head"><strong>Mapa de puntos</strong><br>${mapped.length} con coordenadas</div>${markerHtml}<div class="legend"><span class="dot" style="background:#e68124"></span>PDV fijo <span class="dot" style="background:#1267d9"></span>PDV no fijo</div></section><section class="points">${pointRows}</section></main></body></html>`);
  detailWindow.document.close();
};
const csvEscape = (entry: unknown) => `"${String(entry ?? "").replaceAll('"', '""')}"`;
const toCsv = (rows: Row[]) => {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
};
const downloadCsv = (file: ExportFile) => {
  const href = URL.createObjectURL(new Blob(["\uFEFF" + toCsv(file.rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = href; link.download = file.name; link.click(); URL.revokeObjectURL(href);
};
const crc32Table = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
  return crc >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
};
const zipDateTime = () => {
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  return {
    time: (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
  };
};
const joinBytes = (parts: Uint8Array[]) => {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.length; }
  return joined;
};
const createCsvZip = (files: ExportFile[]) => {
  const encoder = new TextEncoder();
  const { time, date } = zipDateTime();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const safeName = file.name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
    const name = encoder.encode(safeName);
    const data = encoder.encode("\uFEFF" + toCsv(file.rows));
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014B50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length;
  }

  const centralDirectory = joinBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054B50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);
  const archive = joinBytes([...localParts, centralDirectory, end]);
  return new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" });
};
const downloadCsvZip = (files: ExportFile[], fileName: string) => {
  if (!files.length) return;
  const href = URL.createObjectURL(createCsvZip(files));
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName.endsWith(".zip") ? fileName : `${fileName}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
};
const openAuditorRouter = (auditor: string, country: string, rows: Row[]) => {
  const storageKey = `${ROUTER_STORAGE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const plan: RouterPlan = {
    auditor,
    country,
    createdAt: Date.now(),
    points: rows.map((row, index) => {
      const coordinates = coordinatesOf(row);
      return {
        key: `${idOf(row) || "punto"}-${index}`,
        id: idOf(row),
        name: nameOf(row) || `Punto ${index + 1}`,
        address: addressOf(row),
        channel: channelOf(row),
        route: routeLabelOf(row),
        fixed: fixedOf(row).toUpperCase() === "SI",
        selection: selectedOf(row),
        lat: coordinates?.lat ?? null,
        lng: coordinates?.lng ?? null,
      };
    }),
  };
  window.localStorage.setItem(storageKey, JSON.stringify(plan));
  const routerWindow = window.open(`/ruteador?plan=${encodeURIComponent(storageKey)}`, "_blank");
  if (!routerWindow) {
    window.localStorage.removeItem(storageKey);
    window.alert("El navegador bloqueó la nueva pestaña. Permite ventanas emergentes para abrir el ruteador.");
    return;
  }
  routerWindow.opener = null;
};

export default function Home() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sourceName, setSourceName] = useState("Consultando base compartida…");
  const [day, setDay] = useState(1);
  const [dayInput, setDayInput] = useState("1");
  const [includeCarryover, setIncludeCarryover] = useState(false);
  const [tab, setTab] = useState<"inicio" | "rutas" | "dashboard" | "base">("inicio");
  const [role, setRole] = useState<UserRole | null>(null);
  const [username, setUsername] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [country, setCountry] = useState<CountryId>("rd");
  const [dashboardCountry, setDashboardCountry] = useState<CountryId>("rd");
  const [dashboardBaseRows, setDashboardBaseRows] = useState<Row[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [auditorLimits, setAuditorLimits] = useState<AuditorLimits>({});
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [exports, setExports] = useState<ExportFile[]>([]);
  const [notice, setNotice] = useState("");
  const [mapLink, setMapLink] = useState("");
  const [routeRows, setRouteRows] = useState<Row[]>([]);
  const [mapAuditor, setMapAuditor] = useState("");
  const [showSpecial, setShowSpecial] = useState(false);
  const [detailAuditor, setDetailAuditor] = useState("");
  const [visitSnapshot, setVisitSnapshot] = useState<VisitSnapshot | null>(null);
  const baseVersions = useRef<Partial<Record<CountryId, number>>>({});
  const visitVersion = useRef(0);
  const countryProfile = COUNTRY_PROFILES[country];
  const dashboardCountryProfile = COUNTRY_PROFILES[dashboardCountry];
  const hasAuditorLimits = Object.keys(auditorLimits).length > 0;

  const visitKeys = useMemo(() => new Set(visitSnapshot?.keys ?? []), [visitSnapshot]);
  const visitIds = useMemo(() => new Set((visitSnapshot?.keys ?? []).map((key) => key.slice(key.lastIndexOf("|") + 1)).filter(Boolean)), [visitSnapshot]);
  const hasExportVisit = useCallback((row: Row) => {
    const id = normalizeVisitId(idOf(row));
    return Boolean(id) && (visitIds.has(id) || COUNTRY_VISIT_ALIASES[country].some((countryAlias) => visitKeys.has(`${countryAlias}|${id}`)));
  }, [country, visitIds, visitKeys]);
  const isVisited = useCallback((row: Row) => {
    const excelStatus = statusOf(row);
    return Boolean(excelStatus && normalize(excelStatus) !== "NULL") || hasExportVisit(row);
  }, [hasExportVisit]);
  const scheduled = useMemo(() => rows.filter((row) => dayOf(row) === day), [day, rows]);
  const extras = useMemo(() => rows.filter((row) => extraIds.includes(idOf(row))), [extraIds, rows]);
  const filteredPoints = useMemo(() => rows.filter((row) => {
    const haystack = `${idOf(row)} ${nameOf(row)} ${auditorOf(row)} ${channelOf(row)} ${routeLabelOf(row)}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && dayOf(row) !== day && !isVisited(row);
  }), [rows, search, day, isVisited]);
  const visits = useMemo(() => scheduled.filter(isVisited), [isVisited, scheduled]);
  const exportMatches = useMemo(() => rows.filter(hasExportVisit).length, [hasExportVisit, rows]);
  const completion = scheduled.length ? Math.round((visits.length / scheduled.length) * 100) : 0;
  const auditorProgress = useMemo(() => Array.from(new Set(scheduled.map(auditorOf).filter(Boolean))).map((auditor) => {
    const points = scheduled.filter((row) => auditorOf(row) === auditor);
    const done = points.filter(isVisited).length;
    return { auditor, total: points.length, done, pending: points.length - done };
  }), [isVisited, scheduled]);
  const dashboardHasExportVisit = useCallback((row: Row) => {
    const id = normalizeVisitId(idOf(row));
    return Boolean(id) && (visitIds.has(id) || COUNTRY_VISIT_ALIASES[dashboardCountry].some((countryAlias) => visitKeys.has(`${countryAlias}|${id}`)));
  }, [dashboardCountry, visitIds, visitKeys]);
  const dashboardIsVisited = useCallback((row: Row) => {
    const excelStatus = statusOf(row);
    return Boolean(excelStatus && normalize(excelStatus) !== "NULL") || dashboardHasExportVisit(row);
  }, [dashboardHasExportVisit]);
  const dashboardRows = useMemo(() => dashboardBaseRows.filter((row) => dayOf(row) >= 1), [dashboardBaseRows]);
  const dashboardVisits = useMemo(() => dashboardRows.filter(dashboardIsVisited), [dashboardRows, dashboardIsVisited]);
  const dashboardExportMatches = useMemo(() => dashboardBaseRows.filter(dashboardHasExportVisit).length, [dashboardBaseRows, dashboardHasExportVisit]);
  const dashboardCompletion = dashboardRows.length ? Math.round(dashboardVisits.length / dashboardRows.length * 100) : 0;
  const dashboardAuditorProgress = useMemo(() => Array.from(new Set(dashboardRows.map(auditorOf).filter(Boolean))).map((auditor) => {
    const points = dashboardRows.filter((row) => auditorOf(row) === auditor);
    const done = points.filter(dashboardIsVisited).length;
    return { auditor, total: points.length, done, pending: points.length - done };
  }).sort((a, b) => b.pending - a.pending || a.auditor.localeCompare(b.auditor)), [dashboardRows, dashboardIsVisited]);
  const dashboardBySelection = useMemo(() => ["T", "S"].map((selection) => {
    const points = dashboardRows.filter((row) => selectionGroupOf(row) === selection);
    return { selection, total: points.length, done: points.filter(dashboardIsVisited).length };
  }), [dashboardRows, dashboardIsVisited]);
  const dashboardDayStats = useMemo(() => Array.from(new Set(dashboardRows.map(dayOf))).sort((a, b) => a - b).map((scheduledDay) => {
    const titulars = dashboardRows.filter((row) => dayOf(row) === scheduledDay && isTitular(row));
    const done = titulars.filter(dashboardIsVisited).length;
    return { day: scheduledDay, total: titulars.length, done, pending: titulars.length - done };
  }).filter((item) => item.total > 0), [dashboardRows, dashboardIsVisited]);
  const routeAuditors = useMemo(() => Array.from(new Set(routeRows.map(auditorOf).filter(Boolean))), [routeRows]);
  const mapPoints = useMemo(() => routeRows.filter((row) => auditorOf(row) === mapAuditor).filter(coordinatesOf), [routeRows, mapAuditor]);
  const mapBounds = useMemo(() => {
    const points = mapPoints.map(coordinatesOf).filter((point): point is { lat: number; lng: number } => Boolean(point));
    if (!points.length) return null;
    return { minLat: Math.min(...points.map((point) => point.lat)), maxLat: Math.max(...points.map((point) => point.lat)), minLng: Math.min(...points.map((point) => point.lng)), maxLng: Math.max(...points.map((point) => point.lng)) };
  }, [mapPoints]);

  const setActiveDay = useCallback((nextDay: number) => {
    const safeDay = Math.min(31, Math.max(1, Math.trunc(nextDay) || 1));
    setDay(safeDay);
    setDayInput(String(safeDay));
  }, []);

  const commitDayInput = useCallback(() => {
    const parsedDay = Number.parseInt(dayInput, 10);
    setActiveDay(Number.isFinite(parsedDay) ? parsedDay : day);
  }, [day, dayInput, setActiveDay]);

  const clearRouteWork = useCallback(() => {
    setExports([]);
    setExtraIds([]);
    setRouteRows([]);
    setMapAuditor("");
    setDetailAuditor("");
    setSearch("");
  }, []);

  const activateSharedBase = useCallback(async (
    nextCountry: CountryId,
    options: { announce?: boolean; resetWork?: boolean; force?: boolean } = {},
  ) => {
    const profile = COUNTRY_PROFILES[nextCountry];
    try {
      const response = await fetch(`/api/bases/${nextCountry}`, { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) {
        setRole(null);
        setUsername("");
        setRows([]);
        setSourceName("Sesión finalizada");
        return;
      }
      if (response.status === 404) {
        setCountry(nextCountry);
        setRows([]);
        setSourceName(`Sin base compartida · ${profile.label}`);
        setAuditorLimits({});
        setActiveDay(1);
        delete baseVersions.current[nextCountry];
        if (options.resetWork) clearRouteWork();
        if (options.announce) setNotice(`Todavía no hay una base activa para ${profile.label}. Administrador debe cargarla una sola vez.`);
        return;
      }
      const body = await response.json() as CountryBase & { error?: string };
      if (!response.ok) throw new Error(body.error || "No fue posible consultar la base compartida.");
      if (!options.force && !options.resetWork && baseVersions.current[nextCountry] === body.updatedAt) return;

      setCountry(nextCountry);
      setRows(body.rows);
      setSourceName(body.sourceName);
      setAuditorLimits(body.auditorLimits ?? {});
      setActiveDay(body.defaultDay || 1);
      baseVersions.current[nextCountry] = body.updatedAt;
      if (options.resetWork) clearRouteWork();
      if (options.announce) setNotice(`Base compartida de ${profile.label} activada.`);
    } catch (error) {
      if (options.announce) setNotice(error instanceof Error ? error.message : "No fue posible consultar la base compartida.");
    }
  }, [clearRouteWork, setActiveDay]);

  const activateVisitSnapshot = useCallback(async (announce = false) => {
    try {
      const response = await fetch("/api/visits", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) {
        setRole(null);
        setUsername("");
        setVisitSnapshot(null);
        return;
      }
      if (response.status === 404) {
        setVisitSnapshot(null);
        visitVersion.current = 0;
        if (announce) setNotice("Todavía no hay un export diario de visitas cargado.");
        return;
      }
      const body = await response.json() as VisitSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error || "No fue posible consultar el export compartido.");
      if (visitVersion.current && visitVersion.current !== body.uploadedAt) clearRouteWork();
      visitVersion.current = body.uploadedAt;
      setVisitSnapshot(body);
      if (announce) setNotice(`Export ${body.sourceName} activado con ${body.uniqueVisits.toLocaleString("es-DO")} PDV visitados.`);
    } catch (error) {
      if (announce) setNotice(error instanceof Error ? error.message : "No fue posible consultar el export compartido.");
    }
  }, [clearRouteWork]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const identity = await response.json() as SessionIdentity;
        if (!active) return;
        setRole(identity.role);
        setUsername(identity.username);
        await Promise.all([
          activateSharedBase("rd", { resetWork: true, force: true }),
          activateVisitSnapshot(),
        ]);
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => { active = false; };
  }, [activateSharedBase, activateVisitSnapshot]);

  useEffect(() => {
    if (!role) return;
    const refresh = () => {
      void activateSharedBase(country);
      void activateVisitSnapshot();
    };
    const timer = window.setInterval(refresh, 300_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [activateSharedBase, activateVisitSnapshot, country, role]);

  useEffect(() => {
    if (!role || tab !== "dashboard") return;
    let active = true;
    setDashboardLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/bases/${dashboardCountry}`, { cache: "no-store", credentials: "same-origin" });
        if (response.status === 401) {
          if (active) {
            setRole(null);
            setUsername("");
            setDashboardBaseRows([]);
          }
          return;
        }
        if (response.status === 404) {
          if (active) setDashboardBaseRows([]);
          return;
        }
        const body = await response.json() as CountryBase & { error?: string };
        if (!response.ok) throw new Error(body.error || "No fue posible consultar la base del dashboard.");
        if (active) setDashboardBaseRows(body.rows);
      } catch (error) {
        if (active) {
          setDashboardBaseRows([]);
          setNotice(error instanceof Error ? error.message : "No fue posible consultar la base del dashboard.");
        }
      } finally {
        if (active) setDashboardLoading(false);
      }
    })();
    return () => { active = false; };
  }, [dashboardCountry, role, tab]);

  const loadWorkbook = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (role !== "Administrador") throw new Error("Solo Administrador puede reemplazar las bases.");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const universe = workbook.Sheets[workbook.SheetNames.find((name) => name.trim().toUpperCase() === "UNIVERSO") ?? ""];
      if (!universe) throw new Error("No se encontró la hoja UNIVERSO.");
      const loaded = XLSX.utils.sheet_to_json<Row>(universe, { defval: "" });
      if (!loaded.length) throw new Error("UNIVERSO no tiene puntos para cargar.");
      const headers = Object.keys(loaded[0] ?? {});
      const detectedCountry = detectCountry(headers);
      const effectiveCountry = detectedCountry ?? country;
      const effectiveProfile = COUNTRY_PROFILES[effectiveCountry];
      const missingFields = effectiveProfile.required.filter((field) => !field.aliases.some((alias) => headers.some((header) => normalize(header) === normalize(alias))));
      if (missingFields.length) throw new Error(`El Excel no corresponde a ${effectiveProfile.label}. Faltan: ${missingFields.map((field) => field.label).join(", ")}.`);

      const loadedLimits: AuditorLimits = {};
      const cargueName = workbook.SheetNames.find((name) => name.trim().toUpperCase() === "CARGUE");
      if (effectiveCountry === "cr" && cargueName) {
        const cargueRows = XLSX.utils.sheet_to_json<Array<string | number>>(workbook.Sheets[cargueName], { header: 1, defval: "" });
        cargueRows.slice(1).forEach((row) => {
          const auditor = String(row[0] ?? "").trim();
          const cutoff = Number(String(row[1] ?? "").replace(",", "."));
          if (auditor && Number.isFinite(cutoff) && cutoff >= 1) loadedLimits[auditor] = cutoff;
        });
      }

      const validDays = loaded.map(dayOf).filter((loadedDay) => loadedDay >= 1);
      const firstDay = validDays.length ? Math.min(...validDays) : 1;
      setNotice(`Procesando ${loaded.length.toLocaleString("es-DO")} PDV...`);
      let savedRows = loaded;
      let savedName = file.name;
      let savedLimits = loadedLimits;
      let savedDay = firstDay;

      try {
        const response = await fetch(`/api/bases/${effectiveCountry}`, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: loaded, sourceName: file.name, auditorLimits: loadedLimits, defaultDay: firstDay }),
        });
        if (response.ok) {
          const saved = await response.json() as CountryBase;
          savedRows = saved.rows;
          savedName = saved.sourceName;
          savedLimits = saved.auditorLimits;
          savedDay = saved.defaultDay;
          baseVersions.current[effectiveCountry] = saved.updatedAt;
        }
      } catch {
        // Fallback a memoria local si excede el límite de Vercel
      }

      setCountry(effectiveCountry); setRows(savedRows); setSourceName(savedName); setAuditorLimits(savedLimits);
      clearRouteWork(); setActiveDay(savedDay);
      const detectedNote = effectiveCountry !== country ? ` Se detectó automáticamente ${effectiveProfile.label}.` : "";
      const costaRicaNote = effectiveCountry === "cr" && !cargueName ? " El archivo no incluye Cargue; se usará el día seleccionado como corte para todos los responsables." : "";
      setNotice(`${loaded.length.toLocaleString("es-DO")} PDV cargados exitosamente.${detectedNote}${costaRicaNote}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "No fue posible leer el Excel."); }
    event.target.value = "";
  };

  const loadVisitExport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (role !== "Administrador") throw new Error("Solo Administrador puede cargar el export de visitas.");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("El CSV no contiene información para procesar.");
      const loaded = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
      if (!loaded.length) throw new Error("El CSV no contiene registros.");

      const firstRow = loaded[0];
      const idAliases = ["ID_de_PDV", "ID PDV", "ID_PDV", "ID de PDV"];
      const countryAliases = ["Pais", "País"];
      const stateAliases = ["Estado", "export.Estado"];
      const missing = [
        !hasField(firstRow, idAliases) ? "ID_de_PDV" : "",
        !hasField(firstRow, countryAliases) ? "Pais" : "",
        !hasField(firstRow, stateAliases) ? "Estado" : "",
      ].filter(Boolean);
      if (missing.length) throw new Error(`Al export le faltan las columnas: ${missing.join(", ")}.`);

      const entries = new Map<string, VisitUploadEntry>();
      const stateCounts: Record<string, number> = {};
      const waveCounts: Record<string, number> = {};
      let rowsWithStatus = 0;
      for (const row of loaded) {
        const countryValue = value(row, countryAliases);
        const idValue = value(row, idAliases);
        const state = value(row, stateAliases);
        if (!state || normalize(state) === "NULL") continue;
        const countryValueNormalized = normalizeVisitCountry(countryValue);
        const idValueNormalized = normalizeVisitId(idValue);
        const key = visitKey(countryValueNormalized, idValueNormalized);
        if (!key) continue;
        rowsWithStatus += 1;
        if (!entries.has(key)) entries.set(key, { country: countryValueNormalized, id: idValueNormalized });
        stateCounts[state] = (stateCounts[state] ?? 0) + 1;
        const wave = value(row, ["Ola"]);
        if (wave && normalize(wave) !== "NULL") waveCounts[wave] = (waveCounts[wave] ?? 0) + 1;
      }
      if (!entries.size) throw new Error("No se encontraron filas con País, ID PDV y Estado.");

      setNotice(`Cruzando ${rowsWithStatus.toLocaleString("es-DO")} registros de visitas para todo el equipo…`);
      const response = await fetch("/api/visits", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [...entries.values()],
          sourceName: file.name,
          sourceRows: loaded.length,
          stateCounts,
          waveCounts,
        }),
      });
      const saved = await response.json() as VisitSnapshot & { error?: string };
      if (!response.ok) throw new Error(saved.error || "No fue posible guardar el export compartido.");

      const savedKeys = new Set(saved.keys);
      const savedIds = new Set(saved.keys.map((key) => key.slice(key.lastIndexOf("|") + 1)).filter(Boolean));
      const matchesCurrentBase = rows.filter((row) => {
        const id = normalizeVisitId(idOf(row));
        return Boolean(id) && (savedIds.has(id) || COUNTRY_VISIT_ALIASES[country].some((countryAlias) => savedKeys.has(`${countryAlias}|${id}`)));
      }).length;
      visitVersion.current = saved.uploadedAt;
      setVisitSnapshot(saved);
      clearRouteWork();
      const waveSummary = Object.keys(saved.waveCounts).length ? ` · ${Object.keys(saved.waveCounts).join(", ")}` : "";
      setNotice(`${saved.sourceRows.toLocaleString("es-DO")} registros procesados, ${saved.uniqueVisits.toLocaleString("es-DO")} PDV únicos visitados${waveSummary}. ${matchesCurrentBase.toLocaleString("es-DO")} coinciden con la base activa de ${countryProfile.label}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible procesar el export de visitas.");
    }
    event.target.value = "";
  };

  const changeCountry = (nextCountry: CountryId) => {
    setCountry(nextCountry);
    setRows([]);
    setSourceName(`Consultando base compartida · ${COUNTRY_PROFILES[nextCountry].label}`);
    clearRouteWork();
    void activateSharedBase(nextCountry, { announce: true, resetWork: true, force: true });
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      setRole(null);
      setUsername("");
      setTab("inicio");
      setRows([]);
      setSourceName("Sesión finalizada");
      setVisitSnapshot(null);
      visitVersion.current = 0;
      baseVersions.current = {};
      clearRouteWork();
    }
  };

  const createRoutes = () => {
    if (!rows.length) {
      setNotice(`Carga primero el Excel de ${countryProfile.label} desde Base de datos.`);
      return;
    }
    if (!visitSnapshot) {
      setNotice("No se generaron rutas: primero carga el export diario para excluir los PDV ya visitados.");
      return;
    }
    const base = rows.filter((row) => {
      const scheduledDay = dayOf(row);
      if (countryProfile.engine === "cr" && hasAuditorLimits && auditorLimits[auditorOf(row)] === undefined) return false;
      const rowTargetDay = countryProfile.engine === "cr" ? auditorLimits[auditorOf(row)] ?? day : day;
      const matchesDay = includeCarryover
        ? scheduledDay >= 1 && scheduledDay <= rowTargetDay
        : scheduledDay === rowTargetDay;
      return shouldLoad(row) && !isVisited(row) && matchesDay;
    });
    const all = [...base, ...extras.filter((row) => !isVisited(row) && !base.some((baseRow) => idOf(baseRow) === idOf(row)))];
    const files: ExportFile[] = [];
    for (const auditor of Array.from(new Set(all.map(auditorOf).filter(Boolean)))) {
      const perAuditor = all.filter((row) => auditorOf(row) === auditor);
      const t = perAuditor.filter((row) => pointTypeOf(row) === "T");
      const supplements = perAuditor.filter(isSupplemental);
      let segments: [string, Row[]][];
      if (countryProfile.engine === "guatemala") {
        segments = [
          ["T", t],
          ["T_ON", t.filter((row) => channelOf(row).toUpperCase() === "ON PREMISE")],
          ["T_FIJOS", t.filter((row) => fixedOf(row).toUpperCase() === "SI")],
          ["S1_S2_S3", supplements],
        ];
      } else if (countryProfile.engine === "cr") {
        segments = [
          ["T", perAuditor],
          ["T_FIJO", perAuditor.filter((row) => fixedOf(row).toUpperCase() === "SI")],
        ];
      } else {
        const s = perAuditor.filter((row) => pointTypeOf(row) === "S");
        segments = [
          ["T", t],
          ["T_ON", t.filter((row) => channelOf(row).toUpperCase() === "ON PREMISE")],
          ["T_FIJOS", t.filter((row) => fixedOf(row).toUpperCase() === "SI")],
          ["S", s],
          ["S_FIJOS", s.filter((row) => fixedOf(row).toUpperCase() === "SI")],
        ];
      }
      segments.filter(([, points]) => points.length).forEach(([segment, points]) => files.push({ name: `${auditor}_${segment}.csv`, rows: points }));
    }
    setExports(files); setRouteRows(all); setMapAuditor(auditorOf(all[0] ?? {})); setTab("rutas");
    const selectedDayDescription = countryProfile.engine === "cr" && hasAuditorLimits ? "los días definidos en Cargue" : `el día ${day}`;
    const scopeDescription = includeCarryover ? `${selectedDayDescription}, incluyendo pendientes anteriores` : `solo ${selectedDayDescription}`;
    setNotice(files.length ? `${files.length} archivos CSV de ${countryProfile.label} listos con ${scopeDescription}. ${extras.length ? `${extras.length} excepción(es) incluida(s).` : ""}` : `No se encontraron PDV pendientes para ${scopeDescription}. Revisa los campos indicados en las reglas de ${countryProfile.label}.`);
  };

  const toggleExtra = (id: string) => setExtraIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const fieldMode = role === "Administrador";

  if (authLoading) return <LoginLoading/>;
  if (!role) return <LoginScreen onAuthenticated={(identity) => {
    setRole(identity.role);
    setUsername(identity.username);
    setAuthLoading(false);
    void activateSharedBase("rd", { resetWork: true, force: true });
    void activateVisitSnapshot();
  }}/>;

  return <main>
    <aside className="sidebar">
      <div className="brand"><img src="/dn-logo.jpg" alt="Dichter & Neira"/><span>Ruteador<small>planeación</small></span></div>
      <p className="workspace-label">OPERACIÓN DE CAMPO</p>
      <nav>
        <button className={tab === "inicio" ? "nav active" : "nav"} onClick={() => setTab("inicio")}><i>⌂</i> Resumen</button>
        <button className={tab === "rutas" ? "nav active" : "nav"} onClick={() => setTab("rutas")}><i>⌁</i> Rutas diarias</button>
        <button className={tab === "dashboard" ? "nav active" : "nav"} onClick={() => setTab("dashboard")}><i>◔</i> Dashboard</button>
        {fieldMode && <button className={tab === "base" ? "nav active" : "nav"} onClick={() => setTab("base")}><i>▣</i> Base de datos</button>}
      </nav>
      <div className="sidebar-footer"><div className="avatar">{username.slice(0, 2).toUpperCase()}</div><div><strong>{username}</strong><small>{role}</small></div></div>
    </aside>
    <nav className="mobile-nav" aria-label="Navegación principal">
      <button className={tab === "inicio" ? "active" : ""} onClick={() => setTab("inicio")}><i>⌂</i><span>Resumen</span></button>
      <button className={tab === "rutas" ? "active" : ""} onClick={() => setTab("rutas")}><i>⌁</i><span>Rutas</span></button>
      <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}><i>◔</i><span>Avance</span></button>
      {fieldMode && <button className={tab === "base" ? "active" : ""} onClick={() => setTab("base")}><i>▣</i><span>Base</span></button>}
    </nav>
    <section className="app-shell">
      <header className="topbar"><div className="crumb"><span>Ruteador</span><b>/</b><strong>{tab === "inicio" ? "Resumen operativo" : tab[0].toUpperCase() + tab.slice(1)}</strong></div><div className="top-actions"><span className={visitSnapshot ? "sync" : "sync sync-pending"}><b></b>{visitSnapshot ? ` Export · ${new Date(visitSnapshot.uploadedAt).toLocaleDateString("es-DO")}` : " Sin export diario"}</span><div className="signed-user"><span>{username}</span><small>{role}</small></div><button className="logout-button" onClick={logout}>Salir</button></div></header>
      <div className="content">
        {notice && <div className="notice"><span>✓</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}
        {tab === "inicio" && <>
          <section className="hero"><div><p className="eyebrow">OPERACIÓN EN VIVO <span></span> DÍA {day}</p><h1>El día de campo,<br/><em>listo para avanzar.</em></h1><p className="hero-copy">Genera las rutas de tus auditores, incorpora solicitudes de última hora y sigue el avance de cada visita desde una sola base.</p><div className="hero-actions"><button className="button primary" onClick={() => setTab("rutas")}>Preparar rutas <span>→</span></button><button className="text-button" onClick={() => setTab("dashboard")}>Ver avance <span>↗</span></button></div></div><div className="route-graphic"><div className="route-line one"></div><div className="route-line two"></div><div className="route-line three"></div><div className="pin pin-a">●</div><div className="pin pin-b">●</div><div className="pin pin-c">●</div><div className="graphic-card"><span>VISITAS HOY</span><strong>{visits.length}<small> / {scheduled.length}</small></strong><b>{completion}% completo</b></div></div></section>
          <section className="metrics"><Metric label="Programados hoy" value={scheduled.length} change={`${auditorProgress.length} auditores activos`} tone="blue" icon="⌖"/><Metric label="Visitas completadas" value={visits.length} change={`${completion}% del plan`} tone="mint" icon="✓"/><Metric label="Pendientes" value={scheduled.length - visits.length} change="Por confirmar" tone="orange" icon="◷"/><Metric label="PDV fijos" value={scheduled.filter((row) => fixedOf(row).toUpperCase() === "SI").length} change="En la ruta de hoy" tone="purple" icon="◆"/></section>
          <section className="two-col"><article className="panel progress-panel"><div className="panel-head"><div><p className="eyebrow">AVANCE GENERAL</p><h2>Cumplimiento de hoy</h2></div><button className="mini-link" onClick={() => setTab("dashboard")}>Ver detalle →</button></div><div className="completion"><div className="donut" style={{ "--progress": `${completion * 3.6}deg` } as React.CSSProperties}><div><b>{completion}%</b><small>completado</small></div></div><div className="progress-list">{auditorProgress.slice(0, 3).map((item) => <div className="progress-row" key={item.auditor}><span className="person-dot">{item.auditor.slice(0, 1)}</span><div><strong>{item.auditor}</strong><small>{item.done} visitados · {item.pending} pendientes</small></div><b>{item.total ? Math.round(item.done / item.total * 100) : 0}%</b></div>)}</div></div></article><article className="panel map-preview"><div className="panel-head"><div><p className="eyebrow">MAPA DEL DÍA</p><h2>Rutas segmentadas</h2></div><button className="mini-link" onClick={() => setTab("rutas")}>Abrir rutas →</button></div><div className="map-grid"><span className="street s1"></span><span className="street s2"></span><span className="street s3"></span><span className="map-pin p1">●</span><span className="map-pin p2">●</span><span className="map-pin p3">●</span><span className="map-pin p4">●</span><div className="map-legend"><b><i></i> Selección T</b><b><i></i> Selección S</b></div></div></article></section>
        </>}
        {tab === "rutas" && <section className="routes-view">
          <div className="page-heading"><div><p className="eyebrow">PLANIFICADOR DE RUTAS · {countryProfile.shortLabel}</p><h1>Prepara la operación de campo</h1><p>{countryProfile.description}</p></div><div className="date-chip">{countryProfile.cutoffLabel} <strong>{country === "cr" && hasAuditorLimits ? "por auditor" : day}</strong><small>{includeCarryover ? "Con pendientes anteriores" : "Solo el día elegido"}</small></div></div>
          <div className="route-controls panel">
            <div className="control"><label>País / operación</label><select aria-label="País de operación" value={country} onChange={(event) => changeCountry(event.target.value as CountryId)}>{COUNTRY_IDS.map((countryId) => <option value={countryId} key={countryId}>{COUNTRY_PROFILES[countryId].label}</option>)}</select></div>
            <div className="control small"><label>{countryProfile.cutoffLabel}</label><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={dayInput} onChange={(event) => setDayInput(event.target.value.replace(/\D/g, "").slice(0, 2))} onBlur={commitDayInput} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label="Escribir día de campo"/><small>Escribe el número y presiona Enter</small></div>
            <div className="control source"><label>Base activa</label><strong>▣ {sourceName}</strong><small>{rows.length.toLocaleString("es-DO")} PDV · {exportMatches.toLocaleString("es-DO")} visitados en export</small></div>
            <button className="button primary generate" onClick={createRoutes} disabled={!rows.length}>Cargar rutas <span>→</span></button>
            <label className="carryover-toggle"><input type="checkbox" checked={includeCarryover} onChange={(event) => setIncludeCarryover(event.target.checked)}/><span><b>Incluir pendientes de días anteriores</b><small>Actívalo solo cuando quieras el arrastre acumulado de la macro.</small></span></label>
          </div>
          <div className="route-body"><article className="panel exceptions"><div className="panel-head"><div><p className="eyebrow">SOLICITUDES ESPECIALES</p><h2>PDV fuera del día</h2><p>Selecciona puntos que el cliente pidió atender antes de su fecha programada.</p></div><span className="counter">{extraIds.length} elegidos</span></div><div className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por PDV, auditor o canal"/></div><div className="point-list">{filteredPoints.slice(0, 7).map((row) => { const id = idOf(row); const checked = extraIds.includes(id); return <button key={id} className={checked ? "point checked" : "point"} onClick={() => toggleExtra(id)}><span className="check">{checked ? "✓" : ""}</span><span><strong>{nameOf(row)}</strong><small>{id} · Día {dayOf(row)} · {auditorOf(row)}</small></span><em>{selectedOf(row) || "—"}</em></button>; })}{!filteredPoints.length && <p className="empty">No hay otros PDV que coincidan con la búsqueda.</p>}</div></article><article className="panel export-panel"><div className="panel-head"><div><p className="eyebrow">ENTREGABLES</p><h2>CSV para Google My Maps</h2><p>Los nombres y segmentos siguen la macro de {countryProfile.label}.</p></div></div>{exports.length ? <><div className="export-summary"><span>✓</span><div><strong>{exports.length} archivos generados</strong><small>{countryProfile.label} · {includeCarryover ? "día elegido + pendientes anteriores" : "solo el día elegido"}</small></div><button className="button secondary" onClick={() => downloadCsvZip(exports, `Rutas_${countryProfile.shortLabel}_dia_${day}.zip`)}>Descargar ZIP</button></div><div className="file-list">{exports.map((file) => <button key={file.name} className="file" onClick={() => downloadCsv(file)}><span>CSV</span><div><strong>{file.name}</strong><small>{file.rows.length} puntos</small></div><b>↓</b></button>)}</div></> : <div className="empty-export"><span>↥</span><strong>Tus archivos aparecerán aquí</strong><p>Selecciona la operación, escribe el día y presiona <b>“Cargar rutas”</b>.</p></div>}<div className="map-link"><div><span>⌖</span><p><strong>Enlace compartido del mapa</strong><small>Se conserva para el equipo y se actualiza al importar los nuevos CSV.</small></p></div><input value={mapLink} onChange={(event) => setMapLink(event.target.value)} placeholder="Pega aquí el enlace de Google My Maps"/><a href={mapLink || "https://www.google.com/maps/d/u/0/"} target="_blank" rel="noreferrer">Abrir mapa ↗</a></div></article></div>
        </section>}
        {tab === "rutas" && routeAuditors.length > 0 && <section className="panel route-map-panel"><div className="panel-head"><div><p className="eyebrow">VISTA PREVIA DE RUTAS</p><h2>Puntos a visitar por auditor</h2><p>Los botones abren Google Maps con la ruta de conducción. Google admite hasta 25 puntos por apertura.</p></div></div><div className="auditor-route-list">{routeAuditors.map((auditor) => { const points = routeRows.filter((row) => auditorOf(row) === auditor); return <div className={mapAuditor === auditor ? "auditor-route active" : "auditor-route"} key={auditor}><button onClick={() => setMapAuditor(auditor)}><i>{auditor.slice(0, 1)}</i><span><strong>{auditor}</strong><small>{points.length} PDV pendientes</small></span><b>Ver puntos</b></button><a href={mapsRouteUrl(points)} target="_blank" rel="noreferrer">Abrir en Google Maps ↗</a></div>; })}</div><div className="map-canvas" aria-label={`Mapa de puntos de ${mapAuditor}`}><div className="map-title"><span>⌖</span><div><strong>{mapAuditor || "Selecciona un auditor"}</strong><small>{mapPoints.length} puntos con coordenadas</small></div></div><div className="map-road road-one"></div><div className="map-road road-two"></div><div className="map-road road-three"></div>{mapBounds && mapPoints.map((row, index) => { const point = coordinatesOf(row)!; const xRange = Math.max(mapBounds.maxLng - mapBounds.minLng, .01); const yRange = Math.max(mapBounds.maxLat - mapBounds.minLat, .01); const left = 8 + ((point.lng - mapBounds.minLng) / xRange) * 84; const top = 87 - ((point.lat - mapBounds.minLat) / yRange) * 75; return <span className="preview-pin" style={{ left: `${left}%`, top: `${top}%` }} title={nameOf(row)} key={`${idOf(row)}-${index}`}>{index + 1}</span>; })}<div className="map-scale">Puntos con LATITUD / LONGITUD</div></div></section>}
        {tab === "dashboard" && <section className="dashboard-view">
          <div className="page-heading"><div><p className="eyebrow">CONTROL DE EJECUCIÓN · MES COMPLETO</p><h1>Avance de visitas</h1><p>Esta vista ya no depende del día elegido en Rutas. Cruza el <b>ID_de_PDV</b> único del export con <b>Código DN</b> y conserva cualquier valor existente en <b>export.Estado</b>.</p></div><label className="dashboard-country-filter"><span>PAÍS / OPERACIÓN</span><select aria-label="Filtrar dashboard por país" value={dashboardCountry} onChange={(event) => setDashboardCountry(event.target.value as CountryId)}>{COUNTRY_IDS.map((countryId) => <option value={countryId} key={countryId}>{COUNTRY_PROFILES[countryId].label}</option>)}</select><small>{dashboardLoading ? "Actualizando información…" : `${dashboardCountryProfile.shortLabel} · Todos los días`}</small></label></div>
          <section className="metrics"><Metric label="PDV programados" value={dashboardRows.length} change="Universo completo" tone="blue" icon="⌖"/><Metric label="Visitados" value={dashboardVisits.length} change={visitSnapshot ? "Excel + export diario" : "Estado del Excel"} tone="mint" icon="✓"/><Metric label="Pendientes" value={dashboardRows.length - dashboardVisits.length} change="Todos los días" tone="orange" icon="◷"/><Metric label="Cumplimiento" value={`${dashboardCompletion}%`} change="Avance del universo" tone="purple" icon="↗"/></section>
          <article className="panel day-progress-card"><div className="panel-head"><div><p className="eyebrow">TITULARES POR DÍA</p><h2>Cuántos titulares ya se visitaron</h2><p>El día corresponde a la programación del universo, no al filtro de Rutas.</p></div><span className="day-total">{dashboardDayStats.reduce((total, item) => total + item.done, 0).toLocaleString("es-DO")} visitados</span></div><div className="day-progress-list">{dashboardDayStats.map((item) => { const percent = item.total ? Math.round(item.done / item.total * 100) : 0; return <div className="day-progress-row" key={item.day}><span>Día <b>{item.day}</b></span><div><i style={{ width: `${percent}%` }}></i></div><strong>{item.done}<small> / {item.total}</small></strong><em>{item.pending} pendientes</em></div>; })}{!dashboardDayStats.length && <p className="empty">No hay titulares con día programado en esta base.</p>}</div></article>
          <section className="dashboard-grid"><article className="panel"><div className="panel-head"><div><p className="eyebrow">POR AUDITOR · TODOS LOS DÍAS</p><h2>Seguimiento individual</h2></div></div><div className="data-table"><div className="table-row header"><span>Auditor</span><span>Programados</span><span>Visitados</span><span>Pendientes</span><span>Avance</span></div>{dashboardAuditorProgress.map((item) => <div className="table-row" key={item.auditor}><span><i className="person-dot">{item.auditor[0]}</i>{item.auditor}</span><span>{item.total}</span><span className="done">{item.done}</span><span>{item.pending}</span><span><b>{item.total ? Math.round(item.done / item.total * 100) : 0}%</b><i className="tiny-bar"><i style={{ width: `${item.total ? item.done / item.total * 100 : 0}%` }}></i></i></span></div>)}</div></article><article className="panel selection-card"><p className="eyebrow">POR SELECCIÓN · TODOS LOS DÍAS</p><h2>Prioridad de ejecución</h2>{dashboardBySelection.map((group) => { const percent = group.total ? Math.round(group.done / group.total * 100) : 0; return <div className="selection-row" key={group.selection}><div><span className={group.selection === "T" ? "selection-label t" : "selection-label s"}>{group.selection}</span><p><strong>Selección {group.selection}</strong><small>{group.done} de {group.total} visitados</small></p></div><b>{percent}%</b><div className="wide-bar"><i style={{ width: `${percent}%` }}></i></div></div>; })}<div className="status-note"><span>i</span>{visitSnapshot ? <>{dashboardExportMatches.toLocaleString("es-DO")} PDV de esta base coinciden con <b>{visitSnapshot.sourceName}</b>.</> : <>Carga el export diario desde Administración para cruzar las visitas automáticamente.</>}</div></article></section>
        </section>}
        {tab === "base" && fieldMode && <section className="base-view">
          <div className="page-heading"><div><p className="eyebrow">ADMINISTRACIÓN · {countryProfile.shortLabel}</p><h1>Base de datos y configuración</h1><p>Actualiza los universos cuando cambien y carga un único export diario para cruzar las visitas de todos los países.</p></div><div className="country-base-chip">{countryProfile.label}</div></div>
          <div className="base-grid">
            <label className="upload-card"><input type="file" accept=".xlsx,.xls" onChange={loadWorkbook}/><span className="upload-icon">↥</span><strong>Cargar nueva base</strong><p>{countryProfile.uploadHint}</p><b>Seleccionar archivo</b></label>
            <article className="panel base-status"><p className="eyebrow">BASE ACTIVA</p><h2>{sourceName}</h2><div className="base-stat"><strong>{rows.length.toLocaleString("es-DO")}</strong><span>PDV en Universo</span></div><div className="base-status-list"><p><span>✓</span> Hoja UNIVERSO detectada</p><p><span>✓</span> Perfil {countryProfile.shortLabel} activo</p><p><span>✓</span> Cruce por Código DN único preparado</p>{country === "cr" && <p><span>{hasAuditorLimits ? "✓" : "i"}</span>{hasAuditorLimits ? "Día por responsable desde Cargue" : "Día escrito en el planificador"}</p>}</div></article>
          </div>
          <article className="panel visit-import">
            <div className="visit-import-copy"><p className="eyebrow">EXPORT DIARIO · TODOS LOS PAÍSES</p><h2>Actualizar puntos visitados</h2><p>El sistema cruza el <b>ID_de_PDV único</b> del CSV con <b>Código DN</b> del universo; País se conserva para los resúmenes. Cualquier fila con Estado se considera visitada y deja de generarse en las rutas.</p><div className="visit-requirements"><span>✓ CSV de Informes</span><span>✓ Una sola carga diaria</span><span>✓ Sin modificar los Excel</span></div></div>
            <label className="visit-upload"><input type="file" accept=".csv,text/csv" onChange={loadVisitExport}/><span>↥</span><strong>{visitSnapshot ? "Reemplazar export diario" : "Cargar export diario"}</strong><small>Columnas requeridas: Pais, ID_de_PDV y Estado</small><b>Seleccionar CSV</b></label>
            <div className="visit-status">
              <p className="eyebrow">{visitSnapshot ? "EXPORT COMPARTIDO ACTIVO" : "SIN EXPORT CARGADO"}</p>
              {visitSnapshot ? <><h3>{visitSnapshot.sourceName}</h3><strong>{visitSnapshot.uniqueVisits.toLocaleString("es-DO")}</strong><span>PDV únicos visitados</span><dl><div><dt>{exportMatches.toLocaleString("es-DO")}</dt><dd>coinciden con {countryProfile.shortLabel}</dd></div><div><dt>{visitSnapshot.sourceRows.toLocaleString("es-DO")}</dt><dd>registros procesados</dd></div></dl><small>Actualizado {new Date(visitSnapshot.uploadedAt).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })}</small></> : <><h3>Sube Informes.csv</h3><p>Cuando lo cargues, la actualización se compartirá con Campo y se aplicará a rutas y dashboard.</p></>}
            </div>
          </article>
          <article className="panel field-reference"><p className="eyebrow">REGLAS DE RUTEO · {countryProfile.shortLabel}</p><h2>Cálculo replicado de la macro</h2><div>{countryProfile.rules.map((rule) => <span key={rule.field}><b>{rule.field}</b><small>{rule.detail}</small></span>)}</div></article>
        </section>}
        {tab === "rutas" && routeAuditors.length > 0 && <RoutePreview auditors={routeAuditors} rows={routeRows} onDetails={setDetailAuditor}/>}
        {detailAuditor && <RouteDetailPanel auditor={detailAuditor} country={countryProfile.label} rows={routeRows.filter((row) => auditorOf(row) === detailAuditor)} onClose={() => setDetailAuditor("")}/>}
        {tab === "rutas" && <button className="special-launch" onClick={() => setShowSpecial(true)}>+ Solicitudes especiales <span>{extraIds.length}</span></button>}
        {showSpecial && <div className="special-modal" role="dialog" aria-modal="true" aria-label="Solicitudes especiales"><div className="special-modal-card"><div className="special-modal-head"><div><p className="eyebrow">SOLICITUDES ESPECIALES</p><h2>Agregar PDV a la ruta</h2><p>Busca por nombre, código, auditor, canal o <b>ruta</b>.</p></div><button onClick={() => setShowSpecial(false)} aria-label="Cerrar">×</button></div><div className="search modal-search"><span>⌕</span><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar PDV, ruta, canal o auditor"/></div><div className="special-results">{filteredPoints.map((row) => { const id = idOf(row); const checked = extraIds.includes(id); return <button key={id} className={checked ? "special-result checked" : "special-result"} onClick={() => toggleExtra(id)}><span className="check">{checked ? "✓" : ""}</span><div><strong>{nameOf(row)}</strong><small>{id} · Ruta {routeLabelOf(row) || "—"} · {channelOf(row) || "Sin canal"}</small></div><span className={fixedOf(row).toUpperCase() === "SI" ? "fixed-badge" : "normal-badge"}>{fixedOf(row).toUpperCase() === "SI" ? "Fijo" : "No fijo"}</span></button>})}{!filteredPoints.length && <p className="empty">No hay puntos que coincidan con la búsqueda.</p>}</div><div className="special-modal-footer"><span>{extraIds.length} PDV seleccionados</span><button className="button primary modal-done" onClick={() => setShowSpecial(false)}>Listo</button></div></div></div>}
      </div>
    </section>
  </main>;
}

function LoginLoading() {
  return <main className="login-shell"><section className="login-card login-loading"><img src="/dn-logo.jpg" alt="Dichter & Neira"/><span className="login-spinner"></span><p>Preparando el ruteador…</p></section></main>;
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: (identity: SessionIdentity) => void }) {
  const [loginUsername, setLoginUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password }),
      });
      const body = await response.json() as SessionIdentity & { error?: string };
      if (!response.ok) throw new Error(body.error || "No fue posible iniciar sesión.");
      onAuthenticated({ username: body.username, role: body.role });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "No fue posible iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="login-shell">
    <section className="login-card">
      <div className="login-brand"><img src="/dn-logo.jpg" alt="Dichter & Neira"/><div><strong>Ruteador</strong><small>planeación</small></div></div>
      <p className="eyebrow">ACCESO AL EQUIPO DE CAMPO</p>
      <h1>Bienvenido</h1>
      <p className="login-copy">Ingresa con el usuario asignado para consultar las rutas y bases compartidas.</p>
      <form onSubmit={submit}>
        <label>Nombre de usuario<input autoComplete="username" value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} placeholder="Tu usuario" required/></label>
        <label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tu contraseña" required/></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button disabled={submitting}>{submitting ? "Ingresando…" : "Ingresar al ruteador"} <span>→</span></button>
      </form>
      <small className="login-help">La base visible es siempre la última publicada por Administrador para cada país.</small>
    </section>
    <section className="login-visual" aria-hidden="true"><div className="login-route route-a"></div><div className="login-route route-b"></div><span className="login-pin pin-one">1</span><span className="login-pin pin-two">2</span><span className="login-pin pin-three">3</span><div><p>RUTAS COMPARTIDAS</p><strong>Un solo punto de partida para todo el equipo.</strong></div></section>
  </main>;
}

function Metric({ label, value, change, tone, icon }: { label: string; value: string | number; change: string; tone: string; icon: string }) {
  return <article className={`metric ${tone}`}><span className="metric-icon">{icon}</span><p>{label}</p><h2>{value}</h2><small>{change}</small></article>;
}

function RoutePreview({ auditors, rows, onDetails }: { auditors: string[]; rows: Row[]; onDetails: (auditor: string) => void }) {
  return <section className="panel route-detail-preview"><div className="panel-head"><div><p className="eyebrow">VISTA PREVIA DE RUTAS</p><h2>Auditores y puntos del día</h2><p>Consulta el detalle completo, el mapa segmentado y cada PDV en Google Maps.</p></div></div><div className="auditor-detail-list">{auditors.map((auditor) => { const points = rows.filter((row) => auditorOf(row) === auditor); const titular = points.filter(isTitular).length; const suplente = points.filter(isSupplemental).length; return <article key={auditor}><i>{auditor.slice(0, 1)}</i><div><strong>{auditor}</strong><small>{points.length} puntos · {titular} titulares · {suplente} suplentes</small></div><button onClick={() => onDetails(auditor)}>Ver detalles →</button></article>; })}</div><p className="my-maps-note"><b>My Maps:</b> el enlace no se actualiza automáticamente. Los puntos y rutas operativas se consultan directamente desde este ruteador.</p></section>;
}

function RouteMap({ rows }: { rows: Row[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const routeSignature = rows.map((row) => `${idOf(row)}:${coordinatesOf(row)?.lat ?? ""},${coordinatesOf(row)?.lng ?? ""}:${fixedOf(row)}:${selectedOf(row)}`).join("|");

  useEffect(() => {
    let disposed = false;
    let routeMap: import("leaflet").Map | null = null;

    void import("leaflet").then((L) => {
      if (disposed || !containerRef.current) return;

      routeMap = L.map(containerRef.current, {
        scrollWheelZoom: false,
        doubleClickZoom: false,
        zoomControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(routeMap);

      const positions: Array<[number, number]> = [];
      rows.forEach((row, index) => {
        const point = coordinatesOf(row);
        if (!point || !routeMap) return;
        const isFixed = fixedOf(row).toUpperCase() === "SI";
        const titular = isTitular(row);
        positions.push([point.lat, point.lng]);
        const icon = L.divIcon({
          className: "route-marker-shell",
          html: `<span class="leaflet-number-marker ${isFixed ? "pdv-fixed" : "pdv-regular"} ${titular ? "sample-titular" : "sample-suplente"}">${index + 1}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        L.marker([point.lat, point.lng], { icon })
          .addTo(routeMap)
          .bindPopup(`<strong>${escapeHtml(nameOf(row))}</strong><br><span>${escapeHtml(idOf(row))} · ${titular ? "Titular" : `Suplente ${escapeHtml(selectedOf(row))}`}</span>`);
      });

      if (positions.length === 1) routeMap.setView(positions[0], 16);
      else if (positions.length > 1) routeMap.fitBounds(L.latLngBounds(positions), { padding: [42, 42], maxZoom: 16 });
      else routeMap.setView([18.4861, -69.9312], 10);

      window.setTimeout(() => routeMap?.invalidateSize(), 0);
    });

    return () => {
      disposed = true;
      routeMap?.remove();
    };
  }, [routeSignature]);

  return <div className="leaflet-route-map" ref={containerRef} aria-label="Mapa geográfico de los puntos de la ruta" />;
}

function RouteDetailPanel({ auditor, country, rows, onClose }: { auditor: string; country: string; rows: Row[]; onClose: () => void }) {
  const orderedRows = useMemo(() => [...rows].sort((a, b) => {
    const selectionPriority = (row: Row) => isTitular(row) ? 0 : isSupplemental(row) ? 1 : 2;
    return selectionPriority(a) - selectionPriority(b) || (fixedOf(b).toUpperCase() === "SI" ? 1 : 0) - (fixedOf(a).toUpperCase() === "SI" ? 1 : 0) || routeOrderOf(a) - routeOrderOf(b) || nameOf(a).localeCompare(nameOf(b));
  }), [rows]);
  const titularRows = orderedRows.filter(isTitular);
  const suplenteRows = orderedRows.filter(isSupplemental);
  return <div className="detail-overlay"><div className="detail-header"><div><p>RUTA DEL DÍA</p><h1>{auditor}</h1><span>{titularRows.length} titulares · {suplenteRows.length} suplentes · titulares primero</span></div><button onClick={onClose}>← Volver a rutas</button></div><div className="detail-actions"><button className="router-launch" disabled={!titularRows.length} onClick={() => openAuditorRouter(auditor, country, orderedRows)}>Ruteador · ordenar recorrido →</button>{titularRows.length ? <small>Elige el punto inicial y navega por tramos seguros para celular desde el ruteador.</small> : <small className="no-titular-route">No hay titulares disponibles para generar una ruta.</small>}</div><div className="detail-layout"><section className="detail-map"><RouteMap rows={orderedRows}/><div className="detail-map-title"><b>Mapa de puntos</b><span><i className="fixed-dot"></i> Fijo <i className="regular-dot"></i> No fijo</span><span className="selection-legend"><i className="titular-mark">T</i> Titular <i className="suplente-mark">S</i> Suplente</span></div></section><section className="detail-points">{orderedRows.map((row, index) => { const titular = isTitular(row); return <article key={`${idOf(row)}-${index}`}><span className={`${fixedOf(row).toUpperCase() === "SI" ? "point-number pdv-fixed" : "point-number pdv-regular"} ${titular ? "sample-titular" : "sample-suplente"}`}>{index + 1}</span><div className="point-copy"><strong>{nameOf(row)}</strong><small>{idOf(row)} · Ruta {routeLabelOf(row) || "—"}</small><p><em className={titular ? "is-titular" : "is-suplente"}>{titular ? "Titular" : `Suplente ${selectedOf(row)}`}</em><b>{channelOf(row) || "Sin canal"}</b><em className={fixedOf(row).toUpperCase() === "SI" ? "is-fixed" : "is-regular"}>{fixedOf(row).toUpperCase() === "SI" ? "PDV fijo" : "PDV no fijo"}</em></p><a className="point-map-link" href={pointMapsUrl(row)} target="_blank" rel="noreferrer">Ver en Google Maps ↗</a></div></article>; })}</section></div></div>;
}
