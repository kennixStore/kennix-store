// KENNIX Store — Supabase connection

const SUPABASE_URL = "https://shdstohkbpvoxjtghsob.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Izj2iOacJqMcoso2OeLyzA_gghnKnxo";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

console.log("KENNIX database connection initialized.");

async function loadProducts() {
  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("Is_active", true);

  if (error) {
    console.error("KENNIX product loading error:", error.message);
    return [];
  }

  console.log("KENNIX products:", data);
  return data;
}

loadProducts();
