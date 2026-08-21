#!/usr/bin/env node
import { existsSync } from "node:fs";
import { bootstrapHarness, HarnessProfile } from "./bootstrap.js";
import { deriveDesignState, deriveTranscript } from "@canva-harness/session";
import { CANVA_DOC_SERVICE_KEY } from "@canva-harness/capabilities";

const args = process.argv.slice(2);
const command = args[0] ?? "doctor";

async function main() {
  const profileFlag = args.find((a) => a.startsWith("--profile="))?.split("=")[1] as HarnessProfile | undefined;
  const profile: HarnessProfile = profileFlag ?? "safe-readonly";

  const harness = await bootstrapHarness(profile);

  switch (command) {
    case "doctor": {
      const appExists = existsSync("/Applications/Canva.app");
      console.log(
        JSON.stringify(
          {
            status: "healthy",
            harness: "@canva-harness/cli",
            version: "0.1.0",
            profile,
            safetyBoundary: {
              canvaAppDetected: appExists,
              path: "/Applications/Canva.app",
              bundleId: "com.canva.canvaeditor",
              isolated: true,
            },
            plugins: harness.pluginManager.list(),
            services: harness.ctx.services.list(),
            tools: harness.toolRegistry.list().map((t) => ({ name: t.name, description: t.description })),
          },
          null,
          2
        )
      );
      break;
    }

    case "inspect": {
      const docService = harness.ctx.services.get(CANVA_DOC_SERVICE_KEY);
      docService.createDesign({ title: "Template Project", format: "presentation" });
      docService.applyBrandKit({
        id: "canva-default",
        name: "Canva Default",
        palette: ["#00C4CC", "#7D2AE8", "#0E1318"],
        fonts: { header: "Canva Sans", body: "Open Sans" },
        primaryColor: "#00C4CC",
      });

      const state = deriveDesignState(harness.session.events());
      const report = docService.validateLayout(state);

      console.log(
        JSON.stringify(
          {
            action: "inspect",
            profile,
            designState: state,
            validationReport: report,
            eventsLogged: harness.session.events().length,
          },
          null,
          2
        )
      );
      break;
    }

    case "review": {
      const files = args.slice(1).filter((a) => !a.startsWith("--"));
      console.log(`[Canva Harness] Running review on ${files.length} document(s)...`);

      const turn = await harness.agentLoop.runTurn(`Review layout and brand specifications for files: ${files.join(", ")}`);

      console.log(
        JSON.stringify(
          {
            status: turn.status,
            filesProcessed: files,
            steps: turn.steps,
            transcript: deriveTranscript(harness.session.events()),
          },
          null,
          2
        )
      );
      break;
    }

    case "run": {
      const userPrompt = args.slice(1).join(" ") || "Create a Canva presentation slide for AI Architecture";
      console.log(`[Canva Harness] Executing prompt: "${userPrompt}" (autoApprove=${harness.policy.autoApprove})`);
      const result = await harness.agentLoop.runTurn(userPrompt, { isApproved: harness.policy.autoApprove });

      console.log(
        JSON.stringify(
          {
            result: result.status,
            steps: result.steps,
            designState: deriveDesignState(harness.session.events()),
            transcript: deriveTranscript(harness.session.events()),
          },
          null,
          2
        )
      );
      break;
    }

    default:
      console.log(`Unknown command: ${command}. Available commands: doctor, inspect, review, run`);
  }
}

main().catch((err) => {
  console.error("[Canva Harness Error]:", err);
  process.exit(1);
});
