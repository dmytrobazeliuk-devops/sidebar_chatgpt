const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const iconsDir = path.resolve(__dirname, '..', 'icons');
const assetsDir = path.resolve(__dirname, '..', 'assets');
const sourceImage = path.join(iconsDir, 'artificial-intelligence.png');
const sizes = [16, 32, 48, 128, 256];

(async () => {
  // Check if source image exists
  if (!fs.existsSync(sourceImage)) {
    console.error('Source image not found:', sourceImage);
    process.exit(1);
  }

  console.log('Generating icons from:', sourceImage);
  
  // Ensure assets directory exists
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  
  for (const size of sizes) {
    const pngPath = path.join(assetsDir, `icon-${size}.png`);
    
    try {
      // Generate PNG icon
      await sharp(sourceImage)
        .resize(size, size, { 
          fit: 'contain', 
          background: { r: 0, g: 0, b: 0, alpha: 0 } 
        })
        .png({ quality: 100 })
        .toFile(pngPath);
      console.log('✓ Generated', pngPath);
      
      // Generate SVG (embed PNG as base64)
      const pngBuffer = await sharp(sourceImage)
        .resize(size, size, { 
          fit: 'contain', 
          background: { r: 0, g: 0, b: 0, alpha: 0 } 
        })
        .png()
        .toBuffer();
      
      const base64 = pngBuffer.toString('base64');
      const svgPath = path.join(assetsDir, `icon-${size}.svg`);
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <image width="${size}" height="${size}" xlink:href="data:image/png;base64,${base64}"/>
</svg>`;
      
      fs.writeFileSync(svgPath, svgContent, 'utf8');
      console.log('✓ Generated', svgPath);
    } catch (err) {
      console.error('✗ Failed to generate icon size', size, ':', err.message || err);
    }
  }
  
  console.log('\n✓ All icons generated successfully!');
})();

