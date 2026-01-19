#!/bin/bash
# Helper script to remove macOS Gatekeeper quarantine attribute
# This allows unsigned apps to run on macOS

APP_PATH="$1"

if [ -z "$APP_PATH" ]; then
  echo "Usage: ./scripts/remove-quarantine.sh /path/to/Heilion.app"
  echo "Example: ./scripts/remove-quarantine.sh /Applications/Heilion.app"
  exit 1
fi

if [ ! -d "$APP_PATH" ]; then
  echo "Error: App not found at $APP_PATH"
  exit 1
fi

echo "Removing quarantine attribute from $APP_PATH..."
xattr -cr "$APP_PATH"
echo "✓ Quarantine removed. You can now open the app normally."
echo ""
echo "Note: If you still see a warning, right-click the app and select 'Open' the first time."
