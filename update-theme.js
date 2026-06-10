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

  // 1. Header gradients
  content = content.replace(/bg-gradient-to-r from-[a-z]+-950 via-[a-z]+-900 to-[a-z]+-9[05]0/g, 'bg-gradient-to-r from-primary-900 via-primary-800 to-primary-900');

  // 2. Active Tab classes
  content = content.replace(/bg-[a-z]+-600 text-white shadow-sm/g, 'bg-primary-600 text-white shadow-sm');
  content = content.replace(/text-[a-z]+-300(\"|\s)/g, 'text-primary-300$1');

  // Specific replacements per folder based on their theme colors
  const p = file.replace(/\\/g, '/');
  
  if (p.includes('/admin/')) {
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-(purple|violet|indigo)-([0-9]{2,3}(\/[0-9]{2})?)\b/g, '$1-primary-$3');
  } else if (p.includes('/sales/')) {
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-(teal|cyan)-([0-9]{2,3}(\/[0-9]{2})?)\b/g, '$1-primary-$3');
  } else if (p.includes('/marketing/')) {
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-(fuchsia|violet|purple)-([0-9]{2,3}(\/[0-9]{2})?)\b/g, '$1-primary-$3');
  } else if (p.includes('/service-manager/')) {
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-(indigo|cyan)-([0-9]{2,3}(\/[0-9]{2})?)\b/g, '$1-primary-$3');
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-blue-(600|900|950|500|400|200|50|100)\b/g, '$1-primary-$2');
  } else if (p.includes('/customer-service/')) {
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-(sky)-([0-9]{2,3}(\/[0-9]{2})?)\b/g, '$1-primary-$3');
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-blue-(600|900|950|500|400|200|50|100)\b/g, '$1-primary-$2');
  } else if (p.includes('/dealer/') || p.includes('/assistant-manager/')) {
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-(orange)-([0-9]{2,3}(\/[0-9]{2})?)\b/g, '$1-primary-$3');
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-amber-(950|900|800|600|400|300|200)\b/g, '$1-primary-$2');
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-yellow-(400|500)\b/g, '$1-primary-$2');
  } else if (p.includes('/service/')) {
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-teal-([0-9]{2,3}(\/[0-9]{2})?)\b/g, '$1-primary-$3');
    content = content.replace(/\b(text|bg|border|ring|from|via|to)-emerald-(950|900|800|600|400|300|200|500\/30|300\/40|400\/20)\b/g, '$1-primary-$2');
  }

  // General fixes for all files
  content = content.replace(/text-[a-z]+-600 dark:text-[a-z]+-400/g, 'text-primary-600 dark:text-primary-400');
  content = content.replace(/bg-[a-z]+-50 dark:bg-[a-z]+-500\/10/g, 'bg-primary-50 dark:bg-primary-500/10');

  // Fix badges/icons inside the stat cards
  content = content.replace(/text-[a-z]+-200 opacity-70/g, 'text-primary-200 opacity-70');
  content = content.replace(/text-[a-z]+-200 font-semibold/g, 'text-primary-200 font-semibold');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});
