const fs = require('fs');

let content = fs.readFileSync('src/components/admin/TemplatesTab.tsx', 'utf8');

// Add documentId prop to TemplatesTab
content = content.replace(/export default function TemplatesTab\(\) \{/, 'export default function TemplatesTab({ documentId }: { documentId?: string }) {');

// Update fetch URL
content = content.replace(
    /const data = await apiFetch<\{ templates: Template\[\] \}>\("\/api\/admin\/templates"\);/,
    'const data = await apiFetch<{ templates: Template[] }>(`/api/admin/templates${documentId ? `?documentId=${documentId}` : ""}`);'
);

// Update POST body to include documentId
content = content.replace(
    /body: JSON\.stringify\(\{ \.\.\.form, steps \}\),/,
    'body: JSON.stringify({ ...form, steps, documentId }),'
);

fs.writeFileSync('src/components/admin/TemplatesTab.tsx', content);
console.log('TemplatesTab.tsx updated to support documentId prop');
