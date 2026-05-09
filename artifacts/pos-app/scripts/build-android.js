#!/usr/bin/env node
/**
 * One-command Android build via EAS.
 *
 * Usage:
 *   pnpm --filter @workspace/pos-app run build:android           # APK (preview)
 *   pnpm --filter @workspace/pos-app run build:android:release   # AAB (production)
 *   node scripts/build-android.js --release                      # same as above
 *
 * Profile selection (highest priority wins):
 *   1. --release CLI flag  -> "production" (AAB)
 *   2. EAS_PROFILE env var -> whatever value you set
 *   3. default             -> "preview"   (APK)
 *
 * Required env:
 *   EXPO_TOKEN        - Expo account token with EAS build access
 *
 * Optional env:
 *   EAS_PROFILE       - EAS build profile to use (default: "preview")
 *                       "preview" produces an APK; "production" produces an AAB.
 *   EAS_NO_DOWNLOAD   - Set to "1" to skip the automatic APK download and only
 *                       print the direct link.
 *   BUILD_WEBHOOK_URL - Shared team webhook URL to POST a notification when the
 *                       build finishes or fails. Payload is Slack-compatible, so a
 *                       Slack incoming-webhook URL works out of the box. Also
 *                       works with Discord and any generic JSON webhook.
 *                       Store this value as a Replit secret named BUILD_WEBHOOK_URL.
 *                       Individual developers can override this (and more) via the
 *                       per-developer config file described below.
 *
 * Per-developer notification config (.build-notify.json):
 *   Each developer can create a file named `.build-notify.json` in the
 *   `artifacts/pos-app/` directory to customise where build notifications are
 *   sent.  This file is git-ignored so personal URLs never end up in source
 *   control.  Supported fields:
 *
 *   {
 *     "webhookUrl": "https://hooks.slack.com/services/YOUR/PERSONAL/WEBHOOK",
 *     "channel":    "#my-personal-channel",
 *     "mute":       false
 *   }
 *
 *   Field reference:
 *     webhookUrl  (string)  Personal webhook URL. Overrides BUILD_WEBHOOK_URL.
 *                           Must be an HTTPS URL. Works with Slack incoming
 *                           webhooks, Discord, and any JSON-accepting endpoint.
 *     channel     (string)  Optional Slack channel name (e.g. "#builds").
 *                           Included in the notification payload when provided.
 *     mute        (boolean) When true, suppresses all notifications regardless
 *                           of whether BUILD_WEBHOOK_URL is also set.
 *
 *   Resolution order (highest priority first):
 *     1. .build-notify.json  webhookUrl  (personal override)
 *     2. BUILD_WEBHOOK_URL   env var     (shared team secret / Replit secret)
 *     3. No notifications    (neither source provides a URL)
 */

const { spawn } = require("child_process");
const https = require("https");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

// --release flag overrides everything -> always "production".
const hasReleaseFlag = process.argv.includes("--release");
const profile = hasReleaseFlag
  ? "production"
  : (process.env.EAS_PROFILE || "preview");

const skipDownload = process.env.EAS_NO_DOWNLOAD === "1";

/**
 * Load the optional per-developer notification config from `.build-notify.json`.
 * Returns an object with { webhookUrl, channel, mute } — all fields optional.
 * Returns an empty object if the file does not exist or cannot be parsed.
 *
 * The result is cached after the first call so the file is read at most once
 * per process and any parse-error warnings appear exactly once.
 *
 * @returns {{ webhookUrl?: string, channel?: string, mute?: boolean }}
 */
