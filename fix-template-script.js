const fs = require('fs');
let content = fs.readFileSync('api/src/scripts/import-training.ts', 'utf8');
content = content.replace(/templateId/g, 'issueId');
fs.writeFileSync('api/src/scripts/import-training.ts', content);
console.log('Fixed templateId in import-training.ts');
