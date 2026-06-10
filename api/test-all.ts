import ExcelJS from 'exceljs';

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (word) => {
    if (word === word.toUpperCase() && word.length > 2) return word; 
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).trim();
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);

async function extract() {
  const filePath = "C:/Users/abhis/OneDrive/Desktop/PoornasreeAI/data/training/CHATBOT_DATAS.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  
  const userChatSheet = wb.getWorksheet("USER CHAT");
  if (!userChatSheet) { console.log("No USER CHAT sheet"); return; }
  
  const intents: any[] = [];
  const seenTags = new Set<string>();
  let lastProduct = "";
  
  userChatSheet.eachRow((row, rowIdx) => {
    if (rowIdx === 1) return;
    const cells = row.values as any[];
    const productCell = cells[2] ? String(cells[2]).trim() : "";
    const complaint   = cells[3] ? String(cells[3]).trim() : "";
    
    if (productCell) lastProduct = productCell;
    if (!complaint || !lastProduct) return;
    
    const tag = `chatbot_${slug(lastProduct)}_${slug(complaint)}`;
    if (seenTags.has(tag)) return;
    seenTags.add(tag);
    
    intents.push({
      product: lastProduct,
      complaint,
      tag
    });
  });
  
  for (const intent of intents) {
    console.log(intent.product, "|", intent.complaint);
  }
}

extract().catch(console.error);
