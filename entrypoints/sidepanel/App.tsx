import { MAX_DAILY_SENDS, MIN_GAP_MINUTES } from "@/shared/limits";

export function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <h1 style={{ fontSize: 18 }}>Striker</h1>
      <p>
        Campaigns arrive in a later milestone. Sending is capped at {MAX_DAILY_SENDS} emails a day with at least{" "}
        {MIN_GAP_MINUTES} minutes between sends.
      </p>
      <button type="button" onClick={() => void browser.runtime.openOptionsPage()}>
        Open settings
      </button>
    </main>
  );
}
