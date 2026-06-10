const fs = require('fs');
let content = fs.readFileSync('api/src/controllers/admin.controller.ts', 'utf8');
content = content.replace(
    /include: {\s*uploadedBy: { select: { firstName: true, lastName: true } },\s*_count: { select: { chunks: true } },\s*},/,
    'include: {\n          uploadedBy: { select: { firstName: true, lastName: true } },\n          _count: { select: { chunks: true } },\n          issues: {\n            include: { steps: { orderBy: { stepNumber: "asc" } } }\n          }\n        },'
);
content = content.replace(
    /uploadedBy: d\.uploadedBy \?\s*\ \\s*: "System",\n\s*chunkCount: d\._count\.chunks,\n\s*}\)\);/,
    'uploadedBy: d.uploadedBy ? ${d.uploadedBy.firstName}  : "System",\n        chunkCount: d._count.chunks,\n        issues: d.issues,\n      }));'
);
fs.writeFileSync('api/src/controllers/admin.controller.ts', content);
console.log('Included issues in listDocuments');
