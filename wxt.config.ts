import { defineConfig } from "wxt";

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Striker",
    description: "Paced, personalized job-search outreach from your own Gmail.",
    // Minimum permissions (NFR12, NFR18). Per-site host access for research
    // is requested at runtime later (FR11), never declared here.
    permissions: ["storage", "sidePanel"],
    action: { default_title: "Open Striker" },
  },
});
