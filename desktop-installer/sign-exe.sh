#!/usr/bin/env bash
# Sign a Windows PE executable using osslsigncode.
#
# Usage:  sign-exe.sh <path-to-exe>
#
# Required environment variables:
#   WIN_CSC_LINK          Path to a .pfx code-signing certificate file,
#                         or a base64-encoded .pfx (prefix with "base64,").
#   WIN_CSC_KEY_PASSWORD  Password for the .pfx file.
#
# Optional environment variables:
#   WIN_SIGN_TIMESTAMP_URL  RFC 3161 timestamp server URL.
#                           Defaults to http://timestamp.digicert.com
#   WIN_SIGN_DESCRIPTION    Product description embedded in the signature.
#                           Defaults to "Al Salik POS"
#   WIN_SIGN_URL            Publisher URL embedded in the signature.
#                           Defaults to https://alsalikcomputers.com
#
# If WIN_CSC_LINK or WIN_CSC_KEY_PASSWORD are not set the script exits
# with code 0 (unsigned build proceeds without error).

set -euo pipefail

EXE_PATH="${1:-}"
if [[ -z "$EXE_PATH" ]]; then
  echo "sign-exe.sh: ERROR — no EXE path supplied." >&2
  exit 1
fi

if [[ -z "${WIN_CSC_LINK:-}" ]] || [[ -z "${WIN_CSC_KEY_PASSWORD:-}" ]]; then
  echo "sign-exe.sh: WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD not set — skipping signing."
  exit 0
fi

TIMESTAMP_URL="${WIN_SIGN_TIMESTAMP_URL:-http://timestamp.digicert.com}"
DESCRIPTION="${WIN_SIGN_DESCRIPTION:-Al Salik POS}"
SIGN_URL="${WIN_SIGN_URL:-https://alsalikcomputers.com}"

# ── Resolve the PFX file ──────────────────────────────────────────────────────
TMPDIR_SIGN="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_SIGN"' EXIT

if [[ "$WIN_CSC_LINK" == base64,* ]]; then
  PFX_PATH="$TMPDIR_SIGN/cert.pfx"
  echo "${WIN_CSC_LINK#base64,}" | base64 --decode > "$PFX_PATH"
else
  PFX_PATH="$WIN_CSC_LINK"
fi

if [[ ! -f "$PFX_PATH" ]]; then
  echo "sign-exe.sh: ERROR — PFX file not found: $PFX_PATH" >&2
  exit 1
fi

# ── Check osslsigncode is available ──────────────────────────────────────────
if ! command -v osslsigncode &>/dev/null; then
  echo "sign-exe.sh: ERROR — osslsigncode not found." >&2
  echo "  Install it with:" >&2
  echo "    apt-get install -y osslsigncode   (Debian/Ubuntu)" >&2
  echo "    brew install osslsigncode          (macOS)" >&2
  exit 1
fi

# ── Sign in-place (sign → tmp, replace original) ─────────────────────────────
SIGNED_TMP="$TMPDIR_SIGN/signed.exe"

echo "sign-exe.sh: Signing $EXE_PATH …"
osslsigncode sign \
  -pkcs12    "$PFX_PATH" \
  -pass      "$WIN_CSC_KEY_PASSWORD" \
  -n         "$DESCRIPTION" \
  -i         "$SIGN_URL" \
  -ts        "$TIMESTAMP_URL" \
  -h         sha256 \
  -in        "$EXE_PATH" \
  -out       "$SIGNED_TMP"

mv "$SIGNED_TMP" "$EXE_PATH"
echo "sign-exe.sh: Signing complete — $EXE_PATH"

# ── Verify the signature is valid ─────────────────────────────────────────────
echo "sign-exe.sh: Verifying signature …"
if osslsigncode verify -in "$EXE_PATH" 2>&1 | grep -q "Signature verification: ok"; then
  echo "sign-exe.sh: Signature verified OK."
else
  echo "sign-exe.sh: WARNING — signature verification did not return 'ok'. Run:" >&2
  echo "  osslsigncode verify -in \"$EXE_PATH\"" >&2
  echo "to inspect the result. The file was signed but the timestamp server may" >&2
  echo "be unreachable; the signature should still be valid on Windows." >&2
fi
