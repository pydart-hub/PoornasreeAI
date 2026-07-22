export function filterSpecificVideos(query: string, matches: any[]) {
  if (matches.length <= 1) return matches;

  const normalize = (s: string) => s.toLowerCase().replace(/eco\s+d/g, "ecod").replace(/[^a-z0-9]+/g, " ").trim();
  const queryWords = normalize(query).split(" ");
  const stopWords = new Set(["and", "or", "the", "a", "an", "settings", "sms", "alert", "video", "training"]);
  const meaningfulQueryWords = queryWords.filter(w => !stopWords.has(w));

  const scoredMatches = matches.map(v => {
    const videoWordsList = normalize(`${v.title} ${v.topic}`).split(" ");
    const videoWords = new Set(videoWordsList);
    
    let extraCount = 0;
    for (const vw of videoWordsList) {
      if (!stopWords.has(vw) && !meaningfulQueryWords.includes(vw)) {
        extraCount++;
      }
    }

    let missingCount = 0;
    for (const qw of meaningfulQueryWords) {
      if (!videoWords.has(qw)) {
        missingCount++;
      }
    }

    return { ...v, extraCount, missingCount };
  });

  // First, find videos that match the most query words (minimize missingCount)
  const minMissing = Math.min(...scoredMatches.map(m => m.missingCount));
  const bestCoverage = scoredMatches.filter(m => m.missingCount === minMissing);

  // Second, among those with best coverage, prefer videos that aren't overly specific (minimize extraCount)
  const minExtra = Math.min(...bestCoverage.map(m => m.extraCount));
  
  return bestCoverage
    .filter(m => m.extraCount <= minExtra + 1)
    .map(m => {
      const { extraCount, missingCount, ...rest } = m;
      return rest;
    });
}

const videos = [
  { id: 1, title: "Printer and display settings", topic: "Printer,Display" },
  { id: 2, title: "LACTOSURE ECO D display and printer settings and sms alert", topic: "display,printer,sms alert" },
  { id: 3, title: "Reports", topic: "reports" },
  { id: 4, title: "LACTOSURE ECOD REPORTS", topic: "eco d reports" },
  { id: 6, title: "Channels", topic: "channels" },
  { id: 7, title: "ECO D Channels", topic: "eco d channels" }
];

console.log("=== query: printer ===");
console.log(filterSpecificVideos("printer", [videos[0], videos[1]]));

console.log("\n=== query: ecod printer ===");
console.log(filterSpecificVideos("ecod printer", [videos[0], videos[1]]));

console.log("\n=== query: reports ===");
console.log(filterSpecificVideos("reports", [videos[2], videos[3]]));

console.log("\n=== query: ecod reports ===");
console.log(filterSpecificVideos("ecod reports", [videos[2], videos[3]]));
