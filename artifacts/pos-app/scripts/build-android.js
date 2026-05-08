#!/usr/bin/env node
/**
 * One-command Android APK build via EAS.
 *
 * Usage:
 *   pnpm --filter @workspace/pos-app run build:android
 *
 * Required env:
 *   EXPO_TOKEN  – Expo account token with EAS build access
 *
 * Optional env:
 *   EAS_PROFILE – EAS build profile to use (default: "preview")
 *                 "preview" produces an APK; "production" produces an AAB.
 */

const { spawn } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const profile = process.env.EAS_PROFILE || "preview";

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function printBanner() {
  console.log("=".repeat(60));
  console.log("  Al Salik POS — Android APK build");
  console.log(`  Profile : ${profile}`);
  console.log(`  Dir     : ${projectRoot}`);
  console.log("=".repeat(60));
}

function checkToken() {
  if (!process.env.EXPO_TOKEN) {
    fail(
      "EXPO_TOKEN is not set.\n" +
        "  1. Generate a token at https://expo.dev/accounts/<username>/settings/access-tokens\n" +
        "  2. Add it as a secret named EXPO_TOKEN in your Replit project.",
    );
  }
  console.log("EXPO_TOKEN detected — OK");
}

/**
 * Run `eas build` while streaming output to stdout/stderr in real time.
 * Also collects every output line so we can extract the build URL afterward.
 *
 * EAS CLI prints a line like:
 *   Build details: https://expo.dev/accounts/.../builds/<id>
 * We capture that URL regardless of surrounding formatting.
 *
 * @returns {Promise<string|null>} The captured build URL, or null if not found.
 */
function runEasBuild() {
  return new Promise((resolve, reject) => {
    console.log("\nStarting EAS build (this may take 10-20 minutes)...\n");

    const args = [
      "exec",
      "eas",
      "build",
      "--platform",
      "android",
      "--profile",
      profile,
      "--non-interactive",
    ];

    const child = spawn("pnpm", args, {
      cwd: projectRoot,
      stdio: ["inherit", "pipe", "pipe"],
      env: {
        ...process.env,
        EAS_NO_VCS: "1",
      },
    });

    let buildUrl = null;

    // Line-buffer each stream so the URL regex always operates on complete
    // lines, avoiding false negatives when chunks straddle line boundaries.
    function makeLineBuffer(outputStream) {
      let partial = "";
      return (data) => {
        const text = data.toString();
        outputStream.write(text);
        partial += text;
        const lines = partial.split("\n");
        // Keep the last (possibly incomplete) fragment for the next chunk.
        partial = lines.pop();
        for (const line of lines) {
          // EAS CLI prints the build URL in lines such as:
          //   "Build details: https://expo.dev/..."
          //   "Build URL: https://expo.dev/..."
          //   Or a bare https://expo.dev/.../builds/... line.
          const match = line.match(/https:\/\/expo\.dev\/[^\s"')]+\/builds\/[^\s"')]+/);
          if (match && !buildUrl) {
            buildUrl = match[0].replace(/[.,;]+$/, "");
          }
        }
      };
    }

    child.stdout.on("data", makeLineBuffer(process.stdout));
    child.stderr.on("data", makeLineBuffer(process.stderr));

    child.on("error", (err) => reject(new Error(`Failed to spawn EAS CLI: ${err.message}`)));

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`EAS build exited with code ${code}`));
      } else {
        resolve(buildUrl);
      }
    });
  });
}

function printFooter(buildUrl) {
  console.log("\n" + "=".repeat(60));
  console.log("  Build submitted successfully!");
  if (buildUrl) {
    console.log("  Build URL / download link:");
    console.log(`  ${buildUrl}`);
  } else {
    console.log("  Track your build at:");
    console.log("  https://expo.dev/builds");
  }
  console.log("=".repeat(60) + "\n");
}

async function main() {
  printBanner();
  checkToken();
  const buildUrl = await runEasBuild();
  printFooter(buildUrl);
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message}\n`);
  process.exit(1);
});
