const ExcelJS = require('exceljs');
async function read() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('C:\\Users\\abhis\\OneDrive\\Desktop\\PoornasreeAI\\docs\\Engineers Training.xlsx');
  
  const sheet = wb.getWorksheet('Training Data') || wb.worksheets[0];
  console.log("Columns:", sheet.getRow(1).values);
  
  const tags = new Set();
  sheet.eachRow((row, rowIdx) => {
    if (rowIdx === 1) return;
    const tag = row.values[1];
    if (tag) tags.add(tag);
  });
  console.log("Unique Tags:", Array.from(tags));
}
read().catch(console.error);
