import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { handleCallback } from "@/lib/swiggy-auth";
import { db, schema } from "@/lib/db";
import { sendMessage } from "@/lib/telegram";
import { renderAuthPage, type AuthPageOptions } from "@/lib/auth-pages";

function page(opts: AuthPageOptions, status: number) {
  return new NextResponse(renderAuthPage(opts), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Users see plain language; the raw error (SQL, stack, cause) goes to the server log only. */
function friendlyAuthError(err: unknown): { message: string; steps: string[] } {
  const text = err instanceof Error ? `${err.message} ${String(err.cause ?? "")}` : String(err);
  if (/Failed query|ECONNREFUSED|Connection terminated|database|relation .* does not exist/i.test(text)) {
    return {
      message: "SwigBot couldn't reach its database, so the login couldn't be saved.",
      steps: [
        "Check DATABASE_URL in .env.local and that the database is reachable",
        "If it's a fresh database, run: pnpm db:push",
        "Ask the bot for a new login link and try again",
      ],
    };
  }
  if (/expired|already-used|Unknown or already-used/i.test(text)) {
    return {
      message: "This login link was already used or has expired. Links are single-use and last 15 minutes.",
      steps: ["Go back to your chat", "Send any message to get a fresh link", "Open it right away"],
    };
  }
  if (/Token exchange failed/i.test(text)) {
    return {
      message: "Swiggy rejected the login code. Codes expire 120 seconds after the OTP screen.",
      steps: ["Go back to your chat", "Send any message to get a fresh link", "Complete the OTP without pausing"],
    };
  }
  return {
    message: "Something went wrong on our side while finishing the login.",
    steps: ["Go back to your chat", "Send any message to get a fresh link", "Try once more"],
  };
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return page(
      {
        variant: "error",
        title: "This link is incomplete",
        message: "The login link is missing its security code. It may have been cut off when copied.",
        steps: [
          "Go back to your chat",
          "Send any message to get a fresh link",
          "Open the link directly instead of copy-pasting part of it",
        ],
      },
      400,
    );
  }

  try {
    const userId = await handleCallback(code, state);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (user?.platform === "telegram") {
      await sendMessage(
        user.platformUserId,
        "Your Swiggy account is linked ✅ What would you like to order?",
      ).catch(() => {});
    }

    return page(
      {
        variant: "success",
        title: "You're all set!",
        message:
          "Your Swiggy account is linked to SwigBot for the next 5 days. You can close this tab.",
        steps: [
          "Head back to your chat",
          "Try: “find biryani near home”",
          "SwigBot always confirms with you before placing any order",
        ],
      },
      200,
    );
  } catch (err) {
    console.error("[oauth-callback] failed:", err, err instanceof Error ? err.cause : "");
    const friendly = friendlyAuthError(err);
    return page(
      {
        variant: "error",
        title: "Couldn't link your account",
        message: friendly.message,
        steps: friendly.steps,
      },
      400,
    );
  }
}
