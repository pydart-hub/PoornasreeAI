import ExcelJS from 'exceljs';

async function listSheets() {
  const filePath = "C:/Users/abhis/OneDrive/Desktop/PoornasreeAI/data/training/CHATBOT_DATAS.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  
  const sheets: string[] = [];
  wb.eachSheet((sheet) => {
    sheets.push(sheet.name);
  });
  console.log("Sheets found:", sheets);
}

listSheets().catch(console.error);