let _notifyConfigCache = null;
function loadNotifyConfig() {
  if (_notifyConfigCache !== null) return _notifyConfigCache;
  const configPath = path.join(projectRoot, ".build-notify.json");
  if (!fs.existsSync(configPath)) {
    _notifyConfigCache = {};
    return _notifyConfigCache;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      console.warn("  [notify] .build-notify.json must be a JSON object — ignoring.");
      _notifyConfigCache = {};
      return _notifyConfigCache;
    }
    _notifyConfigCache = {
      webhookUrl: typeof parsed.webhookUrl === "string" ? parsed.webhookUrl : undefined,
      channel:    typeof parsed.channel    === "string" ? parsed.channel    : undefined,
      mute:       parsed.mute === true,
    };
    return _notifyConfigCache;
  } catch (err) {
    console.warn(`  [notify] Failed to read .build-notify.json: ${err.message} — ignoring.`);
    _notifyConfigCache = {};
    return _notifyConfigCache;
  }
}

/**
 * Resolve the webhook URL and mute flag from the per-developer config file
 * and the BUILD_WEBHOOK_URL environment variable.
 *
 * Resolution order (highest priority first):
 *   1. .build-notify.json webhookUrl
 *   2. BUILD_WEBHOOK_URL env var
 *
 * If mute is true in .build-notify.json, returns { webhookUrl: null, mute: true }.
 *
 * Also returns `urlSource` ("local-config" | "env-var" | null) so callers can
 * accurately report which source provided the webhook URL.
 *
 * @returns {{ webhookUrl: string|null, channel: string|null, mute: boolean, urlSource: string|null }}
 */
function resolveNotifySettings() {
  const config = loadNotifyConfig();
  if (config.mute) {
    return { webhookUrl: null, channel: null, mute: true, urlSource: null };
  }
  if (config.webhookUrl) {
    return {
      webhookUrl: config.webhookUrl,
      channel: config.channel || null,
      mute: false,
      urlSource: "local-config",
    };
  }
  const envUrl = process.env.BUILD_WEBHOOK_URL || null;
  return {
    webhookUrl: envUrl,
    channel: null,
    mute: false,
    urlSource: envUrl ? "env-var" : null,
  };
}

/**
 * Send a build notification to the configured webhook URL.
 *
 * The webhook URL is resolved from .build-notify.json first, then the
 * BUILD_WEBHOOK_URL environment variable. The payload is Slack-compatible
 * (works with Slack incoming webhooks, Discord webhook URLs, and any service
 * that accepts JSON POST requests). Only HTTPS webhook URLs are supported.
 *
 * @param {"success"|"failure"|"cancelled"|"timeout"} outcome
 * @param {string|null} buildUrl  EAS dashboard URL
 * @param {string|null} artifactUrl  Direct download URL (success only)
 * @param {string|null} [installUrl]  One-click install URL for internal distribution builds
 * @param {string|null} [errorMessage]  Short error description for failure payloads
 * @returns {Promise<void>}
 */
