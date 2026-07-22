export function filterSpecificVideos(query: string, matches: any[]) {
  if (matches.length === 0) return matches;

  const normalize = (s: string) => s.toLowerCase().replace(/eco\s+d/g, "ecod").replace(/[^a-z0-9]+/g, " ").trim();
  const queryWords = normalize(query).split(" ");
  const stopWords = new Set(["and", "or", "the", "a", "an", "settings", "sms", "alert", "video", "training", "how", "to", "for"]);
  const meaningfulQueryWords = queryWords.filter(w => !stopWords.has(w) && w.length > 1);

  if (meaningfulQueryWords.length === 0) return matches;

  const scoredMatches = matches.map(v => {
    // Only use TOPIC for specificity, because title contains too many random words
    const topicWordsList = normalize(v.topic).split(" ").filter(w => w.length > 1);
    const topicWords = new Set(topicWordsList);
    
    let extraTopicCount = 0;
    for (const tw of topicWordsList) {
      if (!stopWords.has(tw) && !meaningfulQueryWords.includes(tw)) {
        extraTopicCount++;
      }
    }

    let missingCount = 0;
    for (const qw of meaningfulQueryWords) {
      if (!topicWords.has(qw)) {
        missingCount++;
      }
    }

    return { ...v, extraTopicCount, missingCount };
  });

  // Since we only use topic words, a highly specific video will have extraTopicCount >= 1
  // (e.g., "ecod", "smart"). A general video will have 0.
  // We should NEVER return a specific video if the user didn't ask for it, 
  // EVEN IF it's the only match.
  // Let's filter out anything with extraTopicCount >= 1 UNLESS it's the only way to get missingCount = 0.
  // Wait, if user searches "display", and topic is "printer,display". extraTopicCount = 1 ("printer").
  // So it would get filtered out!

  // The safest mathematical way to handle "types" dynamically:
  // Isolate the FIRST word of the topic if it's a known pattern? No, types can be multi-word.
  
  return scoredMatches;
}
