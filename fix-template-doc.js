const fs = require('fs');
let content = fs.readFileSync('api/src/services/document.service.ts', 'utf8');
content = content.replace(/templateId/g, 'issueId');
fs.writeFileSync('api/src/services/document.service.ts', content);
console.log('Fixed templateId in document.service.ts');
