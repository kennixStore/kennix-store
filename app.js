const SUPABASE_URL = "https://shdstohkbpvoxjtghsob.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Izj2iOacJqMcoso2OeLyzA_gghnKnxo";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let products = [];
let cart = [];

const money = amount => "₦" + Number(amount).toLocaleString("en-NG");
const get = id => document.getElementById(id);

async function loadProducts() {
const { data, error } = await db
.from("products")
.select("*")
.eq("Is_active", true);

if (error) {
console.error(error.message);
return [];
}

return data || [];
}

function showProducts() {
const container = get("product-grid");
if (!container) return;

if (!products.length) {
container.textContent = "No products available yet.";
return;
}

container.replaceChildren();

products.forEach(product => {
const card = document.createElement("div");
card.className = "product-card";

const img = document.createElement("img");
img.src = product.Image_Url || "https://placehold.co/400x400?text=KENNIX";
img.alt = product.Name || "KENNIX product";
img.style.cssText = "width:100%;height:220px;object-fit:cover";

const title = document.createElement("h3");
title.textContent = product.Name || "Unnamed product";

const description = document.createElement("p");
description.textContent = product.Description || "";

const category = document.createElement("p");
category.textContent = product.Category || "";

const price = document.createElement("p");
price.textContent = money(product.Price);

const button = document.createElement("button");
button.textContent = "ADD TO BAG +";
button.className = "primary-btn";
button.onclick = () => addToCart(product.id);

card.append(img, title, description, category, price, button);
container.appendChild(card);

});
}

function addToCart(id) {
const product = products.find(p => String(p.id) === String(id));
if (!product) return;

const existing = cart.find(item => String(item.id) === String(id));

if (existing) {
existing.quantity++;
} else {
cart.push({ ...product, quantity: 1 });
}

renderCart();
showToast("Added to your bag!");
}

function renderCart() {
const count = cart.reduce((sum, item) => sum + item.quantity, 0);
const total = cart.reduce((sum, item) => sum + Number(item.Price) * item.quantity, 0);

if (get("cart-count")) get("cart-count").textContent = count;
if (get("drawer-count")) get("drawer-count").textContent = "(${count})";
if (get("subtotal")) get("subtotal").textContent = money(total);

const container = get("cart-items");
if (!container) return;

container.replaceChildren();

if (!cart.length) {
container.textContent = "Your bag is waiting for something good.";
return;
}

cart.forEach(item => {
const row = document.createElement("div");
row.style.cssText = "padding:14px 0;border-bottom:1px solid #ddd";

const name = document.createElement("h3");
name.textContent = item.Name;

const price = document.createElement("p");
price.textContent = money(item.Price) + " each";

const quantity = document.createElement("p");
quantity.textContent = "Quantity: " + item.quantity;

const decrease = document.createElement("button");
decrease.textContent = "−";
decrease.style.width = "30%";
decrease.onclick = () => {
item.quantity--;
if (item.quantity <= 0) cart = cart.filter(p => p.id !== item.id);
renderCart();
};

const increase = document.createElement("button");
increase.textContent = "+";
increase.style.width = "30%";
increase.onclick = () => {
item.quantity++;
renderCart();
};

row.append(name, price, quantity, decrease, increase);
container.appendChild(row);

});
}

function showToast(text) {
const toast = get("toast");
if (!toast) return;
toast.textContent = text;
toast.classList.add("show");
setTimeout(() => toast.classList.remove("show"), 2500);
}

function openCart() {
get("overlay")?.classList.add("active");
get("cart-drawer")?.classList.add("open");
get("cart-drawer")?.setAttribute("aria-hidden", "false");
}

function closeCart() {
get("overlay")?.classList.remove("active");
get("cart-drawer")?.classList.remove("open");
get("cart-drawer")?.setAttribute("aria-hidden", "true");
}

get("open-cart")?.addEventListener("click", openCart);
get("close-cart")?.addEventListener("click", closeCart);
get("overlay")?.addEventListener("click", closeCart);

get("checkout-btn")?.addEventListener("click", () => {
if (!cart.length) {
alert("Your bag is empty.");
return;
}

showCheckout();
});

function showCheckout() {
if (get("checkout-form")) return;

const form = document.createElement("form");
form.id = "checkout-form";
form.style.cssText = "padding:16px;background:white;border-radius:10px;margin-top:15px";

const heading = document.createElement("h3");
heading.textContent = "Delivery details";

form.innerHTML = `
  <label>Full name</label>
  <input name="customer_name" required maxlength="100" autocomplete="name">

  <label>Phone number</label>
  <input name="customer_phone" required maxlength="30" autocomplete="tel">

  <label>Delivery address</label>
  <textarea name="delivery_address" required maxlength="500" autocomplete="street-address"></textarea>

  <p id="checkout-total"></p>

  <button type="submit">PLACE ORDER</button>

  <p class="small">
    Payment is not collected online yet.
    We'll confirm your order before payment.
  </p>
`;

const total = cart.reduce((sum, item) => sum + Number(item.Price) * item.quantity, 0);
get("checkout-total").textContent = "Order total: " + money(total);

form.addEventListener("submit", submitOrder);
}

async function submitOrder(event) {
event.preventDefault();

const form = event.currentTarget;
const customerName = form.elements.customer_name.value.trim();
const customerPhone = form.elements.customer_phone.value.trim();
const deliveryAddress = form.elements.delivery_address.value.trim();

if (!cart.length) {
alert("Your bag is empty.");
return;
}

const button = form.querySelector('button[type="submit"]');
button.disabled = true;
button.textContent = "PLACING ORDER...";

/*

Each product becomes a separate row in the existing orders table.

The current table stores one product per order row.
*/
const orderRows = cart.map(item => ({
customer_name: customerName,
customer_phone: customerPhone,
delivery_address: deliveryAddress,
product_name: item.Name,
quantity: item.quantity,
unit_price: Number(item.Price),
status: "Pending"
}));


const { error } = await db.from("orders").insert(orderRows);

if (error) {
console.error(error);
alert("Order could not be placed: " + error.message);
button.disabled = false;
button.textContent = "PLACE ORDER";
return;
}

cart = [];
renderCart();
form.remove();
closeCart();

alert("Thank you! Your order has been received. KENNIX will contact you to confirm it.");
}

async function init() {
products = await loadProducts();
showProducts();
renderCart();
}

init();
