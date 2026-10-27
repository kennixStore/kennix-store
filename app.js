"use strict";

// KENNIX Supabase connection
const SUPABASE_URL = "https://shdstohkbpvoxjtghsob.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Izj2iOacJqMcoso2OeLyzA_gghnKnxo";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let products = [];
let cart = [];
let activeCategory = "All";
let searchText = "";
let sortMode = "featured";

const get = id => document.getElementById(id);

const money = amount =>
  "₦" + Number(amount || 0).toLocaleString("en-NG");

function showMessage(message) {
  const container = get("product-grid");
  if (container) container.textContent = message;
}

// Load products from Supabase
async function loadProducts() {
  const container = get("product-grid");

  if (container) {
    container.textContent = "Loading KENNIX products...";
  }

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("Is_active", true);

    if (error) throw error;

    products = data || [];
    renderProducts();

    if (!products.length) {
      showMessage(
        "No active products found. Check product status in your admin dashboard."
      );
    }
  } catch (error) {
    console.error("KENNIX product loading error:", error);

    showMessage(
      "Products could not load. Please refresh and try again."
    );
  }
}

// Product cards
function renderProducts() {
  const container = get("product-grid");
  if (!container) return;

  container.replaceChildren();

  let visible = products.filter(product => {
    const matchesCategory =
      activeCategory === "All" ||
      String(product.Category || "").toLowerCase() ===
        activeCategory.toLowerCase();

    const searchableText = [
      product.Name,
      product.Category,
      product.Description
    ].join(" ").toLowerCase();

    return matchesCategory && searchableText.includes(searchText);
  });

  if (sortMode === "low") {
    visible.sort((a, b) => Number(a.Price) - Number(b.Price));
  }

  if (sortMode === "high") {
    visible.sort((a, b) => Number(b.Price) - Number(a.Price));
  }

  if (!visible.length) {
    showMessage(
      products.length
        ? "No products match your search."
        : "No active products found."
    );
    return;
  }

  visible.forEach(product => {
    const card = document.createElement("article");
    card.className = "product-card";

    const art = document.createElement("div");
    art.className = "product-art";

    if (product.Image_Url) {
      const image = document.createElement("img");
      image.src = product.Image_Url;
      image.alt = product.Name || "KENNIX product";
      image.loading = "lazy";
      image.style.cssText =
        "width:100%;height:100%;object-fit:cover;position:absolute;inset:0";

      image.onerror = () => {
        image.remove();
        art.textContent = "KENNIX";
      };

      art.appendChild(image);
    } else {
      art.textContent = "KENNIX";
    }

    const tag = document.createElement("span");
    tag.className = "product-tag";
    tag.textContent = product.Category || "KENNIX";

    const addButton = document.createElement("button");
    addButton.className = "add-btn";
    addButton.type = "button";
    addButton.textContent = "+";
    addButton.setAttribute(
      "aria-label",
      "Add " + (product.Name || "product") + " to bag"
    );
    addButton.addEventListener("click", () => addToCart(product.id));

    art.append(tag, addButton);

    const info = document.createElement("div");
    info.className = "product-info";

    const details = document.createElement("div");

    const name = document.createElement("h3");
    name.textContent = product.Name || "Unnamed product";

    const description = document.createElement("p");
    description.textContent = product.Description || "";

    details.append(name, description);

    const price = document.createElement("span");
    price.className = "price";
    price.textContent = money(product.Price);

    info.append(details, price);
    card.append(art, info);
    container.appendChild(card);
  });
}

// Search
function setupSearch() {
  const searchButton = document.querySelector(".search-toggle");
  if (!searchButton) return;

  let input = get("product-search");

  if (!input) {
    input = document.createElement("input");
    input.id = "product-search";
    input.type = "search";
    input.placeholder = "Search clothes, shoes, bags...";
    input.setAttribute("aria-label", "Search products");
    input.style.cssText =
      "display:none;width:100%;padding:12px;margin:12px 0;background:#19191f;color:white;border:1px solid #51445f;border-radius:6px";

    const shop = get("shop");
    if (shop) {
      shop.insertBefore(input, shop.children[1] || null);
    }

    input.addEventListener("input", () => {
      searchText = input.value.trim().toLowerCase();
      renderProducts();
    });
  }

  searchButton.addEventListener("click", () => {
    input.style.display =
      input.style.display === "none" ? "block" : "none";

    if (input.style.display === "block") {
      input.focus();
      get("shop")?.scrollIntoView({ behavior: "smooth" });
    }
  });
}

