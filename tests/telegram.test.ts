import { describe, expect, it } from "vitest";
import { toPlainText } from "../lib/telegram";

const LOGIN_URL =
  "https://mcp.swiggy.com/auth/authorize?response_type=code&client_id=swiggy-mcp" +
  "&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback%2Fswiggy" +
  "&code_challenge=abc_def&code_challenge_method=S256&state=x_y_z&scope=mcp%3Atools";

describe("toPlainText", () => {
  it("leaves an OAuth login URL byte-identical", () => {
    // Telegram's Markdown parser ate these underscores, breaking every login.
    const out = toPlainText(`Tap this link to log in:\n\n${LOGIN_URL}\n\nThen message me.`);
    expect(out).toContain(LOGIN_URL);
    expect(out).toContain("response_type=code");
    expect(out).toContain("code_challenge_method=S256");
  });

  it("preserves underscores regardless of how many there are", () => {
    expect(toPlainText("a_b_c_d")).toBe("a_b_c_d");
    expect(toPlainText("a_b_c")).toBe("a_b_c");
  });

  it("strips emphasis markers instead of leaking them as punctuation", () => {
    expect(toPlainText("**Total:** *249*")).toBe("Total: 249");
    expect(toPlainText("`orderId` is 42")).toBe("orderId is 42");
  });

  it("flattens inline links to label plus URL", () => {
    expect(toPlainText("[Log in](https://x.test/a_b)")).toBe("Log in: https://x.test/a_b");
  });

  it("unwraps fenced code blocks", () => {
    expect(toPlainText('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});
