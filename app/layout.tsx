import type { Metadata } from "next";
import { Manrope, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SessionProvider } from "@/components/providers/SessionProvider";

/**
 * The same three roles as the landing site, so both surfaces read as one product:
 * Manrope for headings and step names, Instrument Sans for reading, and a mono
 * face wherever raw input or data is shown as itself.
 */
const display = Manrope({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});

const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body" });

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Flowys",
  description:
    "Automate the work that starts with reading something. Build a workflow from plain steps, let an AI do the reading, and get back a decision you can act on.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} font-[family-name:var(--font-body)] antialiased`}
      >
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
