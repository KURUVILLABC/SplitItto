import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "splitItto — Make splitting the easy part",
  description: "Scan a restaurant receipt, share items fairly, and settle the bill without the awkward math.",
  applicationName: "splitItto",
  icons: { icon: "/splititto-icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#f7f8f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
