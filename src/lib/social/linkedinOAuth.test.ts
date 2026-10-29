import { describe, expect, it } from "vitest";

import { linkedInErrorStatus, safeOAuthText } from "@/lib/social/linkedinOAuth";

describe("linkedInErrorStatus", () => {
  it("skiller avbrutt innlogging fra manglende tilgang", () => {
    expect(linkedInErrorStatus("user_cancelled_login")).toBe("linkedin_cancelled");
    expect(linkedInErrorStatus("unauthorized_scope_error")).toBe("linkedin_scope_denied");
  });

  it("gir generell feil for ukjente koder", () => {
    expect(linkedInErrorStatus("server_error")).toBe("linkedin_callback_failed");
  });
});

describe("safeOAuthText", () => {
  it("fjerner tegn som kan forurense loggen og kutter lange tekster", () => {
    expect(safeOAuthText("Scope \"w_organization_social\" is not authorized<script>")).toBe("Scope w_organization_social is not authorizedscript");
    expect(safeOAuthText("a".repeat(400))).toHaveLength(300);
    expect(safeOAuthText(null)).toBeUndefined();
  });
});