async function sendWebhookNotification(outcome, buildUrl, artifactUrl, installUrl = null, errorMessage = null) {
  const { webhookUrl, channel, mute } = resolveNotifySettings();

  if (mute) {
    console.log("  [notify] Notifications muted via .build-notify.json — skipping.");
    return;
  }

  if (!webhookUrl) return;

  let parsed;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    console.warn("  [notify] Webhook URL is not valid — skipping notification.");
    return;
  }

  if (parsed.protocol !== "https:") {
    console.warn(
      `  [notify] Webhook URL uses protocol "${parsed.protocol}" — only HTTPS is supported. Skipping notification.`
    );
    return;
  }

  const isSuccess = outcome === "success";
  const color = isSuccess ? "#2eb886" : "#e01e5a";
  const emoji = isSuccess ? ":white_check_mark:" : ":x:";
  const statusLabel =
    outcome === "success"   ? "FINISHED — build succeeded" :
    outcome === "cancelled" ? "CANCELLED" :
    outcome === "timeout"   ? "TIMED OUT (check dashboard)" :
    "FAILED";

  const fields = [
    { title: "Profile", value: profile, short: true },
    { title: "Outcome", value: statusLabel, short: true },
  ];
  if (errorMessage) {
    fields.push({ title: "Error", value: errorMessage, short: false });
  }
  if (buildUrl) {
    fields.push({ title: "Dashboard", value: buildUrl, short: false });
  }
  if (artifactUrl) {
    fields.push({ title: "Download", value: artifactUrl, short: false });
  }
  if (installUrl) {
    fields.push({ title: "Install on device", value: installUrl, short: false });
  }

  const payloadObj = {
    text: `${emoji} *Al Salik Android build — ${statusLabel}*`,
    attachments: [
      {
        color,
        fields,
        footer: `EAS build · profile: ${profile}`,
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  if (channel) {
    payloadObj.channel = channel;
  }

  const payload = JSON.stringify(payloadObj);

  return new Promise((resolve) => {
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      res.resume();
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`  [notify] Webhook delivered (HTTP ${res.statusCode}).`);
      } else {
        console.warn(`  [notify] Webhook returned HTTP ${res.statusCode} — notification may not have been received.`);
      }
      resolve();
    });

    req.on("error", (err) => {
      console.warn(`  [notify] Webhook request failed: ${err.message}`);
      resolve();
    });

    req.setTimeout(10_000, () => {
      console.warn("  [notify] Webhook request timed out — skipping.");
      req.destroy();
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

const EXPO_API_BASE = "https://api.expo.dev";
/** How long to wait between status polls (ms). */
const POLL_INTERVAL_MS = 30_000;
/** Give up polling after this many minutes. EAS builds rarely exceed 40 min. */
const POLL_TIMEOUT_MS = 50 * 60 * 1000;

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function printBanner() {
  const artifactType = profile === "production" ? "AAB" : "APK";
  console.log("=".repeat(60));
  console.log(`  Al Salik POS — Android ${artifactType} build`);
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
        EAS_SKIP_AUTO_FINGERPRINT: "1",
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

/**
 * Extract the build UUID from an EAS dashboard URL.
 * URL shape: https://expo.dev/accounts/<acct>/projects/<slug>/builds/<uuid>
 *
 * @param {string|null} buildUrl
 * @returns {string|null}
 */
function extractBuildId(buildUrl) {
  if (!buildUrl) return null;
  const match = buildUrl.match(/\/builds\/([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

/**
 * Perform a single HTTPS GET and resolve with the parsed JSON body.
 * Rejects immediately on permanent HTTP errors (4xx) to avoid burning the
 * entire polling timeout on auth or routing problems.
 *
 * @param {string} url
 * @param {Record<string,string>} headers
 * @returns {Promise<unknown>}
 */
function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const options = { headers };
    https.get(url, options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        // Fail fast on permanent client errors — retrying won't help.
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error(
            `Expo API returned HTTP ${res.statusCode}. ` +
            "Check that EXPO_TOKEN is valid and has EAS build access."
          ));
          return;
        }
        if (res.statusCode === 404) {
          reject(new Error(
            `Expo API returned HTTP 404 for build. ` +
            "The build ID may be incorrect or the build was deleted."
          ));
          return;
        }
        // For other non-2xx codes (5xx, etc.) surface but let caller retry.
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Expo API returned HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Failed to parse API response: ${body.slice(0, 200)}`));
        }
      });
    }).on("error", reject);
  });
}

/**
 * Sleep for `ms` milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the Expo API until the build reaches a terminal state.
 *
 * Terminal states: FINISHED, ERRORED, CANCELLED, EXPIRED.
 * In-progress states: NEW, IN_QUEUE, IN_PROGRESS.
 *
 * @param {string} buildId
 * @returns {Promise<{status: string, apkUrl: string|null}>}
 */
async function pollBuildStatus(buildId) {
  const apiUrl = `${EXPO_API_BASE}/v2/builds/${buildId}`;
  const headers = {
    Authorization: `Bearer ${process.env.EXPO_TOKEN}`,
    "Content-Type": "application/json",
  };

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let attempt = 0;

  console.log(`\nPolling build status for ID: ${buildId}`);
  console.log(`(checking every ${POLL_INTERVAL_MS / 1000}s, timeout ${POLL_TIMEOUT_MS / 60000} min)\n`);

  while (Date.now() < deadline) {
    attempt += 1;
    let json;
    try {
      json = await fetchJson(apiUrl, headers);
    } catch (err) {
      // Permanent errors (auth, not-found) should abort immediately.
      const isPermanent = /HTTP 40[134]/.test(err.message);
      if (isPermanent) throw err;
      console.warn(`  [poll #${attempt}] API request failed: ${err.message} — retrying...`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const build = json && (json.data || json);
    const status = build && build.status;
    const artifacts = build && build.artifacts;
    const artifactUrl = artifacts && (artifacts.buildUrl || artifacts.applicationArchiveUrl) || null;
    const installUrl = artifacts && (artifacts.installUrl || artifacts.distributionUrl) || null;

    process.stdout.write(`  [poll #${attempt}] status = ${status || "unknown"}\n`);

    if (!status) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (status === "FINISHED") {
      return { status, artifactUrl, installUrl };
    }

    if (["ERRORED", "CANCELLED", "EXPIRED"].includes(status)) {
      return { status, artifactUrl: null };
    }

    // Still running — wait before next poll.
    await sleep(POLL_INTERVAL_MS);
  }

  return { status: "TIMEOUT", artifactUrl: null };
}

/**
 * Infer the file extension for a downloaded build artifact.
 * Priority: extension embedded in the artifact URL -> profile heuristic.
 *
 * EAS "preview" profiles emit APKs; "production" profiles emit AABs.
 *
 * @param {string|null} artifactUrl
 * @param {string} buildProfile
 * @returns {string} e.g. ".apk" or ".aab"
 */
function inferArtifactExtension(artifactUrl, buildProfile) {
  if (artifactUrl) {
    const urlPath = new URL(artifactUrl).pathname.toLowerCase();
    if (urlPath.endsWith(".apk")) return ".apk";
    if (urlPath.endsWith(".aab")) return ".aab";
  }
  // Fall back to profile heuristic: "production" -> AAB, everything else -> APK.
  return buildProfile === "production" ? ".aab" : ".apk";
}

/**
 * Download a file from `url` to `destPath`, streaming to disk.
 *
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);
    let settled = false;

    function done(err) {
      if (settled) return;
      settled = true;
      file.close();
      if (err) {
        fs.unlink(destPath, () => {});
        reject(err);
      } else {
        process.stdout.write("\n");
        resolve();
      }
    }

    // Handle filesystem write errors (e.g. disk full, permission denied).
    file.on("error", (err) => done(new Error(`Filesystem write error: ${err.message}`)));

    function get(targetUrl, redirectCount = 0) {
      if (redirectCount > 5) {
        done(new Error("Too many redirects while downloading artifact."));
        return;
      }
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location, redirectCount + 1);
          return;
        }
        if (res.statusCode !== 200) {
          done(new Error(`Download failed with HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers["content-length"] || "0", 10);
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = ((received / total) * 100).toFixed(1);
            process.stdout.write(`\r  Downloading... ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB)`);
          }
        });
        res.pipe(file);
        file.on("finish", () => done(null));
      }).on("error", (err) => done(err));
    }

    get(url);
  });
}

function printFooter(buildUrl, artifactUrl, installUrl, localPath) {
  console.log("\n" + "=".repeat(60));
  console.log("  Build complete!");
  if (buildUrl) {
    console.log("  Dashboard:");
    console.log(`    ${buildUrl}`);
  }
  if (artifactUrl) {
    console.log("  Direct download link:");
    console.log(`    ${artifactUrl}`);
  }
  if (installUrl) {
    console.log("  Install on device:");
    console.log(`    ${installUrl}`);
  }
  if (localPath) {
    console.log("  Downloaded to:");
    console.log(`    ${localPath}`);
  }
  console.log("=".repeat(60) + "\n");
}

async function main() {
  printBanner();
  checkToken();

  const { webhookUrl, channel, mute, urlSource } = resolveNotifySettings();
  if (mute) {
    console.log("  [notify] Notifications muted via .build-notify.json.\n");
  } else if (!webhookUrl) {
    console.log(
      "  [notify] No webhook URL configured — notifications are disabled.\n" +
      "           Set BUILD_WEBHOOK_URL as a Replit secret, or create\n" +
      "           artifacts/pos-app/.build-notify.json with a \"webhookUrl\" field."
    );
  } else {
    const sourceLabel = urlSource === "local-config"
      ? `.build-notify.json${channel ? ` (channel: ${channel})` : ""}`
      : "BUILD_WEBHOOK_URL secret";
    console.log(`  [notify] Notifications enabled via ${sourceLabel}.\n`);
  }

  // Track the build URL so the centralised catch can include it in failure
  // notifications even when an unexpected error escapes a named code path.
  let buildUrl = null;

  try {
    buildUrl = await runEasBuild();

    const buildId = extractBuildId(buildUrl);
    if (!buildId) {
      // Couldn't extract an ID — fall back to the original footer and exit.
      console.log("\nCould not extract build ID from EAS output.");
      console.log("Track your build at: https://expo.dev/builds");
      if (buildUrl) console.log(`Build URL: ${buildUrl}`);
      // Notify as failure since we can't confirm success.
      await sendWebhookNotification("failure", buildUrl, null);
      return;
    }

    const { status, artifactUrl, installUrl } = await pollBuildStatus(buildId);

    if (status === "TIMEOUT") {
      console.log("\nPolling timed out. Check the build dashboard for the final status:");
      if (buildUrl) console.log(`  ${buildUrl}`);
      await sendWebhookNotification("timeout", buildUrl, null);
      return;
    }

    if (status === "CANCELLED") {
      console.log(`\nBuild was cancelled.`);
      if (buildUrl) console.log(`  Dashboard: ${buildUrl}`);
      await sendWebhookNotification("cancelled", buildUrl, null);
      process.exit(1);
    }

    if (status !== "FINISHED") {
      console.log(`\nBuild ended with status: ${status}`);
      if (buildUrl) console.log(`  Dashboard: ${buildUrl}`);
      await sendWebhookNotification("failure", buildUrl, null);
      process.exit(1);
    }

    // Build finished successfully.
    let localPath = null;
    if (artifactUrl && !skipDownload) {
      const ext = inferArtifactExtension(artifactUrl, profile);
      const fileName = `al-salik-pos-${profile}-${buildId.slice(0, 8)}${ext}`;
      localPath = path.join(projectRoot, "dist", fileName);
      console.log(`\nDownloading artifact (${ext}) to: ${localPath}`);
      try {
        await downloadFile(artifactUrl, localPath);
        console.log("  Download complete.");
      } catch (err) {
        console.warn(`  Download failed: ${err.message}`);
        console.warn("  You can still download manually from the link below.");
        localPath = null;
      }
    } else if (artifactUrl && skipDownload) {
      console.log("\nEAS_NO_DOWNLOAD=1 — skipping automatic download.");
    } else {
      console.warn("\nWarning: build finished but no artifact URL was returned by the API.");
    }

    await sendWebhookNotification("success", buildUrl, artifactUrl, installUrl);
    printFooter(buildUrl, artifactUrl, installUrl, localPath);
  } catch (err) {
    // Centralised failure handler: catches EAS CLI errors, permanent Expo API
    // errors from pollBuildStatus, and any other unexpected exceptions so a
    // notification is always sent before the process exits.
    await sendWebhookNotification("failure", buildUrl, null, null, err.message);
    throw err;
  }
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message}\n`);
  process.exit(1);
});
