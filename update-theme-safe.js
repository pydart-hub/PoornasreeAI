const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) results.push(file);
    }
  });
  return results;
}

const files = walk('./src/app');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Header gradients
  content = content.replace(/bg-gradient-to-r from-[a-z]+-950 via-[a-z]+-900 to-[a-z]+-9[05]0/g, 'bg-gradient-to-r from-primary-900 via-primary-800 to-primary-900');
  
  // Top right / bottom left blobs in main content (if any)
  content = content.replace(/bg-[a-z]+-400\/20 rounded-full blur-3xl pointer-events-none/g, 'bg-primary-400/20 rounded-full blur-3xl pointer-events-none');

  const p = file.replace(/\\/g, '/');

  // Helper to replace theme colors for a specific file safely
  const applyTheme = (colors) => {
    colors.forEach(color => {
      // Safely replace text-color, bg-color, border-color, from-color, etc.
      // But only for specific shades that are usually part of the main theme, not utility text.
      const regexStr = `\\b(text|bg|border|ring|from|via|to)-${color}-(950|900|800|700|600|500|400|300|200|100|50)\\b`;
      const regex = new RegExp(regexStr, 'g');
      content = content.replace(regex, '$1-primary-$2');

      // Also handle opacity variants like bg-color-500/30
      const regexOpacityStr = `\\b(bg|border|text)-${color}-(500|400|300|200)\\/([0-9]{2})\\b`;
      const regexOpacity = new RegExp(regexOpacityStr, 'g');
      content = content.replace(regexOpacity, '$1-primary-$2/$3');
    });
  };

  if (p.includes('/admin/')) {
    applyTheme(['purple', 'violet', 'indigo']);
  } else if (p.includes('/sales/')) {
    applyTheme(['teal', 'cyan']);
  } else if (p.includes('/marketing/')) {
    applyTheme(['fuchsia', 'violet', 'purple']);
  } else if (p.includes('/service-manager/')) {
    // Avoid 'blue' if it's used for standard info badges, but since we are migrating to primary (blue), it's fine.
    applyTheme(['indigo', 'cyan', 'blue']);
  } else if (p.includes('/customer-service/')) {
    applyTheme(['sky', 'blue']);
  } else if (p.includes('/dealer/') || p.includes('/assistant-manager/')) {
    applyTheme(['orange']);
    content = content.replace(/\b(bg|text|border|ring|from|via|to)-amber-600\b/g, '$1-primary-600');
    content = content.replace(/\b(from|via|to|bg)-amber-(950|900|800)\b/g, '$1-primary-$2');
    content = content.replace(/\b(text)-amber-(200|300)\b/g, '$1-primary-$2'); // for text inside cards
  } else if (p.includes('/service/')) {
    applyTheme(['teal']);
    content = content.replace(/\b(bg|text|border|ring|from|via|to)-emerald-600\b/g, '$1-primary-600');
    content = content.replace(/\b(from|via|to|bg)-emerald-(950|900|800)\b/g, '$1-primary-$2');
    content = content.replace(/\b(text)-emerald-(200|300)\b/g, '$1-primary-$2'); // for text inside cards
    content = content.replace(/\b(bg)-emerald-500\/30\b/g, '$1-primary-500/30'); 
  }

  // Active Tab classes specifically
  content = content.replace(/activeTab === (\w|\.)+ \? "bg-[a-z]+-600 text-white/g, 'activeTab === $1 ? "bg-primary-600 text-white');
  content = content.replace(/activeTab === (\w|\.)+ \? "text-[a-z]+-300"/g, 'activeTab === $1 ? "text-primary-300"');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});
