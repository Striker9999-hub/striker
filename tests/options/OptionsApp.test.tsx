// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { OptionsApp } from "@/entrypoints/options/OptionsApp";
import { loadGeminiKey, loadSendSettings, saveGeminiKey } from "@/utils/settings";

beforeEach(() => fakeBrowser.reset());
afterEach(cleanup);

async function renderApp() {
  render(<OptionsApp />);
  return screen.findByLabelText("Emails per day");
}

describe("OptionsApp", () => {
  it("shows the free-tier privacy notice", async () => {
    await renderApp();
    expect(screen.getByRole("note").textContent).toMatch(/free tier.*improve its products.*human reviewers/is);
  });

  it("saves the Gemini key and warns softly on an unexpected format", async () => {
    const user = userEvent.setup();
    await renderApp();
    const input = screen.getByLabelText("API key");
    expect(input).toHaveProperty("type", "password");
    await user.type(input, "not-a-key");
    expect(screen.getByText(/usually start with "AIza"/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save key" }));
    await screen.findByText("Key saved.");
    expect(await loadGeminiKey()).toBe("not-a-key");
    await user.click(screen.getByRole("button", { name: "Show key" }));
    expect(input).toHaveProperty("type", "text");
  });

  it("loads an existing key", async () => {
    await saveGeminiKey(`AIza${"k".repeat(35)}`);
    render(<OptionsApp />);
    await waitFor(() => expect(screen.getByLabelText("API key")).toHaveProperty("value", `AIza${"k".repeat(35)}`));
    expect(screen.queryByText(/usually start with/)).toBeNull();
  });

  it("clamps sending settings and explains each adjustment", async () => {
    const user = userEvent.setup();
    const daily = await renderApp();
    await user.clear(daily);
    await user.type(daily, "100");
    const gapMin = screen.getByLabelText("Gap from (minutes)");
    await user.clear(gapMin);
    await user.type(gapMin, "2");
    await user.click(screen.getByLabelText("Fri"));
    await user.click(screen.getByRole("button", { name: "Save sending settings" }));
    await screen.findByText("Sending settings saved.");
    expect(screen.getByText(/Daily limit set to 40/)).toBeTruthy();
    expect(screen.getByText(/Gap set to 5–6 minutes \(never under 5\)/)).toBeTruthy();
    expect(daily).toHaveProperty("value", "40");
    const stored = await loadSendSettings();
    expect(stored.dailySends).toBe(40);
    expect(stored.gapRangeMinutes).toEqual([5, 6]);
    expect(stored.sendWindow.days).toEqual([1, 2, 3, 4]);
  });

  it("saves a stricter window without notes", async () => {
    const user = userEvent.setup();
    const daily = await renderApp();
    await user.clear(daily);
    await user.type(daily, "15");
    const start = screen.getByLabelText("Start");
    await user.clear(start);
    await user.type(start, "10:00");
    await user.type(screen.getByLabelText("Fallback time zone"), "America/Chicago");
    await user.click(screen.getByRole("button", { name: "Save sending settings" }));
    await screen.findByText("Sending settings saved.");
    expect(screen.queryByRole("listitem")).toBeNull();
    const stored = await loadSendSettings();
    expect(stored).toMatchObject({ dailySends: 15, sendWindow: { start: "10:00", fallbackTimeZone: "America/Chicago" } });
  });

  it("deletes all data only after confirmation", async () => {
    const user = userEvent.setup();
    await saveGeminiKey("AIza-something");
    await renderApp();
    await user.click(screen.getByRole("button", { name: "Delete all data…" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await loadGeminiKey()).toBe("AIza-something");
    await user.click(screen.getByRole("button", { name: "Delete all data…" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete everything" }));
    await screen.findByText(/All Striker data in this browser was deleted/);
    expect(await browser.storage.local.get(null)).toEqual({});
  });
});
