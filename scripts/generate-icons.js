const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const assetsDir = path.resolve(__dirname, '..', 'assets');
const sourceSvg = path.join(assetsDir, 'chatgpt-logo.svg');
const sizes = [16, 32, 48, 128, 256];

(async () => {
  // Check if source SVG exists
  if (!fs.existsSync(sourceSvg)) {
    console.error('Source SVG not found:', sourceSvg);
    process.exit(1);
  }

  console.log('Generating icons from:', sourceSvg);
  
  for (const size of sizes) {
    const pngPath = path.join(assetsDir, `icon-${size}.png`);
    const svgPath = path.join(assetsDir, `icon-${size}.svg`);
    
    try {
      // Generate PNG
      await sharp(sourceSvg)
        .resize(size, size, { 
          fit: 'contain', 
          background: { r: 0, g: 0, b: 0, alpha: 0 } 
        })
        .png({ quality: 100 })
        .toFile(pngPath);
      console.log('✓ Generated', pngPath);
      
      // Generate SVG (scaled version)
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="chatgptGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#AB68FF;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#19C37D;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="chatgptGradientInner" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#AB68FF;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#19C37D;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background circle with gradient -->
  <circle cx="256" cy="256" r="256" fill="url(#chatgptGradient)"/>
  
  <!-- ChatGPT knot symbol - interwoven hexagonal pattern -->
  <g transform="translate(256, 256)" fill="url(#chatgptGradientInner)" stroke="#000" stroke-width="14" stroke-linejoin="miter" stroke-miterlimit="10">
    <!-- Segment 1: Top -->
    <path d="M -70,-70 L -35,-105 L 35,-105 L 70,-70 L 35,-35 L -35,-35 Z"/>
    
    <!-- Segment 2: Top-right -->
    <path d="M 70,-70 L 105,-35 L 105,35 L 70,70 L 35,35 L 35,-35 Z"/>
    
    <!-- Segment 3: Bottom-right -->
    <path d="M 70,70 L 35,105 L -35,105 L -70,70 L -35,35 L 35,35 Z"/>
    
    <!-- Segment 4: Bottom-left -->
    <path d="M -70,70 L -105,35 L -105,-35 L -70,-70 L -35,-35 L -35,35 Z"/>
    
    <!-- Segment 5: Left-top (overlapping) -->
    <path d="M -105,-35 L -70,-70 L -35,-105 L 0,-140 L 0,-105 L -35,-70 Z"/>
    
    <!-- Segment 6: Right-top (overlapping) -->
    <path d="M 105,-35 L 140,0 L 105,35 L 70,70 L 35,35 L 70,0 Z"/>
  </g>
  
  <!-- Center hexagon (empty space) -->
  <g transform="translate(256, 256)">
    <path d="M -20,-35 L 20,-35 L 35,0 L 20,35 L -20,35 L -35,0 Z" fill="url(#chatgptGradient)" stroke="#000" stroke-width="2"/>
  </g>
</svg>`;
      
      fs.writeFileSync(svgPath, svgContent, 'utf8');
      console.log('✓ Generated', svgPath);
    } catch (err) {
      console.error('✗ Failed to generate icon size', size, ':', err.message || err);
    }
  }
  
  console.log('\n✓ All icons generated successfully!');
})();

