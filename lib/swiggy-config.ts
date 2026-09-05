/** Base URL and server layout for Swiggy MCP, shared by the session and auth. */

export const swiggyBaseUrl = (): string =>
  process.env.SWIGGY_MCP_BASE_URL ?? "https://mcp.swiggy.com";

export type ServerKey = "food" | "instamart" | "dineout";

/** Registration order is load-bearing: see SwiggyMcpSession.connect. */
export const SWIGGY_SERVERS: { key: ServerKey; path: string }[] = [
  { key: "food", path: "/food" },
  { key: "instamart", path: "/im" },
  { key: "dineout", path: "/dineout" },
];
