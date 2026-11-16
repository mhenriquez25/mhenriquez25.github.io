/**
 * Moda Casual - Lógica de la Tienda y Carrito (app.js)
 */

let catalogCurrentFilter = "all";
let catalogSearchQuery = "";
let activeModalProduct = null;
let selectedSize = "M";
let detailQty = 1;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Inicializar slider de inicio
  initHeroSlider();

  // 2. Videos automáticos silenciosos
  initProcessVideos();

  // 3. Menú scroll activo
  initScrollNav();

  // 4. Cargar productos desde base de datos / cache
  await window.store.loadInitialProducts();

  // 5. Escuchar cambios de productos en tiempo real
  window.store.listenToProducts(() => {
    renderCatalog();
  });

  // 6. Actualizar contadores del carrito
  updateCartUI();

  // 7. Escuchar eventos de actualización del carrito
  window.addEventListener("mc_cart_updated", () => {
    updateCartUI();
  });
});

/* ==================================================
   1. HERO SLIDER
================================================== */
function initHeroSlider() {
  const slides = [...document.querySelectorAll(".slide")];
  const dots = [...document.querySelectorAll(".dot")];
  const prev = document.querySelector(".hero-arrow.prev");
  const next = document.querySelector(".hero-arrow.next");

  if (!slides.length) return;

  let current = 0;
  let timer;

  function showSlide(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.classList.toggle("active", i === current));
    dots.forEach((dot, i) => dot.classList.toggle("active", i === current));
  }

  function startAuto() {
    clearInterval(timer);
    timer = setInterval(() => showSlide(current + 1), 4000);
  }

  if (prev) {
    prev.addEventListener("click", () => {
      showSlide(current - 1);
      startAuto();
    });
  }

  if (next) {
    next.addEventListener("click", () => {
      showSlide(current + 1);
      startAuto();
    });
  }

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      showSlide(i);
      startAuto();
    });
  });

  showSlide(0);
  startAuto();
}

/* ==================================================
   2. VIDEOS AUTOPLAY
================================================== */
function initProcessVideos() {
  const processVideos = [...document.querySelectorAll(".process-video")];
  if (!processVideos.length) return;

  function tryPlay(v) {
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    const p = v.play();
    if (p !== undefined) p.catch(() => {});
  }

  processVideos.forEach(v => {
    v.muted = true;
    v.defaultMuted = true;
    v.load();
    v.addEventListener("loadeddata", () => tryPlay(v));
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.12) {
        tryPlay(entry.target);
      } else {
        entry.target.pause();
      }
    });
  }, { threshold: [0, 0.12, 0.35] });

  processVideos.forEach(v => observer.observe(v));
}

/* ==================================================
   3. MENÚ NAVEGACIÓN ACTIVO
================================================== */
function initScrollNav() {
  const navLinks = [...document.querySelectorAll(".menu a[href^='#']")];
  const sections = ["coleccion", "videos", "marca", "estilo", "contacto"]
    .map(id => document.getElementById(id))
    .filter(Boolean);

  function setActive(id) {
    navLinks.forEach(l => l.classList.toggle("active", l.getAttribute("href") === "#" + id));
  }

  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio);
    if (visible.length) setActive(visible[0].target.id);
  }, { rootMargin: "-25% 0px -55% 0px", threshold: [0.01, 0.2] });

  sections.forEach(s => observer.observe(s));

  window.addEventListener("scroll", () => {
    if (window.scrollY < 240) setActive("inicio");
  }, { passive: true });
}