// Category buttons
function setupFilters() {
  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();

      activeCategory = button.dataset.filter || "All";

      document.querySelectorAll(".filter").forEach(filter => {
        filter.classList.toggle(
          "active",
          filter.dataset.filter === activeCategory
        );
      });

      renderProducts();

      get("shop")?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

// Sorting
function setupSorting() {
  const select = get("sort");
  if (!select) return;

  select.addEventListener("change", () => {
    sortMode = select.value;
    renderProducts();
  });
}

// Shopping bag
function addToCart(id) {
  const product = products.find(
    item => String(item.id) === String(id)
  );

  if (!product) return;

  const existing = cart.find(
    item => String(item.id) === String(id)
  );

  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  renderCart();
openCart();
showToast("Added to your bag!");
}

function renderCart() {
  const count = cart.reduce(
    (sum, item) => sum + item.quantity, 0
  );

  const total = cart.reduce(
    (sum, item) => sum + Number(item.Price) * item.quantity, 0
  );

  if (get("cart-count")) {
    get("cart-count").textContent = count;
  }

  if (get("drawer-count")) {
    get("drawer-count").textContent = "(" + count + ")";
  }

  if (get("subtotal")) {
    get("subtotal").textContent = money(total);
  }

  const container = get("cart-items");
  if (!container) return;

  container.replaceChildren();

  if (!cart.length) {
    const empty = document.createElement("p");
    empty.className = "empty-cart";
    empty.textContent = "Your bag is waiting for something good.";
    container.appendChild(empty);
    return;
  }

  cart.forEach(item => {
    const row = document.createElement("div");
    row.className = "cart-row";

    const thumb = document.createElement("div");
    thumb.className = "cart-thumb";
    thumb.textContent = "K";

    const details = document.createElement("div");

    const name = document.createElement("h4");
    name.textContent = item.Name;

    const price = document.createElement("p");
    price.textContent = money(item.Price);

    const quantity = document.createElement("div");
    quantity.className = "qty";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease quantity");
    minus.addEventListener("click", () => {
      item.quantity--;

      if (item.quantity <= 0) {
        cart = cart.filter(p => p.id !== item.id);
      }

      renderCart();
    });

    const amount = document.createElement("span");
    amount.textContent = item.quantity;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase quantity");
    plus.addEventListener("click", () => {
      item.quantity++;
      renderCart();
    });

    quantity.append(minus, amount, plus);
    details.append(name, price, quantity);

    const remove = document.createElement("button");
    remove.className = "remove-btn";
    remove.type = "button";
    remove.textContent = "REMOVE";
    remove.addEventListener("click", () => {
      cart = cart.filter(p => p.id !== item.id);
      renderCart();
    });

    row.append(thumb, details, remove);
    container.appendChild(row);
  });
}

// Correct overlay class: styles.css uses "open"
function openCart() {
  get("overlay")?.classList.add("open");
  get("cart-drawer")?.classList.add("open");
  get("cart-drawer")?.setAttribute("aria-hidden", "false");
}

function closeCart() {
  get("overlay")?.classList.remove("open");
  get("cart-drawer")?.classList.remove("open");
  get("cart-drawer")?.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  const toast = get("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => toast.classList.remove("show"), 2500);
}

// Mobile navigation
function setupMenu() {
  const menuButton = get("menu-toggle");
  const nav = document.querySelector(".desktop-nav");

  if (!menuButton || !nav) return;

  menuButton.addEventListener("click", () => {
    const isOpen = nav.style.display === "flex";

    nav.style.cssText = isOpen
      ? ""
      : "display:flex;flex-direction:column;gap:18px;position:absolute;top:78px;left:0;right:0;padding:24px;background:#101014;z-index:10;border-bottom:1px solid #34313b";

    menuButton.setAttribute("aria-expanded", String(!isOpen));
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.style.cssText = "";
      menuButton.setAttribute("aria-expanded", "false");
    });
  });
}

// Checkout: collect details, but do not pretend an order was submitted.
// A secure server-side order endpoint must be connected first.
function setupCheckout() {
  const button = get("checkout-btn");
  if (!button) return;

  button.addEventListener("click", () => {
    if (!cart.length) {
      alert("Your bag is empty.");
      return;
    }

    alert(
      "KENNIX checkout is not connected yet. " +
      "Your bag is ready, but no order or payment has been submitted."
    );
  });
}

function setupNewsletter() {
  const form = get("newsletter-form");

  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();
      alert("Newsletter registration is not connected yet.");
    });
  }
}

// Start the website
async function init() {
  get("open-cart")?.addEventListener("click", openCart);
  get("close-cart")?.addEventListener("click", closeCart);
  get("overlay")?.addEventListener("click", closeCart);

  setupSearch();
  setupFilters();
  setupSorting();
  setupMenu();
  setupCheckout();
  setupNewsletter();

  renderCart();
  await loadProducts();
}

init();
