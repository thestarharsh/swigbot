import Image from "next/image";
import Link from "next/link";

const TELEGRAM_URL = "https://t.me/swiggy_swigbot";
const CARE_NUMBER = "080-67466729";

const Telegram = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M21.9 4.6 18.7 19.7c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.5-.6-.2L6.2 13.4 1.4 11.9c-1.1-.3-1.1-1.1.2-1.6L20.5 3c.9-.3 1.7.2 1.4 1.6Z" />
  </svg>
);

const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2">
    <circle cx="12" cy="12" r="9.5" />
    <path d="m7.5 12.3 3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Home() {
  return (
    <>
      <header className="wrap">
        <nav className="nav" aria-label="Primary">
          <Link className="brand" href="/">
            <Image src="/icon.svg" alt="" width={30} height={30} unoptimized />
            <span>
              SwigBot<b>.</b>
            </span>
          </Link>
          <div className="nav-links">
            <a className="hide-sm" href="#what">
              What it does
            </a>
            <a className="hide-sm" href="#how">
              How it works
            </a>
            <a className="hide-sm" href="#safety">
              Safety
            </a>
            <a className="btn btn-primary" href={TELEGRAM_URL}>
              <Telegram /> Open in Telegram
            </a>
          </div>
        </nav>
      </header>

      <main className="wrap">
        <section className="hero">
          <div>
            <div className="eyebrow">Works with your Swiggy account</div>
            <h1>
              Order Swiggy <em>by chatting.</em>
            </h1>
            <p className="lede">
              Food, groceries and table bookings, all from a Telegram chat. SwigBot shows you
              exactly what it&apos;s about to order, waits for your yes, and sends you a link to
              pay. Nothing is ordered until you say so.
            </p>
            <div className="cta">
              <a className="btn btn-primary" href={TELEGRAM_URL}>
                <Telegram /> Start on Telegram
              </a>
              <a className="btn btn-ghost" href="#how">
                How it works
              </a>
            </div>
            <p className="fineprint">
              {/* String child, not bare text: SWC drops the space after an inline tag when
                  the text wraps to a new line (swc-project/swc#542), and Prettier re-flows
                  a {" "} back into exactly that shape. */}
              Free to use. Send <b>/start</b>
              {" to the bot, log in with your Swiggy phone number, and you're set."}
            </p>
          </div>

          <div className="phone" aria-label="Example conversation">
            <div className="phone-top">
              <Image src="/icon.svg" alt="" width={34} height={34} unoptimized />
              <div>
                <div className="name">SwigBot</div>
                <div className="status">online</div>
              </div>
            </div>
            <div className="chat">
              <div className="msg user">cheese pizza near home, under 400</div>
              <div className="msg bot">
                {"3 open right now, delivering to Home:\n"}
                {"🧾 Domino's · Margherita ₹239 · 30 min\n"}
                {"🧾 La Pino'z · Cheese Burst ₹329 · 35 min\n"}
                {"🧾 Pizza Hut · Double Cheese ₹359 · 40 min\n"}
                {"Which one, or want more?"}
              </div>
              <div className="msg user">first one, and a coke</div>
              <div className="msg bot">
                {"Cart at Domino's:\n"}
                {"Margherita ×1  ₹239\n"}
                {"Coke 300ml ×1  ₹40\n"}
                {"Total ₹279 · deliver to Home · UPI\n"}
                {"Reply Yes ✅ to place it."}
              </div>
              <div className="msg user">yes</div>
              <div className="msg bot">
                {"Almost there. Pay here to place the order:\n"}
                <span className="link">swiggy.com/pay/…</span>
                {"\nSay “paid” when done and I’ll confirm it."}
              </div>
            </div>
          </div>
        </section>

        <section id="what">
          <div className="section-head">
            <div className="eyebrow">What it does</div>
            <h2>Three Swiggy services, one chat.</h2>
            <p>
              Everything comes straight from Swiggy at that moment, so what you see is what the app
              would show you: restaurants that are open, items in stock, tables that are actually
              free.
            </p>
          </div>
          <div className="grid-3">
            <div className="tile">
              <span className="kicker">Food</span>
              <h3>Restaurants and menus</h3>
              <p>
                Find what&apos;s open near you, ask for a dish or browse a menu, get the best coupon
                applied, and follow your rider to the door.
              </p>
              <div className="ex">
                Try: <b>&ldquo;something spicy under ₹300 near work&rdquo;</b>
              </div>
            </div>
            <div className="tile">
              <span className="kicker">Instamart</span>
              <h3>Groceries in minutes</h3>
              <p>
                Reorder your usuals in one line, or ask for items one by one. You see the whole cart
                and the bill before anything is placed.
              </p>
              <div className="ex">
                Try: <b>&ldquo;my usual milk and eggs, plus bananas&rdquo;</b>
              </div>
            </div>
            <div className="tile">
              <span className="kicker">Dineout</span>
              <h3>Table bookings</h3>
              <p>
                Find a place by area or cuisine, pick a free time slot, and book for your group.
                Change of plans? Cancel in the same chat.
              </p>
              <div className="ex">
                Try: <b>&ldquo;table for 4 in Indiranagar, Saturday 8pm&rdquo;</b>
              </div>
            </div>
          </div>
        </section>

        <section id="how">
          <div className="section-head">
            <div className="eyebrow">How it works</div>
            <h2>Log in once, then just talk.</h2>
          </div>
          <ol className="steps">
            <li>
              <h3>Send /start</h3>
              <p>
                Open SwigBot on Telegram and send <b>/start</b>. You&apos;ll get a link to log in
                with your Swiggy phone number and OTP, the same login you use in the app.
              </p>
            </li>
            <li>
              <h3>Say what you want</h3>
              <p>
                Type the way you&apos;d text a friend, in English or Hinglish. SwigBot already knows
                your saved addresses and asks one question at a time when it needs a choice.
              </p>
            </li>
            <li>
              <h3>Confirm and pay</h3>
              <p>
                You get the full summary, items, total and address, and reply yes. A payment link
                then opens your UPI app or shows a QR. The order goes through only after you&apos;ve
                paid.
              </p>
            </li>
          </ol>
        </section>

        <section id="safety">
          <div className="section-head">
            <div className="eyebrow">Safety</div>
            <h2>Built so you stay in control.</h2>
            <p>
              A chat assistant can misunderstand you. These rules are built in so a slip never costs
              you money.
            </p>
          </div>
          <ul className="rules">
            <li>
              <Check />
              <span>
                <b>Nothing is ordered without your yes.</b> SwigBot always shows the full order
                first and waits for you to confirm it.
              </span>
            </li>
            <li>
              <Check />
              <span>
                <b>No double orders.</b> Once an order goes through, the same one can&apos;t be
                placed again by mistake.
              </span>
            </li>
            <li>
              <Check />
              <span>
                <b>Spending limits.</b> Food orders stay under ₹1,000 and Instamart orders meet the
                ₹99 minimum, checked every time before placing.
              </span>
            </li>
            <li>
              <Check />
              <span>
                <b>Your payment details stay with Swiggy.</b> Paying happens on Swiggy&apos;s own
                page. SwigBot never asks for a UPI ID, card number or OTP.
              </span>
            </li>
            <li>
              <Check />
              <span>
                <b>Always up to date.</b> Prices, availability and your cart are checked fresh each
                time, so you&apos;re never shown something that has changed.
              </span>
            </li>
            <li>
              <Check />
              <span>
                <b>Need to cancel?</b> Food and grocery orders are cancelled by Swiggy customer care
                on {CARE_NUMBER}. Table bookings can be cancelled right in the chat.
              </span>
            </li>
          </ul>
        </section>

        <section className="closing">
          <h2>Food, groceries or a table, a message away.</h2>
          <p>Open the bot, send /start, and log in. It takes about thirty seconds.</p>
          <a className="btn btn-primary" href={TELEGRAM_URL}>
            <Telegram /> Open @swiggy_swigbot
          </a>
        </section>
      </main>

      <footer className="wrap">
        <span>
          An independent project built on Swiggy&apos;s developer platform. Not affiliated with
          Swiggy.
        </span>
        <a href={TELEGRAM_URL}>Open on Telegram</a>
      </footer>
    </>
  );
}
