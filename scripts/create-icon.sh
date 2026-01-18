#!/bin/bash
# Create app icon from PNG or create a simple one

mkdir -p build/icons/icon.iconset

# Try to use PIL to create icon if available
python3 << 'PYTHON_EOF'
from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs('build/icons', exist_ok=True)

# Create 1024x1024 PNG
size = 1024
img = Image.new('RGB', (size, size), color='#000000')
draw = ImageDraw.Draw(img)

# Draw a CIRCLE background (not square)
margin = 20  # Small margin for anti-aliasing
center = size // 2
radius = size // 2 - margin

# Fill circle with black, stroke with blue
draw.ellipse([center - radius, center - radius, center + radius, center + radius], 
             fill='#000000', outline='#4a90e2', width=30)

# Draw "H" letter in center
font_size = 500
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", font_size)
except:
    try:
        font = ImageFont.truetype("/Library/Fonts/Arial Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()

text = "H"
bbox = draw.textbbox((0, 0), text, font=font)
text_width = bbox[2] - bbox[0]
text_height = bbox[3] - bbox[1]
position = ((size - text_width) // 2, (size - text_height) // 2 - 40)

draw.text(position, text, fill='#4a90e2', font=font)

# Create a circular mask to make it truly circular
mask = Image.new('L', (size, size), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.ellipse([margin, margin, size - margin, size - margin], fill=255)

# Apply mask to make it circular
output = Image.new('RGB', (size, size), '#000000')
output.paste(img, (0, 0), mask)

output.save('build/icons/icon.png')
print("✓ Created circular icon.png (1024x1024)")
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
    echo "✓ Created circular icon.icns"
  fi
fi
