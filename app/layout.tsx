import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { localizacionClerk } from "@/lib/ui/clerk-es";
import "./globals.css";

// Tipografías de docs/02-diseno/DESIGN.md: títulos en Plus Jakarta Sans y cuerpo en Inter. next/font las aloja con la propia
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

// Apariencia de los formularios de Clerk con los tokens de docs/02-diseno/DESIGN.md. Se usan variables CSS del tema (no colores
// literales): un cambio en DESIGN.md y `npm run tema` también los alcanza. Solo tema claro.
const apariencia = {
  variables: {
    colorPrimary: "var(--color-primary)",
    colorTextOnPrimaryBackground: "var(--color-on-primary)",
    colorText: "var(--color-ink)",
    colorTextSecondary: "var(--color-ink-muted)",
    colorBackground: "var(--color-surface)",
    colorInputBackground: "var(--color-surface)",
    colorInputText: "var(--color-ink)",
    colorDanger: "var(--color-error)",
    colorSuccess: "var(--color-success)",
    colorWarning: "var(--color-warning)",
    borderRadius: "var(--radius-md)",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
  },
  // DESIGN.md: plano por defecto, la jerarquía la dan el fondo y el borde, no la sombra. Los estilos de Clerk no van en una
  // capa de CSS, así que ganan a las clases de Tailwind: se sobrescriben como objeto de estilo.
  elements: {
    cardBox: { boxShadow: "none", border: "1px solid var(--color-border)" },
  },
};

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
    // Las variables de las fuentes van en <html>: el tema las usa en `html { font-family }` y en :root (`--font-sans`), y
    // una variable definida en <body> no existe todavía allí (la fuente caería a la serif por defecto del navegador).
    <html lang="es" className={`${jakarta.variable} ${inter.variable}`}>
      <body className="antialiased">
        <ClerkProvider localization={localizacionClerk} appearance={apariencia}>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
