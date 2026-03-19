const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, '../app');

const replaceRules = [
  // Background Gradient
  { from: /\['#020617',\s*'#0f172a',\s*'#1e293b'\]/g, to: "['#f8fafc', '#f1f5f9', '#e2e8f0']" },
  { from: /\['#0a0a0a',\s*'#1a1a2e',\s*'#16213e'\]/g, to: "['#f8fafc', '#f1f5f9', '#e2e8f0']" },
  
  // BlurView tint
  { from: /tint="dark"/g, to: 'tint="light"' },
  { from: /tint={'dark'}/g, to: "tint='light'" },
  { from: /style:\s*'light'/g, to: "style: 'dark'" }, // StatusBar style
  
  // Main Text colors (White to Dark Slate)
  { from: /color:\s*'#ffffff'/g, to: "color: '#0f172a'" },
  { from: /color:\s*['"]#fff['"]/gi, to: "color: '#0f172a'" },
  
  // Text fading/subtexts (White alpha to Dark Slate alpha)
  { from: /rgba\(255,\s*255,\s*255,\s*0\.6\)/g, to: 'rgba(15, 23, 42, 0.6)' },
  { from: /rgba\(255,\s*255,\s*255,\s*0\.5\)/g, to: 'rgba(15, 23, 42, 0.5)' },
  { from: /rgba\(255,\s*255,\s*255,\s*0\.8\)/g, to: 'rgba(15, 23, 42, 0.8)' },
  { from: /rgba\(255,\s*255,\s*255,\s*0\.4\)/g, to: 'rgba(15, 23, 42, 0.4)' },
  { from: /rgba\(255,\s*255,\s*255,\s*0\.3\)/g, to: 'rgba(15, 23, 42, 0.3)' },
  { from: /rgba\(255,\s*255,\s*255,\s*0\.2\)/g, to: 'rgba(15, 23, 42, 0.2)' },
  
  // Borders and faint lines (White alpha to Black alpha)
  { from: /borderColor:\s*'rgba\(255,\s*255,\s*255,\s*0\.1\)'/g, to: "borderColor: 'rgba(0, 0, 0, 0.08)'" },
  { from: /borderColor:\s*'rgba\(255,\s*255,\s*255,\s*0\.15\)'/g, to: "borderColor: 'rgba(0, 0, 0, 0.12)'" },
  { from: /borderColor:\s*'rgba\(255,\s*255,\s*255,\s*0\.05\)'/g, to: "borderColor: 'rgba(0, 0, 0, 0.04)'" },
  
  // Background Colors (White alpha to Solid White or faint Black)
  { from: /backgroundColor:\s*'rgba\(255,\s*255,\s*255,\s*0\.05\)'/g, to: "backgroundColor: '#ffffff'" },
  { from: /backgroundColor:\s*'rgba\(255,\s*255,\s*255,\s*0\.1\)'/g, to: "backgroundColor: '#ffffff'" },
  
  // Layout specific bg
  { from: /backgroundColor:\s*'#0a0a0a'/g, to: "backgroundColor: '#f8fafc'" },
  { from: /backgroundColor:\s*'#020617'/g, to: "backgroundColor: '#f8fafc'" },
  
  // Calendar specific
  { from: /textSectionTitleColor:\s*'rgba\(255,\s*255,\s*255,\s*0\.6\)'/g, to: "textSectionTitleColor: 'rgba(15, 23, 42, 0.6)'" },
  { from: /selectedDayTextColor:\s*'#ffffff'/g, to: "selectedDayTextColor: '#ffffff'" }, // Keep selected white! (re-replacing safely if replaced above)
  { from: /todayTextColor:\s*'#60a5fa'/g, to: "todayTextColor: '#2563eb'" }, // Darker blue for light mode
  { from: /todayTextColor:\s*'#38bdf8'/g, to: "todayTextColor: '#2563eb'" }, 
  { from: /dayTextColor:\s*'#ffffff'/g, to: "dayTextColor: '#0f172a'" },
  { from: /textDisabledColor:\s*'rgba\(255,\s*255,\s*255,\s*0\.2\)'/g, to: "textDisabledColor: 'rgba(15, 23, 42, 0.2)'" },
  { from: /arrowColor:\s*'#ffffff'/g, to: "arrowColor: '#0f172a'" },
  { from: /monthTextColor:\s*'#ffffff'/g, to: "monthTextColor: '#0f172a'" },
  
  // Specific fixes after blind replacement
  { from: /selectedDayTextColor:\s*'#0f172a'/g, to: "selectedDayTextColor: '#ffffff'" }, // fix if previous rule altered it
  { from: /badgeText:\s*{\s*fontSize:/g, to: "badgeText: { color: '#ffffff', fontSize:" }, // Ensure badges stay white text if needed, wait, badge texts have specific colors sometimes.
  
  // Primary Greens & Blues are fine in light mode. Make sure text inside solid buttons is white.
  // We'll trust the previous styling for colored texts.
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

      // Special case for selectedDayTextColor if it was blindly ruined
      content = content.replace(/selectedDayTextColor:\s*'#0f172a'/g, "selectedDayTextColor: '#ffffff'");
      
      // Let's also fix chart config labelColor
      content = content.replace(/labelColor:\s*\(opacity\s*=\s*1\)\s*=>\s*`rgba\(255,\s*255,\s*255,\s*\${opacity\s*\*\s*0\.8}`/g, "labelColor: (opacity = 1) => `rgba(15, 23, 42, ${Math.max(opacity, 0.6)})`");
      content = content.replace(/labelColor:\s*\(opacity\s*=\s*1\)\s*=>\s*`rgba\(15,\s*23,\s*42,\s*\${opacity\s*\*\s*0\.8}`/g, "labelColor: (opacity = 1) => `rgba(15, 23, 42, ${Math.max(opacity, 0.6)})`");
      
      // Fix background lines in charts
      content = content.replace(/stroke:\s*'rgba\(255,\s*255,\s*255,\s*0\.1\)'/g, "stroke: 'rgba(0, 0, 0, 0.05)'");

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
        console.log(`Switched to Light Mode in ${file}`);
      }
    }
  });
}

processDirectory(directoryPath);
