/**
 * Moda Casual - Lógica de la Tienda y Carrito (app.js)
 */

let catalogCurrentFilter = "all";
let catalogCurrentGender = "all";
let catalogCurrentPriceRange = "all";
let catalogSearchQuery = "";
let activeModalProduct = null;
let selectedSize = "M";
let detailQty = 1;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Inicializar slider de inicio
  initHeroSlider();

  // 2. Videos automáticos silenciosos
  initProcessVideos();

  // 3. Router de vistas independientes (Sobre Nosotros, Catálogo, Contacto)
  initViewRouter();

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
   3. SISTEMA DE VISTAS INDEPENDIENTES
   - Sobre Nosotros (index.html): Solo información del negocio
   - Catálogo (catalogo.html): Solo catálogo de productos y compra
   - Contacto (contacto.html): Solo atención, WhatsApp y consultas
================================================== */
function navigateView(viewName, event) {
  const hasMultipleViews = document.querySelectorAll(".page-view").length > 1;
  if (!hasMultipleViews) {
    if (viewName === "catalogo") window.location.href = "catalogo.html";
    else if (viewName === "contacto") window.location.href = "contacto.html";
    else window.location.href = "index.html";
    return;
  }

  if (event && event.preventDefault) {
    event.preventDefault();
  }

  const validViews = ["nosotros", "catalogo", "contacto"];
  if (!validViews.includes(viewName)) {
    viewName = "nosotros";
  }

  // 1. Mostrar únicamente la vista seleccionada y ocultar las demás
  validViews.forEach(v => {
    const el = document.getElementById("view-" + v) || document.getElementById(v);
    if (el) {
      if (v === viewName) {
        el.style.display = "block";
        el.classList.add("active-view");
      } else {
        el.style.display = "none";
        el.classList.remove("active-view");
      }
    }
  });

  // 2. Resaltar pestaña activa en el menú superior y en el pie de página
  document.querySelectorAll(".menu a, footer a[data-view]").forEach(link => {
    const target = link.getAttribute("data-view") || link.getAttribute("href")?.replace("#", "");
    if (target === viewName) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  // 3. Sincronizar hash de la URL sin recarga
  try {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, null, "#" + viewName);
    } else {
      window.location.hash = "#" + viewName;
    }
  } catch (e) {}

  // 4. Desplazar hacia arriba para ver el inicio de la vista
  window.scrollTo({ top: 0, behavior: "smooth" });

  // 5. Si la vista activa es el catálogo, renderizar productos
  if (viewName === "catalogo") {
    renderCatalog();
  }
}

function initViewRouter() {
  window.navigateView = navigateView;

  const hasMultipleViews = document.querySelectorAll(".page-view").length > 1;
  if (!hasMultipleViews) return;

  // Detectar hash inicial (#nosotros, #catalogo, #contacto)
  const hash = (window.location.hash || "").replace("#", "").toLowerCase();
  const initialView = ["catalogo", "contacto", "nosotros"].includes(hash) ? hash : "nosotros";
  navigateView(initialView);

  // Escuchar botones de historial del navegador (Atrás / Adelante)
  window.addEventListener("hashchange", () => {
    const current = (window.location.hash || "").replace("#", "").toLowerCase();
    if (["catalogo", "contacto", "nosotros"].includes(current)) {
      navigateView(current);
    }
  });
}

