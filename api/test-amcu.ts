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
    
    // Build CHECK/ACTION pairs from col 4 onwards
    const pairs: Array<{ check: string; action: string }> = [];
    for (let col = 4; col < cells.length; col += 2) {
      const check  = cells[col]   ? String(cells[col]).trim()   : "";
      const action = cells[col+1] ? String(cells[col+1]).trim() : "";
      if (!check && !action) continue;

      if (/contact customer care/i.test(check)) {
        pairs.push({ check: "CONTACT_CARE", action: "" });
        break;
      }
      if (/contact customer care/i.test(action)) {
        if (check) pairs.push({ check, action: "" });
        pairs.push({ check: "CONTACT_CARE", action: "" });
        break;
      }
      pairs.push({ check, action });
    }
    if (pairs.length === 0) return;
    
    const tag = `chatbot_${slug(lastProduct)}_${slug(complaint)}`;
    if (seenTags.has(tag)) return;
    seenTags.add(tag);
    
    const p = toTitleCase(lastProduct);
    const respLines = [`Here's how to troubleshoot your ${p} — ${toTitleCase(complaint)}:`];
    let stepNum = 1;
    for (const { check, action } of pairs) {
      if (check === "CONTACT_CARE") {
        respLines.push(`${stepNum}. If none of the above steps help, please contact Poornasree Customer Care for further assistance.`);
        break;
      }
      if (check && action) {
        respLines.push(`${stepNum}. Check: ${toTitleCase(check)} → ${toTitleCase(action)}`);
      } else if (check) {
        respLines.push(`${stepNum}. ${toTitleCase(check)}`);
      }
      stepNum++;
    }

    intents.push({
      tag,
      responses: [respLines.join("\n")],
    });
  });
  
  console.log("Total intents extracted:", intents.length);
  let failed = 0;
  for (const intent of intents) {
    if (!intent.tag || !Array.isArray(intent.responses) || !intent.responses[0]) continue;
    const response = intent.responses[0] as string;
    const stepLines = response.split("\n").filter((l: string) => /^\d+\.\s/.test(l.trim()));
    const steps = stepLines.map((l: string) => l.replace(/^\d+\.\s*/, "").trim());
    
    if (steps.length === 0) {
       console.log("NO STEPS FOR", intent.tag);
       failed++;
    }
  }
  console.log("Failed due to 0 steps:", failed);
}

extract().catch(console.error);
