// src/lib/gemini.js
const MODE = process.env.GEMINI_MODE || 'dev';

async function generateText(prompt, opts = {}) {
  if (MODE === 'dev') {
    try {
      const { TextGenerationClient } = require('@google/genai');
      const client = new TextGenerationClient({ apiKey: process.env.GEMINI_API_KEY });
      const model = opts.model || 'gemini-1.5';
      const res = await client.generateText({ model, prompt });
      return res?.text || (res?.candidates && res.candidates[0]?.content) || JSON.stringify(res);
    } catch (err) {
      console.error('Gemini dev mode error:', err.message);
      return null;
    }
  } else {
    // Vertex placeholder - implement with official SDK in prod
    const fetch = require('node-fetch');
    const model = opts.model || 'models/gemini-1.5';
    const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${process.env.GOOGLE_PROJECT_ID}/locations/us-central1/${model}:generateText`;
    const body = { prompt };
    const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.GOOGLE_OAUTH_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json();
    return j?.candidates?.[0]?.content || JSON.stringify(j);
  }
}

module.exports = { generateText };
