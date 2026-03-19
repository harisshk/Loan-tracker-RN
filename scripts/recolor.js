const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, '../app');

const replaceRules = [
  { from: /\['#0a0a0a', '#1a1a2e', '#16213e'\]/g, to: "['#020617', '#0f172a', '#1e293b']" }, // Deep Slate/Navy Background
  { from: /#4ade80/g, to: '#10b981' }, // Emerald Green
  { from: /rgba\(74,\s*222,\s*128,/g, to: 'rgba(16, 185, 129,' }, // Emerald Green RGBA
  { from: /#fbbf24/g, to: '#f59e0b' }, // Amber/Gold
  { from: /rgba\(251,\s*191,\s*36,/g, to: 'rgba(245, 158, 11,' }, // Amber RGBA
  { from: /#60a5fa/g, to: '#38bdf8' }, // Sky Blue
  { from: /rgba\(96,\s*165,\s*250,/g, to: 'rgba(56, 189, 248,' }, // Sky Blue RGBA
  { from: /#ef4444/g, to: '#e11d48' }, // Rose Red for errors/pending
  { from: /rgba\(239,\s*68,\s*68,/g, to: 'rgba(225, 29, 72,' } // Rose Red RGBA
];

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;

      replaceRules.forEach(rule => {
        content = content.replace(rule.from, rule.to);
      });

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated colors in ${file}`);
      }
    }
  });
}

processDirectory(directoryPath);
