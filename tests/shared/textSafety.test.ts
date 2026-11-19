import { describe, expect, it } from "vitest";
import { bodyProblem, subjectProblem } from "@/shared/textSafety";

describe("subjectProblem", () => {
  it.each(["=SUM(1)", "+1", "-x", "@me", "  =x"])("rejects %j", (s) => {
    expect(subjectProblem(s)).toMatch(/^Subject can't start with '.'\. Please rephrase\.$/);
  });
  it("allows ordinary subjects", () => {
    expect(subjectProblem("Quick question about Acme")).toBeNull();
    expect(subjectProblem("Re: 2 + 2")).toBeNull();
  });
});

describe("bodyProblem", () => {
  it("rejects a body starting with '-'", () => {
    expect(bodyProblem("- hi")).toBe("The email can't start with '-'. Please rephrase.");
  });
  it("names the offending line", () => {
    expect(bodyProblem("Hi\n\n=HYPERLINK(x)")).toBe("Line 3 of the email can't start with '='. Please rephrase.");
    expect(bodyProblem("Hi\r\n  @handle")).toBe("Line 2 of the email can't start with '@'. Please rephrase.");
  });
  it("allows bullets after the first line", () => {
    expect(bodyProblem("Hi,\n- one\n- two")).toBeNull();
  });
});
