// test-env.ts
import { config } from 'dotenv';
config({ override: true }); // <— forces .env to override existing env vars
import { Pool } from 'pg';
import OpenAI from 'openai';

async function testSupabase() {
  console.log("🔹 Checking Supabase connection...");
  try {
    const pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
    });
    const { rows } = await pool.query("select now() as current_time");
    console.log("✅ Supabase connected:", rows[0].current_time);
    await pool.end();
  } catch (err) {
    console.error("❌ Supabase connection failed:", err.message);
  }
}

async function testOpenAI() {
  console.log("🔹 Checking OpenAI API...");
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const models = await openai.models.list();
    console.log("✅ OpenAI connected: found", models.data.length, "models.");
  } catch (err: any) {
    console.error("❌ OpenAI connection failed:", err.message);
  }
}

(async () => {
  console.log("=== DentistryGPT Environment Test ===");
  console.log("SUPABASE_DB_URL:", !!process.env.SUPABASE_DB_URL ? "✔️ set" : "❌ missing");
  console.log("OPENAI_API_KEY:", !!process.env.OPENAI_API_KEY ? "✔️ set" : "❌ missing");
  console.log("-------------------------------------");
  await testSupabase();
  await testOpenAI();
  console.log("=====================================");
})();