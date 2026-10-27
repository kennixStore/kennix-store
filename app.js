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
// Display products on the KENNIX website
async function displayProducts() {
  const products = await loadProducts();
  const container = document.getElementById("product-grid");

  if (!container) {
    console.error("Product display area not found.");
    return;
  }

  if (!products.length) {
    container.innerHTML = "<p>No products available yet.</p>";
    return;
  }

  container.innerHTML = products.map(product => `
    <div class="product-card">
      <img
        src="${product.Image_Url || 'https://placehold.co/400x400?text=KENNIX'}"
        alt="${product.Name || 'KENNIX product'}"
        style="width:100%;height:220px;object-fit:cover;"
      >
      <h3>${product.Name || "Unnamed product"}</h3>
      <p>${product.Description || ""}</p>
      <p>₦${Number(product.Price || 0).toLocaleString("en-NG")}</p>
      <p>${product.Category || ""}</p>
    </div>
  `).join("");
}

displayProducts();
