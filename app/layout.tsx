import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruteador planeación | Dichter & Neira",
  description: "Ruteo, CSV y avance operativo de visitas de campo.",
  openGraph: { title: "Ruteador planeación", description: "Ruteo diario inteligente", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Ruteador planeación", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
