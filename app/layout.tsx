import type { ReactNode } from "react";

export const metadata = {
  title: "SwigBot",
  description: "Conversational commerce agent for Swiggy MCP",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
