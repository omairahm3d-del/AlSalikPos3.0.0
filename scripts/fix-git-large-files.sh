#!/bin/bash
# One-shot script to remove large binary build artifacts from git tracking.
# Files are NOT deleted from disk — only removed from git history going forward.
# Run once from the project root, then Publish will work normally.

set -e

echo "Removing large binary files from git tracking..."

git rm --cached -r --ignore-unmatch \
  desktop-installer/dist \
  desktop-installer/dist-32 \
  desktop-installer/www \
  desktop-installer/www-new \
  desktop-installer/static-build

echo "Staging .gitignore update..."
git add .gitignore

echo "Committing..."
git commit -m "chore: untrack large installer binaries from git"

echo ""
echo "Done! Files are still on disk but no longer in git."
echo "You can now Publish the project."
