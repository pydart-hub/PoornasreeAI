const fs = require('fs');
let content = fs.readFileSync('src/app/(admin)/admin/page.tsx', 'utf8');
content = content.replace(
    /import DocumentIssuesTab from "@\\/components\\/admin\\/DocumentIssuesTab";/g,
    ''
);
content = content.replace(
    /<DocumentIssuesTab \/>/g,
    ''
);
fs.writeFileSync('src/app/(admin)/admin/page.tsx', content);
console.log('Removed DocumentIssuesTab from page.tsx');
