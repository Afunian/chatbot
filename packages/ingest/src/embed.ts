import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts
  });
  // @ts-ignore
  return res.data.map((d: any) => d.embedding);
}
