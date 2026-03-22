// ============================================================
//  LUMO — ai.js
//  Mistral AI summary for search results
// ============================================================

async function loadAISummary(query, topResults) {
  const card = document.getElementById('aiCard');
  const text = document.getElementById('aiSummaryText');
  if (!card || !text) return;

  const key = LUMO_CONFIG.MISTRAL_API_KEY;
  if (!key || key === 'YOUR_MISTRAL_API_KEY_HERE') {
    card.style.display = 'block';
    text.textContent = `Add your Mistral API key in config.js to get AI-powered summaries for "${query}".`;
    return;
  }

  card.style.display = 'block';
  text.innerHTML = `<span style="opacity:0.6">Thinking about <em>${query}</em>…</span>`;

  const context = topResults.map(r => `- ${r.title}: ${r.description}`).join('\n');

  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `You are Lumo, a smart search assistant. Based on these search results for "${query}", write a concise 2-3 sentence summary that directly answers what the user likely wants to know. Be factual, clear, and helpful. Do not mention that you're summarizing search results.

Results context:
${context}

Provide only the summary, no preamble.`
        }]
      })
    });

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content || 'Could not generate a summary.';
    text.textContent = summary;
  } catch (err) {
    console.error('AI summary error:', err);
    card.style.display = 'none';
  }
}
