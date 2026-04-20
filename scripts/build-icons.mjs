import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets');
const sourceIconPath = path.join(assetsDir, 'icon.png');

// Sizes needed for various platforms
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];

async function buildIcons() {
  console.log('Building icons from icon.png...');

  if (!fs.existsSync(sourceIconPath)) {
    throw new Error(`Missing source icon: ${sourceIconPath}`);
  }

  // Create icons directory if it doesn't exist
  const iconsDir = path.join(assetsDir, 'icons');
  const pngIconsDir = path.join(iconsDir, 'png');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  if (!fs.existsSync(pngIconsDir)) {
    fs.mkdirSync(pngIconsDir, { recursive: true });
  }

  // Generate PNGs at various sizes
  for (const size of sizes) {
    const resizedIcon = sharp(sourceIconPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png();

    await Promise.all([
      resizedIcon.clone().toFile(path.join(iconsDir, `icon_${size}x${size}.png`)),
      resizedIcon.clone().toFile(path.join(pngIconsDir, `${size}x${size}.png`)),
    ]);
    console.log(`  Created ${size}x${size} PNG`);
  }

  console.log('\nPNG icons created successfully!');
  console.log('\nTo create .icns (macOS) and .ico (Windows):');
  console.log('  macOS: Use iconutil or an online converter');
  console.log('  Windows: Use an online converter or ImageMagick');
  console.log('\nOr run: electron-icon-builder --input=assets/icon.png --output=assets');
}

buildIcons().catch(console.error);
