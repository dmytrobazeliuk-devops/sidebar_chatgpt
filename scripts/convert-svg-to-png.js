const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const assetsDir = path.resolve(__dirname, '..', 'assets');
const sizes = [16, 32, 48, 128];

(async () => {
  for (const size of sizes) {
    const svgPath = path.join(assetsDir, `icon-${size}.svg`);
    const outPath = path.join(assetsDir, `icon-${size}.png`);
    if (!fs.existsSync(svgPath)) {
      console.error('Missing', svgPath);
      continue;
    }
    try {
      await sharp(svgPath)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ quality: 90 })
        .toFile(outPath);
      console.log('Written', outPath);
    } catch (err) {
      console.error('Failed to convert', svgPath, err.message || err);
    }
  }
})();
