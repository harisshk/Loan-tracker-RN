const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, '../app');

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;

      content = content.replace(/FileSystem\.EncodingType\.UTF8/g, "'utf8'");

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
        console.log(`Fixed encoding crashing in ${file}`);
      }
    }
  });
}

processDirectory(directoryPath);
