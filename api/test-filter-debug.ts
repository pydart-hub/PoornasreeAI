export function filterSpecificVideos(query: string, matches: any[]) {
  if (matches.length <= 1) return matches;

  const normalize = (s: string) => s.toLowerCase().replace(/eco\s+d/g, "ecod").replace(/[^a-z0-9]+/g, " ").trim();
  const queryWords = normalize(query).split(" ");
  const stopWords = new Set(["and", "or", "the", "a", "an", "settings", "sms", "alert", "video", "training", "how", "to", "for"]);
  const meaningfulQueryWords = queryWords.filter(w => !stopWords.has(w) && w.length > 1);

  if (meaningfulQueryWords.length === 0) return matches;

  const scoredMatches = matches.map(v => {
    const videoWordsList = normalize(`${v.title} ${v.topic}`).split(" ").filter(w => w.length > 1);
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

  const minMissing = Math.min(...scoredMatches.map(m => m.missingCount));
  const bestCoverage = scoredMatches.filter(m => m.missingCount === minMissing);
  const minExtra = Math.min(...bestCoverage.map(m => m.extraCount));
  
  return bestCoverage
    .filter(m => m.extraCount <= minExtra + 1)
    .map(m => {
      const { extraCount, missingCount, ...rest } = m;
      return rest;
    });
}

const v1 = { id: 1, title: "Printer and dispay settings", topic: "Printer,Display" };
const v2 = { id: 2, title: "LACTOSURE ECO D display and printer settings and sms alert", topic: "display,printer,sms alert" };

console.log("=== display settings ===");
console.log(filterSpecificVideos("display settings", [v1, v2]));

console.log("=== printer and display ===");
console.log(filterSpecificVideos("printer and display", [v1, v2]));

console.log("=== display ===");
console.log(filterSpecificVideos("display", [v1, v2]));
