import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log("Testing insert...");
  const { error: iError } = await supabase
    .from('deal_analyses')
    .upsert({
      deal_id: "99999",
      deal_title: "Test Deal",
      analise_ia: { test: true },
      dados_brutos: "test data",
      metricas: { test: true }
    }, { onConflict: 'deal_id' });

  console.log("Insert Error:", iError);

  console.log("Testing select...");
  const { data: sData, error: sError } = await supabase
    .from('deal_analyses')
    .select('*')
    .eq('deal_id', "99999")
    .single();

  console.log("Select Data:", sData ? "Found" : "Not Found");
  console.log("Select Error:", sError);
}
test();
