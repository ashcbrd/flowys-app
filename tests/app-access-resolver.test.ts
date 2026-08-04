import { describe, it, expect } from "vitest";
import { userCanAccessApp } from "@/lib/apps/access";

const member = { userId: "u1", role: "member" as const };
const nonMember = { userId: "u1", role: null };

describe("userCanAccessApp", () => {
  it("denies a non-member (null role) for any audience", () => {
    expect(userCanAccessApp({ mode: "workspace" }, nonMember)).toBe(false);
    expect(userCanAccessApp({ mode: "roles", roles: ["member"] }, nonMember)).toBe(false);
    expect(userCanAccessApp({ mode: "users", userIds: ["u1"] }, nonMember)).toBe(false);
  });

  it("allows any member for workspace-mode", () => {
    expect(userCanAccessApp({ mode: "workspace" }, member)).toBe(true);
  });

  it("roles-mode: allows a matching role, denies otherwise", () => {
    expect(userCanAccessApp({ mode: "roles", roles: ["member", "admin"] }, member)).toBe(true);
    expect(userCanAccessApp({ mode: "roles", roles: ["admin"] }, member)).toBe(false);
    expect(userCanAccessApp({ mode: "roles" }, member)).toBe(false); // no list
  });

  it("users-mode: allows a listed user, denies otherwise", () => {
    expect(userCanAccessApp({ mode: "users", userIds: ["u1"] }, member)).toBe(true);
    expect(userCanAccessApp({ mode: "users", userIds: ["u2"] }, member)).toBe(false);
    expect(userCanAccessApp({ mode: "users" }, member)).toBe(false); // no list
  });
});
