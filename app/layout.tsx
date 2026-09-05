import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwigBot",
  description:
    "Order Swiggy food and groceries, or book a table, by chatting on Telegram. SwigBot shows you the order, waits for your yes, and sends a link to pay.",
  openGraph: {
    title: "SwigBot",
    description: "Order Swiggy by chatting on Telegram.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF7F1" },
    { media: "(prefers-color-scheme: dark)", color: "#171310" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
