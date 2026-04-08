import type { Metadata } from "next";
import { Inter, Archivo_Black } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-inter",
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
    <html lang="en" className={`${inter.variable} ${archivoBlack.variable}`}>
      <body className="min-h-screen font-[family-name:var(--font-inter)]">{children}</body>
    </html>
  );
}
