import OpenAI from 'openai';
const o = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

try {
  await o.embeddings.create({
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    input: 'hello'
  });
  console.log('OpenAI ok');
} catch (e) {
  console.error('OpenAI error:', e.message);
}