import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SosialVekst — Sosiale medier på autopilot",
  description:
    "Vi lager poster med tekst og bilder tilpasset bedriften din, og publiserer automatisk til Facebook, Instagram og LinkedIn.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nb" className={plusJakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
