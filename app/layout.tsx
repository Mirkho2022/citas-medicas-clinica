import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Tipografías de docs/DESIGN.md: títulos en Plus Jakarta Sans y cuerpo en Inter. next/font las aloja con la propia
// aplicación; el tema (tema.generado.css) las toma de estas variables.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Citas Médicas",
  description: "Sistema de Gestión de Citas e Historias Clínicas Electrónicas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${jakarta.variable} ${inter.variable} antialiased`}>
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
