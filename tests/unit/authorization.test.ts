import { describe, expect, it } from "vitest";

import { authorizePermission, type StaffPrincipal } from "@/modules/auth";

const activeStaff: StaffPrincipal = {
  accountType: "staff",
  permissionKeys: new Set(["admin.access"]),
  status: "active",
  userId: "04a1c92c-b890-46e6-9263-c08e966de1f7",
};

describe("authorizePermission", () => {
  it("denies anonymous users by default", () => {
    expect(authorizePermission(null, "admin.access")).toEqual({
      allowed: false,
      reason: "anonymous",
    });
  });

  it("denies active staff without an explicit grant", () => {
    expect(
      authorizePermission({ ...activeStaff, permissionKeys: new Set() }, "admin.access"),
    ).toEqual({
      allowed: false,
      reason: "missing_permission",
    });
  });

  it("denies customer accounts even if a malformed grant exists", () => {
    expect(
      authorizePermission({ ...activeStaff, accountType: "customer" }, "admin.access"),
    ).toEqual({
      allowed: false,
      reason: "customer_account",
    });
  });

  it("denies suspended staff with a grant", () => {
    expect(authorizePermission({ ...activeStaff, status: "suspended" }, "admin.access")).toEqual({
      allowed: false,
      reason: "suspended",
    });
  });

  it("allows active staff with the explicit permission", () => {
    expect(authorizePermission(activeStaff, "admin.access")).toEqual({
      allowed: true,
      principal: activeStaff,
    });
  });
});
