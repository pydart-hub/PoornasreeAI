import sys

def process(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Marketing / Sales
    if "marketing" in filepath or "sales" in filepath:
        content = content.replace("activeTab === y", "activeTab === item.key")

    # Admin page
    if "admin" in filepath and "page.tsx" in filepath:
        content = content.replace(
            'import TroubleshootingTemplatesTab from "@/components/admin/TroubleshootingTemplatesTab";',
            'import TemplatesTab from "@/components/admin/TemplatesTab";'
        )
        content = content.replace(
            '<TroubleshootingTemplatesTab />\n',
            ''
        )
        content = content.replace(
            '<TroubleshootingTemplatesTab />',
            ''
        )
        if 'const [editingDocId, setEditingDocId]' not in content:
            content = content.replace(
                'const [deletingDocId, setDeletingDocId] = useState<string | null>(null);',
                'const [deletingDocId, setDeletingDocId] = useState<string | null>(null);\n  const [editingDocId, setEditingDocId] = useState<string | null>(null);'
            )
        if 'onClick={() => setEditingDocId(doc.id)}' not in content:
            content = content.replace(
                '<button\n                            onClick={() => handleDeleteDoc(doc.id)}',
                '<button\n                            onClick={() => setEditingDocId(doc.id)}\n                            className="p-1.5 rounded-lg text-content-secondary hover:text-primary hover:bg-primary/10 dark:hover:bg-primary-900/30 transition-colors"\n                            title="Edit Issues"\n                          >\n                            <Pencil className="w-4 h-4" />\n                          </button>\n                          <button\n                            onClick={() => handleDeleteDoc(doc.id)}'
            )
        if 'editingDocId && (' not in content:
            content = content.replace(
                '</div>\n      </ResponsiveSidebar>',
                '</div>\n      </ResponsiveSidebar>\n\n      {/* Issues Modal */}\n      {editingDocId && (\n        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">\n          <div className="bg-surface dark:bg-surface-dark w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl flex flex-col">\n            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-line dark:border-line-dark bg-surface dark:bg-surface-dark">\n              <h2 className="text-lg font-bold text-content dark:text-content-dark">Edit Document Issues</h2>\n              <button onClick={() => setEditingDocId(null)} className="p-2 rounded-full hover:bg-surface-hover dark:hover:bg-surface-dark-hover text-content-secondary">\n                <X className="w-5 h-5" />\n              </button>\n            </div>\n            <div className="p-6">\n              <TemplatesTab documentId={editingDocId} />\n            </div>\n          </div>\n        </div>\n      )}'
            )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

process('src/app/(admin)/admin/page.tsx')
process('src/app/(marketing)/marketing/page.tsx')
process('src/app/(sales)/sales/page.tsx')

print('Fixed all pages')
