const fs = require('fs');

// 1. Fix admin page.tsx
let adminPage = fs.readFileSync('src/app/(admin)/admin/page.tsx', 'utf8');

// Remove TroubleshootingTemplatesTab
adminPage = adminPage.replace(
    /import TroubleshootingTemplatesTab from "@\\/components\\/admin\\/TroubleshootingTemplatesTab";\n/,
    'import TemplatesTab from "@/components/admin/TemplatesTab";\n'
);
adminPage = adminPage.replace(
    /import TroubleshootingTemplatesTab from "@\\/components\\/admin\\/TroubleshootingTemplatesTab";/,
    'import TemplatesTab from "@/components/admin/TemplatesTab";'
);
adminPage = adminPage.replace(/<TroubleshootingTemplatesTab \/>\n\s*/, '');

// Add state for editingDocId
if (!adminPage.includes('const [editingDocId, setEditingDocId]')) {
    adminPage = adminPage.replace(
        /const \[deletingDocId, setDeletingDocId\] = useState<string \| null>\(null\);/,
        'const [deletingDocId, setDeletingDocId] = useState<string | null>(null);\n  const [editingDocId, setEditingDocId] = useState<string | null>(null);'
    );
}

// Add Edit button
if (!adminPage.includes('onClick={() => setEditingDocId(doc.id)}')) {
    adminPage = adminPage.replace(
        /<button\s+onClick=\{\(\) => handleDeleteDoc\(doc\.id\)\}/,
        <button
                            onClick={() => setEditingDocId(doc.id)}
                            className="p-1.5 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10 dark:hover:bg-primary-900/30 transition-colors"
                            title="Edit Issues"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
    );
}

// Add Modal
if (!adminPage.includes('editingDocId && (')) {
    adminPage = adminPage.replace(
        /<\/div>\s*<\/ResponsiveSidebar>/,
        </div>
      </ResponsiveSidebar>

      {/* Issues Modal */}
      {editingDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface dark:bg-surface-dark w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl flex flex-col">
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-line dark:border-line-dark bg-surface dark:bg-surface-dark">
              <h2 className="text-lg font-bold text-content dark:text-content-dark">Edit Document Issues</h2>
              <button onClick={() => setEditingDocId(null)} className="p-2 rounded-full hover:bg-surface-hover dark:hover:bg-surface-dark-hover text-content-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <TemplatesTab documentId={editingDocId} />
            </div>
          </div>
        </div>
      )}
    );
}
fs.writeFileSync('src/app/(admin)/admin/page.tsx', adminPage);

// 2. Fix marketing page
let marketingPage = fs.readFileSync('src/app/(marketing)/marketing/page.tsx', 'utf8');
marketingPage = marketingPage.replace(/activeTab === y/g, 'activeTab === item.key');
fs.writeFileSync('src/app/(marketing)/marketing/page.tsx', marketingPage);

// 3. Fix sales page
let salesPage = fs.readFileSync('src/app/(sales)/sales/page.tsx', 'utf8');
salesPage = salesPage.replace(/activeTab === y/g, 'activeTab === item.key');
fs.writeFileSync('src/app/(sales)/sales/page.tsx', salesPage);

console.log('Fixed pages!');
