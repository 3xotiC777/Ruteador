import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ruteador del auditor | Dichter & Neira",
  description: "Ordena los puntos asignados, elige el inicio y abre la ruta en Google Maps.",
};

export default function RouterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
