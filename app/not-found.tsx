import Image from "next/image";
import Link from "next/link";

const TELEGRAM_URL = "https://t.me/swiggy_swigbot";

export default function NotFound() {
  return (
    <main className="status-page">
      <div className="status-card">
        <Link className="brand" href="/">
          <Image src="/icon.svg" alt="" width={30} height={30} unoptimized />
          <span>
            SwigBot<b>.</b>
          </span>
        </Link>
        <div className="status-code">404</div>
        <h1>That page isn&apos;t here.</h1>
        <p>
          Something didn&apos;t go right on the way, and we&apos;re looking into it. If you got here
          from a login link, go back to the chat and send <b>/start</b> for a fresh one.
        </p>
        <div className="cta">
          <a className="btn btn-primary" href={TELEGRAM_URL}>
            Back to the chat
          </a>
          <Link className="btn btn-ghost" href="/">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
