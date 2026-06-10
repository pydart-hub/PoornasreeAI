const fs = require('fs');

let content = fs.readFileSync('api/src/controllers/template.controller.ts', 'utf8');

// Replace templateId with issueId
content = content.replace(/templateId/g, 'issueId');

// Update createTemplate to accept documentId
content = content.replace(/const { problemType, title, description, audience, steps } = req\.body;/, 
    'const { problemType, title, description, audience, steps, documentId } = req.body;');
content = content.replace(/problemType,\n\s*title,/, 'documentId,\n        problemType,\n        title,');

// Update updateTemplate to accept documentId
content = content.replace(/const { title, description, isActive, audience, steps } = req\.body;/, 
    'const { title, description, isActive, audience, steps, documentId } = req.body;');
content = content.replace(/if \(title !== undefined\) data\.title = title;/, 
    'if (documentId !== undefined) data.documentId = documentId;\n    if (title !== undefined) data.title = title;');

// Also fix listTemplates to support filtering by documentId if passed in query
content = content.replace(/const templates = await prisma\.documentIssue\.findMany\(\{/, 
    'const documentId = req.query.documentId ? String(req.query.documentId) : undefined;\n    const templates = await prisma.documentIssue.findMany({\n      where: documentId ? { documentId } : {},');

fs.writeFileSync('api/src/controllers/template.controller.ts', content);
console.log('Fixed templateId to issueId and added documentId support');
