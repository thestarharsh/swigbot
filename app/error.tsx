"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

const TELEGRAM_URL = "https://t.me/swiggy_swigbot";

/** Runtime failures on the site. The webhook and the bot have their own handling. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what Vercel's logs are keyed by; the message itself is
    // kept off the page so a stack or SQL fragment never reaches a visitor.
    console.error("[site] render failed", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="status-page">
      <div className="status-card">
        <Link className="brand" href="/">
          <Image src="/icon.svg" alt="" width={30} height={30} unoptimized />
          <span>
            SwigBot<b>.</b>
          </span>
        </Link>
        <div className="status-code">Oops</div>
        <h1>Something didn&apos;t go right.</h1>
        <p>
          We&apos;re looking into it. Try again in a moment, or head back to the chat; your Swiggy
          account and orders are not affected.
        </p>
        <div className="cta">
          <button className="btn btn-primary" type="button" onClick={reset}>
            Try again
          </button>
          <a className="btn btn-ghost" href={TELEGRAM_URL}>
            Back to the chat
          </a>
        </div>
      </div>
    </main>
  );
}
