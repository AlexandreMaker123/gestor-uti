export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, system } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid messages' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  // Sanitize messages: remove custom fields, keep only role + content
  const clean = messages.map(m => ({ role: m.role, content: m.content }));

  let attempt = 0;
  while (attempt < 3) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: system || '',
          messages: clean,
        }),
      });

      if (response.status === 529 || response.status === 503) {
        attempt++;
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: err?.error?.message || 'Anthropic API error' });
      }

      const data = await response.json();
      const reply = data.content?.map(c => c.text || '').join('') || '';
      return res.status(200).json({ reply });

    } catch (err) {
      attempt++;
      if (attempt >= 3) return res.status(500).json({ error: 'Failed to reach Anthropic API after 3 attempts' });
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }

  return res.status(500).json({ error: 'Max retries exceeded' });
}