/* ==================================================
   4. CATÁLOGO DINÁMICO DE PRODUCTOS
================================================== */
function renderCatalog() {
  const container = document.getElementById("catalogProductsContainer");
  if (!container) return;

  let list = window.store.products || [];

  // Filtrar por categoría
  if (catalogCurrentFilter !== "all") {
    list = list.filter(p => p.category && p.category.toLowerCase() === catalogCurrentFilter.toLowerCase());
  }

  // Filtrar por texto de búsqueda
  if (catalogSearchQuery) {
    const q = catalogSearchQuery.toLowerCase();
    list = list.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.colors && p.colors.some(c => c.toLowerCase().includes(q)))
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: #fff; border-radius: 20px; border: 1px solid rgba(0,0,0,.06);">
        <i class="fa-solid fa-shirt" style="font-size: 40px; color: var(--muted); margin-bottom: 12px;"></i>
        <h3 style="font-size: 18px; margin-bottom: 6px;">No se encontraron camisas en esta categoría</h3>
        <p style="color: var(--muted); font-size: 14px;">Intenta seleccionando otra categoría o limpiando el buscador.</p>
      </div>
    `;
    return;
  }

  const currency = (window.store.settings && window.store.settings.currency) || "L.";

  container.innerHTML = list.map(prod => {
    const price = Number(prod.price) || 0;
    const oldPrice = prod.originalPrice ? Number(prod.originalPrice) : null;
    const img = prod.image || "assets/verd1.png";

    return `
      <article class="product-card">
        ${prod.badge ? `<span class="product-badge">${prod.badge}</span>` : ""}
        
        <div class="product-photo-box" onclick="openProductDetailModal('${prod.id}')" title="Ver detalle">
          <img src="${img}" alt="${prod.name}" onerror="this.src='assets/verd1.png'">
        </div>

        <div class="product-info-box">
          <span class="product-category-tag">${prod.category || "Casual"}</span>
          <h3 class="product-title" onclick="openProductDetailModal('${prod.id}')">${prod.name}</h3>
          <p class="product-desc">${prod.description || "100% algodón de excelente suavidad y durabilidad."}</p>
          
          <div class="product-price-row">
            <span class="product-price-current">${currency} ${price.toFixed(2)}</span>
            ${oldPrice ? `<span class="product-price-old">${currency} ${oldPrice.toFixed(2)}</span>` : ""}
          </div>

          <div class="product-actions">
            <button class="btn-buy-card" onclick="openProductDetailModal('${prod.id}')">
              <i class="fa-solid fa-cart-plus"></i> Comprar
            </button>
            <button class="btn-view-card" onclick="openProductDetailModal('${prod.id}')" title="Vista Rápida">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function filterCatalog(category, btn) {
  catalogCurrentFilter = category;
  document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderCatalog();
}

function onCatalogSearch() {
  catalogSearchQuery = document.getElementById("catalogSearchInput").value.trim();
  renderCatalog();
}

/* ==================================================
   5. MODAL DE DETALLE Y SELECCIÓN
================================================== */
function openProductDetailModal(id) {
  const prod = window.store.products.find(p => p.id === id);
  if (!prod) return;

  activeModalProduct = prod;
  detailQty = 1;

  const currency = (window.store.settings && window.store.settings.currency) || "L.";
  document.getElementById("modalProdTitle").innerText = prod.name;
  document.getElementById("modalProdName").innerText = prod.name;
  document.getElementById("modalProdCategory").innerText = prod.category || "Casual";
  document.getElementById("modalProdPrice").innerText = `${currency} ${Number(prod.price).toFixed(2)}`;
  document.getElementById("modalProdDesc").innerText = prod.description || "Camisa elaborada en algodón suave de alta calidad y estampado DTF de alta resolución.";
  document.getElementById("modalProdImg").src = prod.image || "assets/verd1.png";
  document.getElementById("detailQtyDisplay").innerText = "1";

  // Tallas
  const sizes = prod.sizes && prod.sizes.length > 0 ? prod.sizes : ["S", "M", "L", "XL"];
  selectedSize = sizes[0];
  const sizesContainer = document.getElementById("modalSizesContainer");
  sizesContainer.innerHTML = sizes.map((s, idx) => `
    <button type="button" class="size-btn ${idx === 0 ? 'active' : ''}" onclick="selectDetailSize('${s}', this)">${s}</button>
  `).join("");

  // Colores
  const colors = prod.colors && prod.colors.length > 0 ? prod.colors : ["Negro", "Blanco"];
  const colorSelect = document.getElementById("modalColorSelect");
  colorSelect.innerHTML = colors.map(c => `<option value="${c}">${c}</option>`).join("");

  document.getElementById("productDetailModal").classList.add("open");
}

function closeProductDetailModal() {
  document.getElementById("productDetailModal").classList.remove("open");
  activeModalProduct = null;
}

function selectDetailSize(size, btn) {
  selectedSize = size;
  document.querySelectorAll("#modalSizesContainer .size-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function changeDetailQty(delta) {
  detailQty = Math.max(1, detailQty + delta);
  document.getElementById("detailQtyDisplay").innerText = detailQty;
}

function addProductToCartFromModal(goToCheckout = false) {
  if (!activeModalProduct) return;

  const color = document.getElementById("modalColorSelect").value || "Único";
  window.store.addToCart(activeModalProduct, selectedSize, color, detailQty);

  closeProductDetailModal();
  updateCartUI();

  if (goToCheckout) {
    openCheckout();
  } else {
    openCart();
  }
}

/* ==================================================
   6. CARRITO DE COMPRAS LATERAL
================================================== */
function openCart() {
  updateCartUI();
  document.getElementById("cartBackdrop").classList.add("open");
  document.getElementById("cartDrawer").classList.add("open");
}

function closeCart() {
  document.getElementById("cartBackdrop").classList.remove("open");
  document.getElementById("cartDrawer").classList.remove("open");
}

function updateCartUI() {
  const count = window.store.getCartCount();
  const total = window.store.getCartTotal();
  const currency = (window.store.settings && window.store.settings.currency) || "L.";

  // Badges en header y botón flotante
  const headerBadge = document.getElementById("cartCountBadge");
  const floatingBadge = document.getElementById("floatingCartBadge");
  if (headerBadge) headerBadge.innerText = count;
  if (floatingBadge) floatingBadge.innerText = count;

  // Total en drawer
  const totalDisplay = document.getElementById("cartDrawerTotal");
  if (totalDisplay) totalDisplay.innerText = `${currency} ${total.toFixed(2)}`;

  // Lista de items
  const container = document.getElementById("cartItemsContainer");
  if (!container) return;

  if (window.store.cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-state">
        <i class="fa-solid fa-cart-shopping"></i>
        <h4 style="font-size: 16px; margin-bottom: 6px;">Tu carrito está vacío</h4>
        <p style="font-size: 13px;">Explora la colección y agrega las camisas que más te gusten.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = window.store.cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img">
        <img src="${item.image || 'assets/verd1.png'}" alt="${item.name}">
      </div>

      <div class="cart-item-details">
        <h4>${item.name}</h4>
        <div class="cart-item-meta">Talla: <strong>${item.size}</strong> | Color: <strong>${item.color}</strong></div>
        <div class="cart-item-price">${currency} ${(item.price * item.quantity).toFixed(2)}</div>
        
        <div class="cart-qty-ctrl">
          <button class="cart-qty-btn" onclick="window.store.updateCartQty('${item.cartItemId}', -1); updateCartUI();">-</button>
          <span>${item.quantity}</span>
          <button class="cart-qty-btn" onclick="window.store.updateCartQty('${item.cartItemId}', 1); updateCartUI();">+</button>
        </div>
      </div>

      <button class="cart-remove-btn" onclick="window.store.removeFromCart('${item.cartItemId}'); updateCartUI();" title="Eliminar">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `).join("");
}

/* ==================================================
   7. PROCESO DE CHECKOUT Y COMPRA
================================================== */
function openCheckout() {
  if (window.store.cart.length === 0) {
    alert("Tu carrito está vacío. Agrega una camisa para proceder con la compra.");
    return;
  }

  closeCart();

  const total = window.store.getCartTotal();
  const count = window.store.getCartCount();
  const currency = (window.store.settings && window.store.settings.currency) || "L.";

  document.getElementById("checkoutItemsCount").innerText = `${count} ${count === 1 ? 'prenda' : 'prendas'}`;
  document.getElementById("checkoutFinalTotal").innerText = `${currency} ${total.toFixed(2)}`;

  const summaryList = document.getElementById("checkoutSummaryList");
  summaryList.innerHTML = window.store.cart.map(i => `
    <div>• ${i.quantity}x ${i.name} (Talla: ${i.size}, Color: ${i.color}) - ${currency} ${(i.price * i.quantity).toFixed(2)}</div>
  `).join("");

  document.getElementById("checkoutModal").classList.add("open");
}

function closeCheckout() {
  document.getElementById("checkoutModal").classList.remove("open");
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById("btnConfirmOrder");
  btn.disabled = true;
  btn.innerText = "Registrando tu orden...";

  try {
    const paymentMethodEl = document.querySelector('input[name="paymentMethod"]:checked');
    const customerData = {
      name: document.getElementById("custName").value.trim(),
      phone: document.getElementById("custPhone").value.trim(),
      city: document.getElementById("custCity").value.trim(),
      address: document.getElementById("custAddress").value.trim(),
      notes: document.getElementById("custNotes").value.trim(),
      paymentMethod: paymentMethodEl ? paymentMethodEl.value : "Transferencia Bancaria"
    };

    const result = await window.store.createOrder(customerData);

    closeCheckout();
    updateCartUI();

    // Mostrar modal de confirmación con link a WhatsApp
    document.getElementById("successOrderNumber").innerText = `#${result.order.orderNumber}`;
    const waBtn = document.getElementById("successWhatsappBtn");
    waBtn.href = result.whatsappUrl;

    document.getElementById("orderSuccessModal").classList.add("open");

    // Abrir WhatsApp automáticamente
    window.open(result.whatsappUrl, "_blank");

  } catch (err) {
    alert("Hubo un problema al procesar el pedido: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-brands fa-whatsapp" style="font-size:20px;"></i> Confirmar Pedido por WhatsApp';
  }
}

function closeSuccessModal() {
  document.getElementById("orderSuccessModal").classList.remove("open");
}
