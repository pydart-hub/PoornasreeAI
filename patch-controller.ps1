$f = "api\src\controllers\message.controller.ts"
$c = [System.IO.File]::ReadAllText($f)

# Find start: "const langName = language" (beginning of old single-pass block)
$si = $c.IndexOf("    const langName = language")

# Find end: after the old "return (data.message...)" line (include the newline)
$retLine = 'return (data.message?.content as string)?.trim() || "Sorry, I wasn''t able to generate a response.";'
$retPos = $c.IndexOf($retLine)
$ei = $c.IndexOf("`n", $retPos) + 1   # include the trailing \n

Write-Host "Replacing characters $si to $ei (length $($ei - $si))"

$newBlock = @'
    const prompt = [roleInstruction, "", "CONTEXT:", context, "", `QUESTION:
${userQuery}`, "", "ANSWER:"].join("\n");
'@

# Due to PowerShell here-string newline issues with backtick-dollar, 
# build the prompt line manually
$template_prompt = '    const prompt = [roleInstruction, "", "CONTEXT:", context, "", `QUESTION:\n${userQuery}`, "", "ANSWER:"].join("\n");'

$newBlock = $template_prompt + "`r`n" + @'

    const t2 = Date.now();
    const { data } = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: GEN_MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        keep_alive: "10m",
        options: { num_ctx: 512, num_predict: 80, temperature: 0 },
      },
      { timeout: 300_000 }
    );
    console.log(`[RAG] generate: ${Date.now() - t2} ms`);
    englishAnswer = (data.message?.content as string)?.trim() || "Sorry, I wasn't able to generate a response.";
    }

    // Step 2: Translate if non-English (focused second LLM call)
    if (isTranslation) {
      const langName = language === "ml" ? "Malayalam" : language === "hi" ? "Hindi" : language;
'@

$template_tprompt = '      const translationPrompt = `Translate the following text to ${langName}.\nOutput ONLY the ${langName} translation. Do not include any English.\n\nText:\n${englishAnswer}\n\n${langName}:`;'

$newBlock = $newBlock + "`r`n" + $template_tprompt + "`r`n" + @'
      try {
        const t3 = Date.now();
        const { data: tData } = await axios.post(
          `${OLLAMA_URL}/api/chat`,
          {
            model: GEN_MODEL,
            messages: [{ role: "user", content: translationPrompt }],
            stream: false,
            keep_alive: "10m",
            options: { num_ctx: 512, num_predict: 300, temperature: 0 },
          },
          { timeout: 120_000 }
        );
        console.log(`[RAG] translate ${langName}: ${Date.now() - t3} ms`);
        const translated = (tData.message?.content as string)?.trim();
        return translated || englishAnswer;
      } catch (transErr: any) {
        console.error("[RAG] translation error, falling back to English:", transErr?.message ?? transErr);
        return englishAnswer;
      }
    }

    return englishAnswer;
'@

$newContent = $c.Substring(0, $si) + $newBlock + $c.Substring($ei)
[System.IO.File]::WriteAllText($f, $newContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done. File length: $($newContent.Length) chars (was $($c.Length))"
