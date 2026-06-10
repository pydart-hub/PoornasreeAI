const fs = require('fs');

let content = fs.readFileSync('api/prisma/schema.prisma', 'utf8');

// Replace TroubleshootingTemplate with DocumentIssue
content = content.replace(/model TroubleshootingTemplate \{[\s\S]*?\}\n/, `model DocumentIssue {
  id          String   @id @default(uuid())
  documentId  String?
  problemType String   @unique             // e.g. "power_issue", "no_display"
  title       String
  description String?  @db.Text
  isActive    Boolean  @default(true)
  audience    String   @default("customer")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  document    Document? @relation(fields: [documentId], references: [id], onDelete: Cascade)
  steps       DocumentIssueStep[]
}\n`);

// Replace TroubleshootingStep with DocumentIssueStep
content = content.replace(/model TroubleshootingStep \{[\s\S]*?\}\n/, `model DocumentIssueStep {
  id          String @id @default(uuid())
  issueId     String
  stepNumber  Int
  stepContent String @db.Text
  createdAt   DateTime @default(now())

  issue       DocumentIssue @relation(fields: [issueId], references: [id], onDelete: Cascade)

  @@unique([issueId, stepNumber])
}\n`);

fs.writeFileSync('api/prisma/schema.prisma', content);
console.log('Schema updated successfully');
