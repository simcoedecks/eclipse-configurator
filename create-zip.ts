import fs from 'fs';
import archiver from 'archiver';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

const outputPath = path.join(publicDir, 'full-app-export.zip');
const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Archive created successfully: ${archive.pointer()} total bytes`);
});

archive.on('error', (err) => {
  console.error('Error creating zip:', err);
  process.exit(1);
});

archive.pipe(output);

// Add all files except node_modules, dist, and the zip itself
archive.glob('**/*', {
  cwd: process.cwd(),
  dot: true,
  ignore: [
    'node_modules/**', 
    'dist/**', 
    '.git/**', 
    'public/project-export.zip',
    'public/full-app-export.zip'
  ]
});

archive.finalize();
