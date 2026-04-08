import type { Metadata } from "next";
import { Archivo_Black, Barlow } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-barlow",
});

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "Hot Ones Live",
  description: "Play Hot Ones with friends! Create a room, share the code, and see who can handle the heat.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${barlow.variable} ${archivoBlack.variable}`}>
      <body className="min-h-screen font-[family-name:var(--font-barlow)]">{children}</body>
    </html>
  );
}