/* ==================================================
   4. CATÁLOGO DINÁMICO DE PRODUCTOS
================================================== */
function renderCatalog() {
  const container = document.getElementById("catalogProductsContainer");
  if (!container) return;

  let list = window.store.products || [];

  // 1. Filtrar por género (hombre, mujer, niño)
  if (catalogCurrentGender !== "all") {
    list = list.filter(p => {
      const g = (p.gender || "").toLowerCase();
      const cat = (p.category || "").toLowerCase();
      const name = (p.name || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();

      if (catalogCurrentGender === "hombre") {
        return g === "hombre" || g === "unisex" || cat === "hombre" || name.includes("hombre") || desc.includes("hombre") || desc.includes("caballero");
      }
      if (catalogCurrentGender === "mujer") {
        return g === "mujer" || g === "unisex" || cat === "mujer" || name.includes("mujer") || name.includes("dama") || desc.includes("mujer") || desc.includes("dama");
      }
      if (catalogCurrentGender === "nino") {
        return g === "nino" || g === "unisex" || cat === "nino" || name.includes("niño") || name.includes("niña") || name.includes("infantil") || desc.includes("niño") || desc.includes("niña") || desc.includes("infantil");
      }
      return true;
    });
  }

  // 2. Filtrar por rango de precio (100-200, 300-400, 500-600)
  if (catalogCurrentPriceRange !== "all") {
    list = list.filter(p => {
      const price = Number(p.price) || 0;
      if (catalogCurrentPriceRange === "100-200") {
        return price >= 100 && price <= 250;
      }
      if (catalogCurrentPriceRange === "300-400") {
        return price >= 251 && price <= 450;
      }
      if (catalogCurrentPriceRange === "500-600") {
        return price >= 451 && price <= 650;
      }
      return true;
    });
  }

  // 3. Filtrar por categoría
  if (catalogCurrentFilter !== "all") {
    list = list.filter(p => p.category && p.category.toLowerCase() === catalogCurrentFilter.toLowerCase());
  }

  // 4. Filtrar por texto de búsqueda
  if (catalogSearchQuery) {
    const q = catalogSearchQuery.toLowerCase();
    list = list.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.colors && p.colors.some(c => c.toLowerCase().includes(q)))
    );
  }

  // Actualizar visibilidad del botón Limpiar Filtros
  const btnClear = document.getElementById("btnClearFilters");
  if (btnClear) {
    const hasActiveFilters = catalogCurrentGender !== "all" || catalogCurrentPriceRange !== "all" || catalogCurrentFilter !== "all" || catalogSearchQuery !== "";
    btnClear.style.display = hasActiveFilters ? "inline-flex" : "none";
  }

  // Actualizar contador de resultados
  const countEl = document.getElementById("catalogResultsCount");
  if (countEl) {
    countEl.textContent = `${list.length} ${list.length === 1 ? "prenda disponible" : "prendas disponibles"}`;
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: #fff; border-radius: 20px; border: 1px solid rgba(0,0,0,.06);">
        <i class="fa-solid fa-filter-circle-xmark" style="font-size: 40px; color: var(--muted); margin-bottom: 12px;"></i>
        <h3 style="font-size: 18px; margin-bottom: 6px;">No se encontraron prendas con estos filtros</h3>
        <p style="color: var(--muted); font-size: 14px; margin-bottom: 16px;">Prueba seleccionando otro rango de precio, género o limpiando los filtros.</p>
        <button type="button" class="btn-primary" onclick="resetAllFilters()" style="padding: 10px 20px; font-size: 13px;">
          <i class="fa-solid fa-rotate-left"></i> Restablecer Filtros
        </button>
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
          <img src="${img}" alt="${prod.name}" loading="lazy" decoding="async" onerror="this.src='assets/verd1.png'">
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

/* ==================================================
   MENÚS DESPLEGABLES VERTICALES DE FILTROS
================================================== */
function toggleFilterDropdown(id) {
  const current = document.getElementById(id);
  const isOpen = current && current.classList.contains("open");

  // Cerrar todos los demás menús desplegables
  document.querySelectorAll(".dropdown-filter").forEach(d => d.classList.remove("open"));

  // Alternar el actual
  if (current && !isOpen) {
    current.classList.add("open");
  }
}

// Cerrar cualquier dropdown al hacer clic fuera
document.addEventListener("click", (e) => {
  if (!e.target.closest(".dropdown-filter")) {
    document.querySelectorAll(".dropdown-filter").forEach(d => d.classList.remove("open"));
  }
});

function selectGenderOption(gender, label, btn) {
  catalogCurrentGender = gender;
  const labelEl = document.getElementById("selectedGenderText");
  if (labelEl) labelEl.innerText = label;

  const container = document.getElementById("dropdownGender");
  if (container) {
    container.querySelectorAll(".dropdown-item").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    container.classList.remove("open");
  }

  renderCatalog();
}

function selectPriceOption(priceRange, label, btn) {
  catalogCurrentPriceRange = priceRange;
  const labelEl = document.getElementById("selectedPriceText");
  if (labelEl) labelEl.innerText = label;

  const container = document.getElementById("dropdownPrice");
  if (container) {
    container.querySelectorAll(".dropdown-item").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    container.classList.remove("open");
  }

  renderCatalog();
}

function selectCategoryOption(category, label, btn) {
  catalogCurrentFilter = category;
  const labelEl = document.getElementById("selectedCategoryText");
  if (labelEl) labelEl.innerText = label;

  const container = document.getElementById("dropdownCategory");
  if (container) {
    container.querySelectorAll(".dropdown-item").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    container.classList.remove("open");
  }

  renderCatalog();
}

function filterByGender(gender, btn) {
  selectGenderOption(gender, btn ? btn.innerText.trim() : "Todos", btn);
}

function filterByPrice(range, btn) {
  selectPriceOption(range, btn ? btn.innerText.trim() : "Todos", btn);
}

function filterCatalog(category, btn) {
  selectCategoryOption(category, btn ? btn.innerText.trim() : "Todas", btn);
}

function onCatalogSearch() {
  catalogSearchQuery = document.getElementById("catalogSearchInput").value.trim();
  renderCatalog();
}

function resetAllFilters() {
  catalogCurrentGender = "all";
  catalogCurrentPriceRange = "all";
  catalogCurrentFilter = "all";
  catalogSearchQuery = "";

  const searchInput = document.getElementById("catalogSearchInput");
  if (searchInput) searchInput.value = "";

  const genderLabel = document.getElementById("selectedGenderText");
  if (genderLabel) genderLabel.innerText = "Todos";

  const priceLabel = document.getElementById("selectedPriceText");
  if (priceLabel) priceLabel.innerText = "Todos";

  const catLabel = document.getElementById("selectedCategoryText");
  if (catLabel) catLabel.innerText = "Todas";

  document.querySelectorAll(".dropdown-filter").forEach(d => {
    d.classList.remove("open");
    d.querySelectorAll(".dropdown-item").forEach((b, idx) => {
      b.classList.toggle("active", idx === 0);
    });
  });

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
    const mallValue = document.getElementById("custAddress")?.value || "Tegucigalpa";
    const spotValue = document.getElementById("custMallSpot")?.value.trim() || "";
    const fullAddress = spotValue ? `${mallValue} (Punto: ${spotValue})` : mallValue;

    const customerData = {
      name: document.getElementById("custName").value.trim(),
      phone: document.getElementById("custPhone").value.trim(),
      city: "Tegucigalpa",
      address: fullAddress,
      notes: document.getElementById("custNotes")?.value.trim() || "",
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

/* ==================================================
   8. CAMBIO DE VISTA (TIENDA VS INFORMACIÓN/ENTREGAS)
================================================== */
function switchMainView(viewName, targetSection = null) {
  const shopView = document.getElementById("view-tienda");
  const infoView = document.getElementById("view-informacion");
  if (!shopView || !infoView) return;

  const shopBtns = document.querySelectorAll(".view-switch-shop");
  const infoBtns = document.querySelectorAll(".view-switch-info");
  const menuLinks = document.querySelectorAll(".menu a");

  menuLinks.forEach(l => l.classList.remove("active"));

  if (viewName === "shop") {
    shopView.style.display = "block";
    infoView.style.display = "none";
    shopBtns.forEach(b => b.classList.add("active"));
    infoBtns.forEach(b => b.classList.remove("active"));
    document.querySelector(".menu-link-shop")?.classList.add("active");

    if (targetSection) {
      setTimeout(() => {
        const el = document.getElementById(targetSection);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } else {
    shopView.style.display = "none";
    infoView.style.display = "block";
    shopBtns.forEach(b => b.classList.remove("active"));
    infoBtns.forEach(b => b.classList.add("active"));

    if (targetSection) {
      setTimeout(() => {
        const el = document.getElementById(targetSection);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
}

