import prisma from "../src/lib/prisma";

function normalizeQueryTypos(str: string): string {
  if (!str) return "";
  let s = str.toLowerCase();

  const typoMap: [RegExp, string][] = [
    [/\b(n|nd)\b/gi, "and"],
    [/\b(sow|sowing|soing|shwing|showng|shwoing|shwng|shwong)\b/gi, "showing"],
    [/\b(sown|sowed|shwn)\b/gi, "shown"],
    [/\b(disply|dsiplay|dplay|dispaly|disp)\b/gi, "display"],
    [/\b(vibratin|vibrat|vibro|vibrtor|vibrationg)\b/gi, "vibrating"],
    [/\b(readng|rading|reding|redng|readin)\b/gi, "reading"],
    [/\b(eror|erorr|erorrs|prblm|problm|prblem)\b/gi, "error"],
    [/\b(chargr|adptr|adaptr|adaptor|adpter)\b/gi, "adapter"],
    [/\b(analyser|analyzr|analizer|analysr)\b/gi, "analyzer"],
    [/\b(weighin|waghing|scle|scal)\b/gi, "scale"],
    [/\b(calibrat|calibrtion|calbration)\b/gi, "calibration"],
    [/\b(tempratur|tempreture|temprature|temp)\b/gi, "temperature"],
    [/\b(cleanin|clening|cleang)\b/gi, "cleaning"],
    [/\b(leakg|leekage|leakege|lekage)\b/gi, "leakage"],
    [/\b(prnt|prnter|prntng)\b/gi, "printer"],
    [/\b(batery|battry|batry)\b/gi, "battery"],
    [/\b(tim|tme)\b/gi, "time"],
    [/\b(dat|dte)\b/gi, "date"],
  ];

  for (const [pattern, replacement] of typoMap) {
    s = s.replace(pattern, replacement);
  }

  return s;
}

async function testDocMatching() {
  const query = "Date n time not shwong";
  console.log("Original query:", query);
  const normalized = normalizeQueryTypos(query);
  console.log("Normalized query:", normalized);

  const cleanQ = normalized.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const allQueryWords = cleanQ.split(/\s+/).filter((w) => w.length >= 2);
  console.log("Clean query words:", allQueryWords);

  const chunks = await prisma.documentChunk.findMany({
    where: { document: { documentType: { in: ["customer", "both"] } } },
    include: { document: true },
  });

  console.log(`Found ${chunks.length} customer chunks in DB.\n`);

  const scored = chunks.map((chunk) => {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;
    
    // Check topic/title match in first line
    const firstLine = contentLower.split("\n")[0];
    for (const w of allQueryWords) {
      if (firstLine.includes(w)) {
        score += 10;
      } else if (contentLower.includes(w)) {
        score += 3;
      }
    }

    if (contentLower.includes(cleanQ)) score += 30;

    return { chunk, score, firstLine };
  }).sort((a, b) => b.score - a.score);

  console.log("Top 5 Scored Chunks:");
  scored.slice(0, 5).forEach((s, idx) => {
    console.log(`[#${idx + 1}] Score: ${s.score} | Doc: "${s.chunk.document.title}"`);
    console.log(`Title line: ${s.firstLine}`);
    console.log(`Content:\n${s.chunk.content}\n---`);
  });
}

testDocMatching().catch(console.error);
