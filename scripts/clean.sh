#!/bin/bash
# Clean script - removes cache, temporary files, and test artifacts

echo "=== CLEANING HEILION PROJECT ==="
echo ""

# 1. Clear Node.js cache
echo "1. Clearing Node.js cache..."
rm -rf node_modules/.cache
rm -rf .cache
rm -rf .eslintcache
echo "   ✓ Node.js cache cleared"
echo ""

# 2. Clear Python cache
echo "2. Clearing Python cache..."
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find . -type f -name "*.pyc" -delete 2>/dev/null
find . -type f -name "*.pyo" -delete 2>/dev/null
find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null
find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null
find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null
echo "   ✓ Python cache cleared"
echo ""

# 3. Clear build artifacts (keep dist/)
echo "3. Clearing build artifacts (keeping dist/ and essential files)..."
rm -rf build/icons/icon.iconset
rm -rf build/icons/icon.iconset.bak
# Keep icon.icns and icon.png - they're needed for builds
echo "   ✓ Build artifacts cleaned"
echo ""

# 4. Clear temporary files
echo "4. Clearing temporary files..."
find . -type f -name "*.log" -delete 2>/dev/null
find . -type f -name ".DS_Store" -delete 2>/dev/null
find . -type f -name "Thumbs.db" -delete 2>/dev/null
find . -type f -name "*.swp" -delete 2>/dev/null
find . -type f -name "*.swo" -delete 2>/dev/null
find . -type f -name "*~" -delete 2>/dev/null
echo "   ✓ Temporary files cleared"
echo ""

# 5. Clear test artifacts (if any)
echo "5. Clearing test artifacts..."
rm -rf coverage 2>/dev/null
rm -rf .nyc_output 2>/dev/null
rm -rf .coverage 2>/dev/null
find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null
echo "   ✓ Test artifacts cleared"
echo ""

# 6. Clear editor/IDE files (optional - comment out if you want to keep them)
echo "6. Clearing editor/IDE files..."
rm -rf .vscode 2>/dev/null
rm -rf .idea 2>/dev/null
find . -type f -name ".project" -delete 2>/dev/null
find . -type f -name ".classpath" -delete 2>/dev/null
echo "   ✓ Editor files cleared"
echo ""

echo "✅ CLEANUP COMPLETE!"
echo ""
echo "Remaining directories:"
echo "  ✓ src/ - Source code"
echo "  ✓ main/ - Main process files"
echo "  ✓ dist/ - Built application (kept)"
echo "  ✓ build/ - Build output (kept)"
echo "  ✓ node_modules/ - Dependencies (kept)"
echo ""
