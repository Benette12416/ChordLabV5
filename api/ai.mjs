export const config = { runtime: 'nodejs' };

function extractText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  let text = '';
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      if ((c.type === 'output_text' || c.type === 'text') && c.text) text += c.text;
    }
  }
  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!key || !model) return res.status(503).json({ error: 'AI is not configured' });

  const { prompt = '', song = {} } = req.body || {};
  if (!String(prompt).trim()) return res.status(400).json({ error: 'Prompt required' });

  const instructions = `You are ChordLab's music-theory assistant.
Return ONLY JSON:
{"message":"short musical explanation","action":{"style":"worship|gospel|jazz|blues|neosoul|null","complexity":1|2|3|4|null,"transpose":integer,"reharmonize":"section|song|null"}}
Use playable, educational harmony. Preserve the user's song unless the request clearly asks for a transformation.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: `${instructions}\n\nUSER REQUEST:\n${String(prompt).slice(0,4000)}\n\nCURRENT SONG:\n${JSON.stringify(song).slice(0,14000)}`
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'OpenAI request failed' });
    const text = extractText(data).trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
    return res.status(200).json(JSON.parse(text));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'AI request failed' });
  }
}
