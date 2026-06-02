import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "🌍TMG23A World Cup 2026🇳🇴",
    template: "%s · World Cup 2026",
  },
  description: "Fyttihelvete vi skal til VM!!!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
      )}
    >
      <body className="flex min-h-dvh flex-col bg-background text-foreground">
        <header className="border-b">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="font-heading text-base font-semibold tracking-tight"
            >
              TMG23A World Cup 2026
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link
                href="/"
                className="transition-colors hover:text-foreground"
              >
                Schedule
              </Link>
              <Link
                href="/stats"
                className="transition-colors hover:text-foreground"
              >
                Stats
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="border-t">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
            <p>TMG23A World Cup 2026</p>
            <p>
              Fixtures via openfootball · Weather via Open-Meteo · Times shown
              in Oslo time (CEST)
            </p>
          </div>
        </footer>
        <Toaster />
      </body>
    </html>
  );
}
