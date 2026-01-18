#!/bin/bash
# Create app icon from PNG or create a simple one

mkdir -p build/icons/icon.iconset

# Try to use PIL to create icon if available
python3 << 'PYTHON_EOF'
from PIL import Image, ImageDraw
import os

os.makedirs('build/icons', exist_ok=True)

# Create 1024x1024 PNG
img = Image.new('RGB', (1024, 1024), '#000000')
draw = ImageDraw.Draw(img)

# Draw circle outline
draw.ellipse([50, 50, 974, 974], outline='#4a90e2', width=20)

# Draw H letter manually
# Left vertical
draw.rectangle([200, 150, 250, 850], fill='#4a90e2')
# Right vertical  
draw.rectangle([750, 150, 800, 850], fill='#4a90e2')
# Horizontal bar
draw.rectangle([200, 450, 800, 550], fill='#4a90e2')

img.save('build/icons/icon.png')
print("✓ Created icon.png (1024x1024)")
PYTHON_EOF

# Create iconset sizes
if command -v sips >/dev/null 2>&1 && [ -f build/icons/icon.png ]; then
  for size in 16 32 128 256 512; do
    sips -z $size $size build/icons/icon.png --out build/icons/icon.iconset/icon_${size}x${size}.png >/dev/null 2>&1
    sips -z $((size*2)) $((size*2)) build/icons/icon.png --out build/icons/icon.iconset/icon_${size}x${size}@2x.png >/dev/null 2>&1
  done
  
  # Convert to .icns
  if command -v iconutil >/dev/null 2>&1; then
    iconutil -c icns build/icons/icon.iconset -o build/icons/icon.icns 2>/dev/null
    echo "✓ Created icon.icns"
  fi
fi
