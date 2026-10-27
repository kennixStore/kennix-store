// ==========================================
// KENNIX STORE — MAIN APPLICATION
// ==========================================

const SUPABASE_URL = "https://shdstohkbpvoxjtghsob.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Izj2iOacJqMcoso2OeLyzA_gghnKnxo";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let products = [];
let cart = [];
let activeFilter = "All";
let searchTerm = "";
let selectedProduct = null;

const money = amount =>
  "₦" + Number(amount || 0).toLocaleString("en-NG");

const get = id => document.getElementById(id);

// ==========================================
// ADDITIONAL STYLES
// ==========================================

function addAppStyles() {
  if (get("kennix-app-styles")) return;

  const style = document.createElement("style");
  style.id = "kennix-app-styles";

  style.textContent = `
    .product-card {
      cursor: pointer;
      transition: transform .2s ease;
    }

    .product-card:hover {
      transform: translateY(-3px);
    }

    .product-card img {
      display: block;
      width: 100%;
      height: 220px;
      object-fit: cover;
    }

    .kennix-panel {
      display: none;
      padding: 16px;
      background: white;
      color: #252038;
      border: 1px solid #e7e1f0;
      border-radius: 12px;
      margin: 12px 0;
    }

    .kennix-panel.visible {
      display: block;
    }

    .kennix-search-input {
      box-sizing: border-box;
      width: 100%;
      padding: 13px;
      border: 1px solid #d7cce8;
      border-radius: 8px;
      font-size: 16px;
      background: white;
      color: #252038;
    }

    .kennix-menu-links {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }

    .kennix-menu-links a {
      color: #5c438e;
      text-decoration: none;
      padding: 8px 0;
    }

    .kennix-modal {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(20, 15, 30, .72);
      padding: 18px;
      box-sizing: border-box;
      align-items: center;
      justify-content: center;
      overflow-y: auto;
    }

    .kennix-modal.visible {
      display: flex;
    }

    .kennix-modal-box {
      position: relative;
      background: white;
      color: #252038;
      border-radius: 14px;
      padding: 20px;
      width: 100%;
      max-width: 430px;
      max-height: 90vh;
      overflow-y: auto;
      box-sizing: border-box;
    }

    .kennix-modal-box img {
      width: 100%;
      max-height: 330px;
      object-fit: contain;
      border-radius: 9px;
    }

    .kennix-modal-close {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1;
      border: none;
      border-radius: 50%;
      width: 38px;
      height: 38px;
      font-size: 24px;
      cursor: pointer;
      background: #f0eaf8;
      color: #35224f;
    }

    #checkout-form input,
    #checkout-form textarea {
      display: block;
      box-sizing: border-box;
      width: 100%;
      margin: 7px 0 14px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 7px;
      font: inherit;
    }

    #checkout-form label {
      display: block;
      font-weight: 600;
    }

    #checkout-form button:disabled {
      opacity: .6;
      cursor: wait;
    }

    .kennix-cart-row button {
      padding: 8px 14px;
      margin: 5px 5px 5px 0;
      cursor: pointer;
    }

    body.kennix-modal-open {
      overflow: hidden;
    }
  `;

  document.head.appendChild(style);
}

// ==========================================
// LOAD PRODUCTS FROM SUPABASE
// ==========================================

async function loadProducts() {
  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("Is_active", true);

  if (error) {
    console.error("KENNIX product loading error:", error.message);
    showToast("Products could not load. Please refresh.");
    return [];
  }

  return data || [];
}

// ==========================================
// PRODUCT FILTERING AND SEARCH
// ==========================================

function getVisibleProducts() {
  let result = [...products];

  if (activeFilter !== "All") {
    result = result.filter(product =>
      String(product.Category || "").toLowerCase() ===
      activeFilter.toLowerCase()
    );
  }

  if (searchTerm) {
    result = result.filter(product => {
      const text = [
        product.Name,
        product.Description,
        product.Category
      ].join(" ").toLowerCase();

      return text.includes(searchTerm.toLowerCase());
    });
  }

  const sort = get("sort");

  if (sort) {
    if (sort.value === "price-low") {
      result.sort((a, b) => Number(a.Price) - Number(b.Price));
    }

    if (sort.value === "price-high") {
      result.sort((a, b) => Number(b.Price) - Number(a.Price));
    }

    if (sort.value === "name") {
      result.sort((a, b) =>
        String(a.Name || "").localeCompare(String(b.Name || ""))
      );
    }
  }

  return result;
}

