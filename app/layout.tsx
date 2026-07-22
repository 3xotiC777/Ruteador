import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruta Viva | Ruteo diario inteligente",
  description: "Ruteo, CSV y avance operativo de visitas de campo.",
  openGraph: { title: "Ruta Viva", description: "Ruteo diario inteligente", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Ruta Viva", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
