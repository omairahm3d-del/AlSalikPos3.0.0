#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POS_APP_DIR="$SCRIPT_DIR/../artifacts/pos-app"

echo "============================================"
echo "  POS System Desktop Build"
echo "============================================"
echo ""

if [ ! -d "$POS_APP_DIR" ]; then
  echo "ERROR: POS app not found at $POS_APP_DIR"
  exit 1
fi

echo "[1/4] Installing POS app dependencies..."
cd "$POS_APP_DIR"
if command -v pnpm &>/dev/null; then
  pnpm install
else
  npm install
fi

echo ""
echo "[2/4] Building web version..."
npx expo export --platform web --output-dir "$SCRIPT_DIR/web-build"

echo ""
echo "[3/4] Installing Electron dependencies..."
cd "$SCRIPT_DIR"
npm install

echo ""
echo "[4/4] Building Windows installer..."
npm run build:win

echo ""
echo "============================================"
echo "  Build complete!"
echo "  Output: $SCRIPT_DIR/dist/"
echo "============================================"