// ==========================================
// DISPLAY PRODUCTS
// ==========================================

function showProducts() {
  const container = get("product-grid");

  if (!container) return;

  container.replaceChildren();

  const visibleProducts = getVisibleProducts();

  if (!visibleProducts.length) {
    container.textContent = products.length
      ? "No products match your search."
      : "No products available yet.";

    return;
  }

  visibleProducts.forEach(product => {
    const card = document.createElement("div");
    card.className = "product-card";

    const img = document.createElement("img");

    img.src =
      product.Image_Url ||
      "https://placehold.co/400x400?text=KENNIX";

    img.alt = product.Name || "KENNIX product";
    img.loading = "lazy";

    img.onerror = () => {
      img.onerror = null;
      img.src = "https://placehold.co/400x400?text=KENNIX";
    };

    const title = document.createElement("h3");
    title.textContent = product.Name || "Unnamed product";

    const category = document.createElement("p");
    category.textContent = product.Category || "";

    const price = document.createElement("p");
    price.textContent = money(product.Price);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "ADD TO BAG +";
    button.className = "primary-btn";

    button.addEventListener("click", event => {
      event.stopPropagation();
      addToCart(product.id);
    });

    card.append(img, title, category, price, button);

    card.addEventListener("click", () => {
      openProductDetails(product);
    });

    container.appendChild(card);
  });
}

// ==========================================
// PRODUCT DETAILS POPUP
// ==========================================

