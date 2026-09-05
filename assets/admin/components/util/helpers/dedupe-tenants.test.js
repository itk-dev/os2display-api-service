import { describe, expect, it } from "vitest";
import dedupeTenants from "./dedupe-tenants";

describe("dedupeTenants", () => {
  it("keeps one entry per tenantKey, in first-seen order", () => {
    const tenants = [
      { tenantKey: "ABC", title: "ABC Tenant" },
      { tenantKey: "XYZ", title: "XYZ Tenant" },
      { tenantKey: "ABC", title: "ABC Tenant" },
      { tenantKey: "XYZ", title: "XYZ Tenant" },
    ];

    expect(dedupeTenants(tenants).map(({ tenantKey }) => tenantKey)).toEqual([
      "ABC",
      "XYZ",
    ]);
  });

  it("keeps the first occurrence, not the last", () => {
    const first = { tenantKey: "ABC", title: "Original" };

    expect(dedupeTenants([first, { tenantKey: "ABC", title: "Copy" }])).toEqual(
      [first],
    );
  });

  it("leaves an already-distinct list untouched", () => {
    const tenants = [{ tenantKey: "ABC" }, { tenantKey: "DEF" }];

    expect(dedupeTenants(tenants)).toEqual(tenants);
  });

  it("returns an empty list for a user with no tenants", () => {
    // An external OIDC user awaiting activation legitimately has none — the
    // caller distinguishes this from a malformed payload itself.
    expect(dedupeTenants([])).toEqual([]);
  });

  it("returns an empty list for a non-array payload", () => {
    // `tenants` can arrive as a JSON object when the backend serialises a
    // gap-keyed array; callers must not blow up on `.length` or `.map`.
    expect(dedupeTenants({ 1: { tenantKey: "ABC" } })).toEqual([]);
    expect(dedupeTenants(undefined)).toEqual([]);
    expect(dedupeTenants(null)).toEqual([]);
  });
});
