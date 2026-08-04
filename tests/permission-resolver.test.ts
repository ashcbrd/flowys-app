import { describe, it, expect } from "vitest";
import {
  userCanSeeDocument,
  resolveAllowedDocumentIds,
  type DocRef,
} from "@/lib/workspaces/permissions";

const member = { userId: "u1", role: "member" as const };

describe("userCanSeeDocument", () => {
  it("shows workspace-mode documents to any member", () => {
    const doc: DocRef = { _id: "d1", acl: { mode: "workspace" } };
    expect(userCanSeeDocument(doc, member)).toBe(true);
  });

  it("hides a restricted document from a user not on any allow-list", () => {
    const doc: DocRef = { _id: "d1", acl: { mode: "restricted" } };
    expect(userCanSeeDocument(doc, member)).toBe(false);
  });

  it("shows a restricted document to a user on allowedUserIds", () => {
    const doc: DocRef = { _id: "d1", acl: { mode: "restricted", allowedUserIds: ["u1"] } };
    expect(userCanSeeDocument(doc, member)).toBe(true);
  });

  it("shows a restricted document to a user whose role is allowed", () => {
    const doc: DocRef = { _id: "d1", acl: { mode: "restricted", allowedRoles: ["member"] } };
    expect(userCanSeeDocument(doc, member)).toBe(true);
  });

  it("does not give owners an implicit bypass of restricted documents", () => {
    const owner = { userId: "u9", role: "owner" as const };
    const doc: DocRef = { _id: "d1", acl: { mode: "restricted", allowedUserIds: ["u1"] } };
    expect(userCanSeeDocument(doc, owner)).toBe(false);
  });

  it("denies a workspace-mode document when role is null (non-member)", () => {
    const nonMember = { userId: "u1", role: null };
    const doc: DocRef = { _id: "d1", acl: { mode: "workspace" } };
    expect(userCanSeeDocument(doc, nonMember)).toBe(false);
  });

  it("denies a restricted document when role is null (non-member)", () => {
    const nonMember = { userId: "u1", role: null };
    const doc: DocRef = { _id: "d1", acl: { mode: "restricted", allowedUserIds: ["u1"] } };
    expect(userCanSeeDocument(doc, nonMember)).toBe(false);
  });

  it("denies a restricted document with an empty allow-list for a normal member", () => {
    const doc: DocRef = { _id: "d1", acl: { mode: "restricted", allowedUserIds: [] } };
    expect(userCanSeeDocument(doc, member)).toBe(false);
  });
});

describe("resolveAllowedDocumentIds", () => {
  it("returns only the ids the user may see", () => {
    const docs: DocRef[] = [
      { _id: "d1", acl: { mode: "workspace" } },
      { _id: "d2", acl: { mode: "restricted", allowedUserIds: ["u1"] } },
      { _id: "d3", acl: { mode: "restricted", allowedRoles: ["admin"] } },
    ];
    expect(resolveAllowedDocumentIds(docs, member)).toEqual(["d1", "d2"]);
  });

  it("returns an empty array when nothing is visible", () => {
    const docs: DocRef[] = [{ _id: "d1", acl: { mode: "restricted" } }];
    expect(resolveAllowedDocumentIds(docs, member)).toEqual([]);
  });
});