function createProductModal() {
  if (get("kennix-product-modal")) return;

  const modal = document.createElement("div");
  modal.id = "kennix-product-modal";
  modal.className = "kennix-modal";

  modal.innerHTML = `
    <div class="kennix-modal-box" role="dialog"
         aria-modal="true" aria-label="Product details">
      <button type="button" class="kennix-modal-close"
              aria-label="Close product details">&times;</button>
      <div id="kennix-product-details"></div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".kennix-modal-close")
    .addEventListener("click", closeProductDetails);

  modal.addEventListener("click", event => {
    if (event.target === modal) closeProductDetails();
  });
}

function openProductDetails(product) {
  selectedProduct = product;

  createProductModal();

  const modal = get("kennix-product-modal");
  const details = get("kennix-product-details");

  details.replaceChildren();

  const img = document.createElement("img");

  img.src =
    product.Image_Url ||
    "https://placehold.co/400x400?text=KENNIX";

  img.alt = product.Name || "KENNIX product";

  img.onerror = () => {
    img.onerror = null;
    img.src = "https://placehold.co/400x400?text=KENNIX";
  };

  const title = document.createElement("h2");
  title.textContent = product.Name || "Unnamed product";

  const price = document.createElement("h3");
  price.textContent = money(product.Price);

  const category = document.createElement("p");
  category.textContent = "Category: " + (product.Category || "General");

  const description = document.createElement("p");
  description.textContent =
    product.Description || "Contact KENNIX for more details.";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "primary-btn";
  addButton.textContent = "ADD TO BAG +";

  addButton.addEventListener("click", () => {
    addToCart(product.id);
    closeProductDetails();
  });

  details.append(img, title, price, category, description, addButton);

  modal.classList.add("visible");
  document.body.classList.add("kennix-modal-open");
}

function closeProductDetails() {
  get("kennix-product-modal")?.classList.remove("visible");
  document.body.classList.remove("kennix-modal-open");
}

// ==========================================
// ADD ITEMS TO BAG
// ==========================================

function addToCart(id) {
  const product = products.find(
    p => String(p.id) === String(id)
  );

  if (!product) {
    showToast("Product not found.");
    return;
  }

  const existing = cart.find(
    item => String(item.id) === String(id)
  );

  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  renderCart();
  showToast("Added to your bag!");
}

// ==========================================
// DISPLAY SHOPPING BAG
// ==========================================

function renderCart() {
  const count = cart.reduce(
    (sum, item) => sum + item.quantity, 0
  );

  const total = cart.reduce(
    (sum, item) =>
      sum + Number(item.Price || 0) * item.quantity,
    0
  );

  if (get("cart-count")) {
    get("cart-count").textContent = count;
  }

  if (get("drawer-count")) {
    get("drawer-count").textContent = `(${count})`;
  }

  if (get("subtotal")) {
    get("subtotal").textContent = money(total);
  }

  if (get("checkout-total")) {
    get("checkout-total").textContent =
      "Order total: " + money(total);
  }

  const container = get("cart-items");

  if (!container) return;

  container.replaceChildren();

  if (!cart.length) {
    container.textContent =
      "Your bag is waiting for something good.";
    return;
  }

  cart.forEach(item => {
    const row = document.createElement("div");
    row.className = "kennix-cart-row";
    row.style.cssText =
      "padding:14px 0;border-bottom:1px solid #ddd";

    const name = document.createElement("h3");
    name.textContent = item.Name || "Product";

    const price = document.createElement("p");
    price.textContent = money(item.Price) + " each";

    const quantity = document.createElement("p");
    quantity.textContent = "Quantity: " + item.quantity;

    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.textContent = "−";
    decrease.setAttribute("aria-label", "Decrease quantity");

    decrease.addEventListener("click", () => {
      item.quantity--;

      if (item.quantity <= 0) {
        cart = cart.filter(
          p => String(p.id) !== String(item.id)
        );
      }

      renderCart();
    });

    const increase = document.createElement("button");
    increase.type = "button";
    increase.textContent = "+";
    increase.setAttribute("aria-label", "Increase quantity");

    increase.addEventListener("click", () => {
      item.quantity++;
      renderCart();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";

    remove.addEventListener("click", () => {
      cart = cart.filter(
        p => String(p.id) !== String(item.id)
      );

      renderCart();
      showToast("Item removed.");
    });

    row.append(
      name,
      price,
      quantity,
      decrease,
      increase,
      remove
    );

    container.appendChild(row);
  });
}

// ==========================================
// NOTIFICATION MESSAGE
// ==========================================

function showToast(message) {
  let toast = get("toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";

    toast.style.cssText = `
      position:fixed;
      bottom:24px;
      left:50%;
      transform:translateX(-50%);
      background:#35224f;
      color:white;
      padding:13px 20px;
      border-radius:9px;
      z-index:11000;
      max-width:85%;
      text-align:center;
      box-shadow:0 4px 16px #0002;
    `;

    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = "block";

  clearTimeout(toast._timer);

  toast._timer = setTimeout(() => {
    toast.style.display = "none";
  }, 2500);
}

// ==========================================
// OPEN AND CLOSE SHOPPING BAG
// ==========================================

function openCart() {
  get("overlay")?.classList.add("open");
  get("cart-drawer")?.classList.add("open");

  get("cart-drawer")?.setAttribute("aria-hidden", "false");
}

function closeCart() {
  get("overlay")?.classList.remove("open");
  get("overlay")?.classList.remove("active");

  get("cart-drawer")?.classList.remove("open");

  get("cart-drawer")?.setAttribute("aria-hidden", "true");
}

get("open-cart")?.addEventListener("click", openCart);
get("close-cart")?.addEventListener("click", closeCart);
get("overlay")?.addEventListener("click", closeCart);

// ==========================================
// SEARCH PANEL
// ==========================================

function createSearchPanel() {
  if (get("kennix-search-panel")) return;

  const header = document.querySelector("header");

  const panel = document.createElement("div");
  panel.id = "kennix-search-panel";
  panel.className = "kennix-panel";

  const input = document.createElement("input");

  input.type = "search";
  input.id = "kennix-search-input";
  input.className = "kennix-search-input";
  input.placeholder = "Search clothes, shoes, bags...";
  input.setAttribute("aria-label", "Search products");

  panel.appendChild(input);

  if (header) {
    header.insertAdjacentElement("afterend", panel);
  } else {
    document.body.prepend(panel);
  }

  input.addEventListener("input", () => {
    searchTerm = input.value.trim();
    showProducts();
  });
}

function setupSearch() {
  createSearchPanel();

  document.querySelectorAll(".search-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const panel = get("kennix-search-panel");

      panel.classList.toggle("visible");

      if (panel.classList.contains("visible")) {
        get("kennix-search-input")?.focus();
      } else {
        searchTerm = "";

        if (get("kennix-search-input")) {
          get("kennix-search-input").value = "";
        }

        showProducts();
      }
    });
  });
}

// ==========================================
// MOBILE NAVIGATION
// ==========================================

function setupMobileMenu() {
  const menuButton = get("menu-toggle");

  if (!menuButton || get("kennix-mobile-menu")) return;

  const menu = document.createElement("nav");

  menu.id = "kennix-mobile-menu";
  menu.className = "kennix-panel";

  const links = document.createElement("div");
  links.className = "kennix-menu-links";

  const destinations = [
    ["Home", "#home"],
    ["Shop", "#shop"],
    ["Collections", "#collections"],
    ["Our Story", "#story"]
  ];

  destinations.forEach(([label, href]) => {
    const link = document.createElement("a");

    link.textContent = label;
    link.href = href;

    link.addEventListener("click", () => {
      menu.classList.remove("visible");
      menuButton.setAttribute("aria-expanded", "false");
    });

    links.appendChild(link);
  });

  menu.appendChild(links);

  const header = document.querySelector("header");

  if (header) {
    header.insertAdjacentElement("afterend", menu);
  } else {
    document.body.prepend(menu);
  }

  menuButton.setAttribute("aria-expanded", "false");

  menuButton.addEventListener("click", () => {
    const opened = menu.classList.toggle("visible");

    menuButton.setAttribute("aria-expanded", String(opened));
  });
}

// ==========================================
// PRODUCT CATEGORY FILTERS
// ==========================================

function setupFilters() {
  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", event => {
      const filter = event.currentTarget.dataset.filter;

      if (!filter) return;

      activeFilter = filter;
      showProducts();

      if (get("shop")) {
        get("shop").scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    });
  });

  get("sort")?.addEventListener("change", showProducts);
}

// ==========================================
// CHECKOUT
// ==========================================

get("checkout-btn")?.addEventListener("click", () => {
  if (!cart.length) {
    alert("Your bag is empty.");
    return;
  }

  showCheckout();
});

function showCheckout() {
  if (get("checkout-form")) {
    get("checkout-form").scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });

    return;
  }

  const drawer = get("cart-drawer");

  if (!drawer) {
    alert("Checkout is temporarily unavailable.");
    return;
  }

  const form = document.createElement("form");

  form.id = "checkout-form";

  form.style.cssText =
    "padding:16px;background:white;color:#252038;" +
    "border-radius:10px;margin-top:15px";

  form.innerHTML = `
    <h3>Delivery details</h3>

    <label for="customer-name">Full name</label>
    <input
      id="customer-name"
      name="customer_name"
      type="text"
      required
      maxlength="100"
      autocomplete="name"
    >

    <label for="customer-phone">Phone number</label>
    <input
      id="customer-phone"
      name="customer_phone"
      type="tel"
      required
      maxlength="30"
      autocomplete="tel"
    >

    <label for="delivery-address">Delivery address</label>
    <textarea
      id="delivery-address"
      name="delivery_address"
      required
      maxlength="500"
      autocomplete="street-address"
      rows="3"
    ></textarea>

    <p id="checkout-total"></p>

    <button type="submit">PLACE ORDER</button>

    <p class="small">
      Payment is not collected online yet.
      KENNIX will confirm your order before payment.
    </p>
  `;

  drawer.appendChild(form);

  renderCart();

  form.addEventListener("submit", submitOrder);

  form.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

async function submitOrder(event) {
  event.preventDefault();

  const form = event.currentTarget;

  const customerName =
    form.elements.customer_name.value.trim();

  const customerPhone =
    form.elements.customer_phone.value.trim();

  const deliveryAddress =
    form.elements.delivery_address.value.trim();

  if (!cart.length) {
    alert("Your bag is empty.");
    return;
  }

  if (!customerName || !customerPhone || !deliveryAddress) {
    alert("Please complete all delivery details.");
    return;
  }

  const button = form.querySelector('button[type="submit"]');

  button.disabled = true;
  button.textContent = "PLACING ORDER...";

  const orderRows = cart.map(item => ({
    customer_name: customerName,
    customer_phone: customerPhone,
    delivery_address: deliveryAddress,
    product_name: item.Name,
    quantity: item.quantity,
    unit_price: Number(item.Price),
    status: "Pending"
  }));

  try {
    const { error } = await db
      .from("orders")
      .insert(orderRows);

    if (error) {
      console.error("KENNIX order error:", error);

      alert(
        "Order could not be 
