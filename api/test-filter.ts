export function filterSpecificVideos(query: string, matches: any[]) {
  if (matches.length <= 1) return matches;

  const normalize = (s: string) => s.toLowerCase().replace(/eco\s+d/g, "ecod").replace(/[^a-z0-9]+/g, " ").trim();
  const queryWords = normalize(query).split(" ");
  const stopWords = new Set(["and", "or", "the", "a", "an", "settings", "sms", "alert", "video", "training"]);

  const scoredMatches = matches.map(v => {
    const videoWords = normalize(`${v.title} ${v.topic}`).split(" ");
    let extraCount = 0;
    for (const vw of videoWords) {
      if (!stopWords.has(vw) && !queryWords.includes(vw)) {
        extraCount++;
      }
    }
    return { ...v, extraCount };
  });

  // Find the minimum extra count
  const minExtra = Math.min(...scoredMatches.map(m => m.extraCount));
  
  // If there's a significant gap between the most general video and specialized ones,
  // we filter out the overly specialized ones.
  // For example, if a general video has 0 extra words, and a specific one has 3 extra words,
  // we only return the general one (because the user didn't ask for the specific one).
  return scoredMatches
    .filter(m => m.extraCount <= minExtra + 1)
    .map(m => {
      const { extraCount, ...rest } = m;
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
console.log(filterSpecificVideos("ecod printer", [videos[0], videos[1]])); // Wait, if LLM returns both, what happens?

console.log("\n=== query: reports ===");
console.log(filterSpecificVideos("reports", [videos[2], videos[3]]));

console.log("\n=== query: ecod reports ===");
console.log(filterSpecificVideos("ecod reports", [videos[2], videos[3]]));
