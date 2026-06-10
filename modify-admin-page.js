const fs = require('fs');

let content = fs.readFileSync('src/app/(admin)/admin/page.tsx', 'utf8');

// Add import if needed
if (!content.includes('import TemplatesTab')) {
    content = content.replace(
        /import DocumentIssuesTab from "@\/components\/admin\/DocumentIssuesTab";/,
        'import TemplatesTab from "@/components/admin/TemplatesTab";\nimport DocumentIssuesTab from "@/components/admin/DocumentIssuesTab";'
    );
}

// Add state for selectedDocumentId
if (!content.includes('const [editingDocId, setEditingDocId]')) {
    content = content.replace(
        /const \[deletingDocId, setDeletingDocId\] = useState<string \| null>\(null\);/,
        'const [deletingDocId, setDeletingDocId] = useState<string | null>(null);\n  const [editingDocId, setEditingDocId] = useState<string | null>(null);'
    );
}

// Add Edit button
if (!content.includes('onClick={() => setEditingDocId(doc.id)}')) {
    content = content.replace(
        /<button\s+onClick=\{\(\) => handleDeleteDoc\(doc\.id\)\}/,
        `<button
                            onClick={() => setEditingDocId(doc.id)}
                            className="p-1.5 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10 dark:hover:bg-primary-900/30 transition-colors"
                            title="Edit Issues"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}`
    );
}

// Add Modal render at the end of the return statement
if (!content.includes('editingDocId && (')) {
    content = content.replace(
        /<\/div>\s*<\/ResponsiveSidebar>/,
        `</div>
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
      )}`
    );
}

fs.writeFileSync('src/app/(admin)/admin/page.tsx', content);
console.log('Modified admin page to add Edit button and modal');
