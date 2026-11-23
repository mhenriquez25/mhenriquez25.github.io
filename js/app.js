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

  // Inicializar probador virtual interactivo en modelo
  initTryLook();

  // 5. Escuchar cambios de productos en tiempo real
  window.store.listenToProducts(() => {
    renderCatalog();
    renderTryLook();
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
    if (p !== undefined) p.catch(() => { });
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
  } catch (e) { }

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
   EXPERIENCIA 2026: TRY THE LOOK (CARRUSEL 3D EN PASARELA)
================================================== */
let tryLookCurrentGender = "mujer";
let tryLookActiveIndex = 0;
let tryLookColor = "";
let tryLookSize = "M";
let tryLookQty = 1;
let tryLookTouchStartX = 0;

const COLOR_HEX_MAP = {
  "negro": "#171512",
  "blanco": "#ffffff",
  "naranja": "#f97316",
  "vino": "#7f1d1d",
  "burdeos": "#7f1d1d",
  "verde": "#166534",
  "verde oliva": "#4d7c0f",
  "azul": "#1d4ed8",
  "azul marino": "#1e3a8a",
  "gris": "#9ca3af",
  "rosa": "#f472b6",
  "amarillo": "#eab308",
  "mostaza": "#ca8a04",
  "rojo": "#dc2626",
  "estampado": "#c084fc",
  "casual": "#a855f7"
};

function getTryLookProducts(gender) {
  const all = window.store.products || [];
  return all.filter(p => {
    const g = (p.gender || "").toLowerCase();
    const cat = (p.category || "").toLowerCase();
    const name = (p.name || "").toLowerCase();
    const desc = (p.description || "").toLowerCase();

    if (gender === "mujer") {
      return g === "mujer" || g === "unisex" || cat === "mujer" || name.includes("mujer") || name.includes("dama") || desc.includes("mujer") || desc.includes("dama");
    } else {
      return g === "hombre" || g === "unisex" || cat === "hombre" || name.includes("hombre") || desc.includes("hombre") || desc.includes("caballero");
    }
  });
}

function initTryLook() {
  const track = document.getElementById("runwayTrack");
  if (!track) return;

  // Swipe táctil para teléfonos
  const stage = document.getElementById("runwayStage");
  if (stage) {
    stage.addEventListener("touchstart", (e) => {
      tryLookTouchStartX = e.touches[0].clientX;
    }, { passive: true });

    stage.addEventListener("touchend", (e) => {
      const diffX = e.changedTouches[0].clientX - tryLookTouchStartX;
      if (diffX > 45) {
        prevTryLook();
      } else if (diffX < -45) {
        nextTryLook();
      }
    }, { passive: true });
  }

  // Teclado (flechas izquierda / derecha)
  window.addEventListener("keydown", (e) => {
    const activeView = document.getElementById("view-catalogo");
    if (!activeView || activeView.classList.contains("active-view")) {
      if (e.key === "ArrowLeft") prevTryLook();
      if (e.key === "ArrowRight") nextTryLook();
    }
  });

  setTryLookGender(tryLookCurrentGender);
}

function setTryLookGender(gender) {
  tryLookCurrentGender = gender;
  tryLookActiveIndex = 0;
  tryLookQty = 1;

  // Actualizar botones de género
  const pillMujer = document.getElementById("pillGenderMujer");
  const pillHombre = document.getElementById("pillGenderHombre");
  if (pillMujer) pillMujer.classList.toggle("active", gender === "mujer");
  if (pillHombre) pillHombre.classList.toggle("active", gender === "hombre");

  // Sincronizar catálogo inferior
  catalogCurrentGender = gender;
  const labelEl = document.getElementById("selectedGenderText");
  if (labelEl) labelEl.innerText = gender === "mujer" ? "Mujer" : "Hombre";
  
  const container = document.getElementById("dropdownGender");
  if (container) {
    container.querySelectorAll(".dropdown-item").forEach(b => {
      b.classList.toggle("active", b.getAttribute("data-gender") === gender);
    });
  }

  renderTryLook();
  renderCatalog();
}


function generateFullBodyModelSVG(product, gender, isCenter, activeColor) {
  const isWoman = gender === "mujer";
  const defaultCol = (product.colors && product.colors[0]) || (isWoman ? "Naranja" : "Negro");
  const colorName = (isCenter && activeColor) ? activeColor : defaultCol;
  const shirtHex = COLOR_HEX_MAP[colorName.toLowerCase().trim()] || "#171512";
  const isWhite = shirtHex.toLowerCase() === "#ffffff" || shirtHex.toLowerCase() === "#f8f9fa";
  const imgUrl = product.image || (isWoman ? "assets/cat.jpg" : "assets/verd1.png");
  const uid = `${product.id || 'p'}-${gender}-${isCenter ? 'ctr' : 'side'}-${Math.floor(Math.random()*10000)}`;

  if (isWoman) {
    return `
    <svg class="full-body-model-svg" viewBox="0 0 260 520" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Clip path para que el estampado DTF no se salga del torso -->
        <clipPath id="torsoClip-${uid}">
          <path d="M 108 102 Q 130 114 152 102 L 180 114 L 198 172 L 174 182 L 166 168 L 166 250 Q 130 256 94 250 L 94 168 L 86 182 L 62 172 L 80 114 Z" />
        </clipPath>
        <!-- Gradiente de sombra del tejido -->
        <linearGradient id="fabricShade-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="${isWhite ? '0.35' : '0.18'}" />
          <stop offset="50%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="${isWhite ? '0.12' : '0.32'}" />
        </linearGradient>
      </defs>

      <!-- CABELLO TRASERO Y CUELLO DE MUJER -->
      <path d="M 112 52 C 105 75 106 100 110 115 C 114 116 117 114 117 108 C 117 85 119 65 125 52 Z" fill="#241a15"/>
      <path d="M 148 52 C 155 75 154 100 150 115 C 146 116 143 114 143 108 C 143 85 141 65 135 52 Z" fill="#241a15"/>

      <!-- Cuello -->
      <path d="M 122 80 L 122 104 Q 130 108 138 104 L 138 80 Z" fill="#d89f77"/>
      <path d="M 122 80 Q 130 89 138 80 L 138 86 Q 130 94 122 86 Z" fill="rgba(0,0,0,0.08)"/>

      <!-- Cabeza / Rostro -->
      <ellipse cx="130" cy="56" rx="16" ry="21" fill="#e5ad85"/>

      <!-- Cabello frontal peinado chic (look moderno 2026) -->
      <path d="M 114 54 C 114 36 122 30 130 30 C 138 30 146 36 146 54 C 146 45 140 40 130 40 C 120 40 114 45 114 54 Z" fill="#2b1e17"/>
      <ellipse cx="130" cy="27" rx="10" ry="7" fill="#2b1e17"/>

      <!-- Gafas de sol negras chic (estilo cat-eye) -->
      <path d="M 117 52 Q 123 48 128 52 L 127 58 Q 121 60 117 56 Z" fill="#141414"/>
      <path d="M 132 52 Q 137 48 143 52 L 143 56 Q 139 60 133 58 Z" fill="#141414"/>
      <line x1="128" y1="53" x2="132" y2="53" stroke="#141414" stroke-width="1.5"/>
      <line x1="119" y1="52" x2="124" y2="50" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>
      <line x1="134" y1="52" x2="139" y2="50" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>

      <!-- Aretes dorados -->
      <circle cx="113" cy="62" r="3" stroke="#eab308" stroke-width="1.2" fill="none"/>
      <circle cx="147" cy="62" r="3" stroke="#eab308" stroke-width="1.2" fill="none"/>

      <!-- BRAZOS Y MANOS -->
      <path d="M 72 172 L 64 245 C 63 252 64 265 67 274 C 70 277 73 277 74 272 L 78 245 L 82 176 Z" fill="#d89f77"/>
      <path d="M 188 172 L 196 245 C 197 252 196 265 193 274 C 190 277 187 277 186 272 L 182 245 L 178 176 Z" fill="#d89f77"/>

      <!-- PANTALONES BAGGY STREETWEAR DE MUJER (DENIM AZUL CLARO RELAJADO 2026) -->
      <g>
        <path d="M 94 246 L 82 320 L 76 452 Q 98 456 122 452 L 126 330 L 128 270 Z" fill="#7ba0c0"/>
        <path d="M 166 246 L 178 320 L 184 452 Q 162 456 138 452 L 134 330 L 132 270 Z" fill="#84a7c8"/>
        <path d="M 94 246 Q 130 252 166 246 L 166 272 Q 130 278 94 272 Z" fill="#6f93b5"/>
        <line x1="130" y1="248" x2="130" y2="295" stroke="#527494" stroke-width="1.8"/>

        <!-- Costuras y pliegues 3D -->
        <path d="M 80 370 Q 98 382 120 375" stroke="#5e82a5" stroke-width="1.5" fill="none" opacity="0.7"/>
        <path d="M 78 415 Q 98 428 122 420" stroke="#5e82a5" stroke-width="1.5" fill="none" opacity="0.7"/>
        <path d="M 140 375 Q 162 382 180 370" stroke="#5e82a5" stroke-width="1.5" fill="none" opacity="0.7"/>
        <path d="M 138 420 Q 162 428 182 415" stroke="#5e82a5" stroke-width="1.5" fill="none" opacity="0.7"/>
        <path d="M 74 448 Q 98 458 124 448 L 123 454 Q 98 463 75 454 Z" fill="#587a9c"/>
        <path d="M 136 448 Q 162 458 186 448 L 185 454 Q 162 463 137 454 Z" fill="#587a9c"/>
      </g>

      <!-- SNEAKERS URBANAS BLANCAS -->
      <path d="M 80 452 L 72 470 C 70 478 74 484 84 484 L 118 484 C 124 484 126 478 124 470 L 118 452 Z" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <path d="M 72 474 L 124 474 L 122 484 L 74 484 Z" fill="#e2e8f0"/>
      <line x1="88" y1="462" x2="108" y2="462" stroke="#cbd5e1" stroke-width="1.5"/>

      <path d="M 142 452 L 136 470 C 134 478 136 484 146 484 L 180 484 C 188 484 190 478 188 470 L 180 452 Z" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
      <path d="M 136 474 L 188 474 L 186 484 L 138 484 Z" fill="#e2e8f0"/>
      <line x1="152" y1="462" x2="172" y2="462" stroke="#cbd5e1" stroke-width="1.5"/>

      <!-- CAMISA / CAMISETA DE LA MODELO -->
      <g>
        <path class="runway-model-shirt-fill" id="runwayShirt-${uid}"
          d="M 108 102 Q 130 114 152 102 L 180 114 L 198 172 L 174 182 L 166 168 L 166 250 Q 130 256 94 250 L 94 168 L 86 182 L 62 172 L 80 114 Z"
          fill="${shirtHex}"
          style="transition: fill 0.35s ease;"
        />
        <path d="M 108 102 Q 130 115 152 102 Q 130 119 108 102" fill="rgba(0,0,0,${isWhite ? '0.1' : '0.25'})"/>

        <!-- ESTAMPADO DTF DE LA PRENDA EN EL PECHO -->
        <g clip-path="url(#torsoClip-${uid})">
          <image class="runway-model-graphic" href="${imgUrl}" x="95" y="125" width="70" height="85" preserveAspectRatio="xMidYMid contain" />
        </g>

        <!-- Sombra realista de tejido -->
        <path d="M 108 102 Q 130 114 152 102 L 180 114 L 198 172 L 174 182 L 166 168 L 166 250 Q 130 256 94 250 L 94 168 L 86 182 L 62 172 L 80 114 Z"
          fill="url(#fabricShade-${uid})"
          pointer-events="none"
        />

        <path d="M 94 168 Q 112 185 130 180" stroke="rgba(0,0,0,${isWhite ? '0.12' : '0.25'})" stroke-width="1.2" fill="none"/>
        <path d="M 166 168 Q 148 185 130 180" stroke="rgba(0,0,0,${isWhite ? '0.12' : '0.25'})" stroke-width="1.2" fill="none"/>
      </g>
    </svg>
    `;
  } else {
    // MODELO HOMBRE STREETWEAR 2026 (FIGURA HUMANA COMPLETA)
    return `
    <svg class="full-body-model-svg" viewBox="0 0 260 520" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="torsoClip-${uid}">
          <path d="M 106 96 Q 130 112 154 96 L 186 106 L 210 174 L 182 186 L 174 172 L 178 258 Q 130 264 82 258 L 86 172 L 78 186 L 50 174 L 74 106 Z" />
        </clipPath>
        <linearGradient id="fabricShade-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="${isWhite ? '0.35' : '0.16'}" />
          <stop offset="45%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="${isWhite ? '0.14' : '0.35'}" />
        </linearGradient>
      </defs>

      <!-- CUELLO Y CABEZA -->
      <path d="M 118 78 L 118 102 Q 130 108 142 102 L 142 78 Z" fill="#9e6945"/>
      <path d="M 118 78 Q 130 88 142 78 L 142 84 Q 130 94 118 84 Z" fill="rgba(0,0,0,0.12)"/>

      <ellipse cx="130" cy="54" rx="18" ry="23" fill="#b37c54"/>
      <path d="M 112 50 C 112 32 120 26 130 26 C 140 26 148 32 148 50 C 148 42 144 34 130 34 C 116 34 112 42 112 50 Z" fill="#1b1614"/>
      <ellipse cx="111" cy="56" rx="3.5" ry="6" fill="#a46f48"/>
      <ellipse cx="149" cy="56" rx="3.5" ry="6" fill="#a46f48"/>

      <!-- Gafas de sol negras rectangulares -->
      <rect x="114" y="48" width="14" height="9" rx="2" fill="#111111"/>
      <rect x="132" y="48" width="14" height="9" rx="2" fill="#111111"/>
      <line x1="127" y1="51" x2="133" y2="51" stroke="#111111" stroke-width="2"/>
      <line x1="116" y1="50" x2="122" y2="48" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>
      <line x1="134" y1="50" x2="140" y2="48" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>

      <!-- Cadena de oro/plata sutil -->
      <path d="M 122 92 Q 130 108 138 92" stroke="#d4af37" stroke-width="1.8" fill="none" opacity="0.9"/>

      <!-- BRAZOS Y MANOS -->
      <path d="M 60 176 L 54 252 C 53 260 55 272 58 280 C 62 284 66 284 68 278 L 74 252 L 80 180 Z" fill="#9e6945"/>
      <path d="M 200 176 L 206 252 C 207 260 205 272 202 280 C 198 284 194 284 192 278 L 186 252 L 180 180 Z" fill="#9e6945"/>

      <!-- PANTALONES BAGGY DENIM (ESTILO STREETWEAR 2026) -->
      <g>
        <path d="M 82 254 L 68 335 L 62 454 Q 92 460 124 454 L 128 340 L 130 274 Z" fill="#759bbd"/>
        <path d="M 178 254 L 192 335 L 198 454 Q 168 460 136 454 L 132 340 L 130 274 Z" fill="#7eA3c6"/>
        <path d="M 82 254 Q 130 262 178 254 L 178 280 Q 130 286 82 280 Z" fill="#678dae"/>
        <line x1="130" y1="258" x2="130" y2="305" stroke="#486e8f" stroke-width="2"/>

        <path d="M 86 264 Q 106 270 102 288" stroke="#527899" stroke-width="1.5" fill="none"/>
        <path d="M 174 264 Q 154 270 158 288" stroke="#527899" stroke-width="1.5" fill="none"/>

        <path d="M 66 385 Q 92 398 122 390" stroke="#567c9d" stroke-width="1.8" fill="none" opacity="0.75"/>
        <path d="M 64 425 Q 92 438 124 430" stroke="#567c9d" stroke-width="1.8" fill="none" opacity="0.75"/>
        <path d="M 138 390 Q 168 398 194 385" stroke="#567c9d" stroke-width="1.8" fill="none" opacity="0.75"/>
        <path d="M 136 430 Q 168 438 196 425" stroke="#567c9d" stroke-width="1.8" fill="none" opacity="0.75"/>

        <path d="M 60 450 Q 92 462 126 450 L 125 456 Q 92 468 61 456 Z" fill="#4d7394"/>
        <path d="M 134 450 Q 168 462 200 450 L 199 456 Q 168 468 135 456 Z" fill="#4d7394"/>
      </g>

      <!-- SNEAKERS URBANAS BLANCAS -->
      <path d="M 68 452 L 58 472 C 56 480 60 486 72 486 L 118 486 C 126 486 128 480 126 472 L 120 452 Z" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.2"/>
      <path d="M 58 476 L 126 476 L 124 486 L 60 486 Z" fill="#e2e8f0"/>
      <line x1="76" y1="464" x2="106" y2="464" stroke="#cbd5e1" stroke-width="1.8"/>

      <path d="M 140 452 L 134 472 C 132 480 134 486 146 486 L 192 486 C 202 486 204 480 202 472 L 192 452 Z" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.2"/>
      <path d="M 134 476 L 202 476 L 200 486 L 136 486 Z" fill="#e2e8f0"/>
      <line x1="154" y1="464" x2="184" y2="464" stroke="#cbd5e1" stroke-width="1.8"/>

      <!-- CAMISETA OVERSIZED BOXY STREETWEAR (COLOR DINÁMICO + ESTAMPADO DTF) -->
      <g>
        <path class="runway-model-shirt-fill" id="runwayShirt-${uid}"
          d="M 106 96 Q 130 112 154 96 L 186 106 L 210 174 L 182 186 L 174 172 L 178 258 Q 130 264 82 258 L 86 172 L 78 186 L 50 174 L 74 106 Z"
          fill="${shirtHex}"
          style="transition: fill 0.35s ease;"
        />
        <path d="M 106 96 Q 130 112 154 96 Q 130 117 106 96" fill="rgba(0,0,0,${isWhite ? '0.1' : '0.28'})"/>

        <!-- ESTAMPADO DTF EN EL PECHO -->
        <g clip-path="url(#torsoClip-${uid})">
          <image class="runway-model-graphic" href="${imgUrl}" x="88" y="122" width="84" height="92" preserveAspectRatio="xMidYMid contain" />
        </g>

        <!-- Sombra realista de tejido -->
        <path d="M 106 96 Q 130 112 154 96 L 186 106 L 210 174 L 182 186 L 174 172 L 178 258 Q 130 264 82 258 L 86 172 L 78 186 L 50 174 L 74 106 Z"
          fill="url(#fabricShade-${uid})"
          pointer-events="none"
        />

        <path d="M 86 172 Q 108 190 130 184" stroke="rgba(0,0,0,${isWhite ? '0.12' : '0.28'})" stroke-width="1.4" fill="none"/>
        <path d="M 174 172 Q 152 190 130 184" stroke="rgba(0,0,0,${isWhite ? '0.12' : '0.28'})" stroke-width="1.4" fill="none"/>
        <path d="M 82 252 Q 130 258 178 252" stroke="rgba(0,0,0,${isWhite ? '0.1' : '0.2'})" stroke-width="1.2" fill="none"/>
      </g>
    </svg>
    `;
  }
}

function renderTryLook() {
  const track = document.getElementById("runwayTrack");
  if (!track) return;

  const products = getTryLookProducts(tryLookCurrentGender);
  if (products.length === 0) {
    track.innerHTML = '<p style="color: var(--muted); font-size: 14px;">No hay looks disponibles en esta categoría.</p>';
    return;
  }

  if (tryLookActiveIndex >= products.length) {
    tryLookActiveIndex = 0;
  }

  // Generar tarjetas de modelos con figuras humanas completas en pasarela 3D
  track.innerHTML = products.map((p, idx) => {
    const isCenter = idx === tryLookActiveIndex;
    const cardColor = isCenter ? tryLookColor : ((p.colors && p.colors[0]) || (tryLookCurrentGender === "mujer" ? "Naranja" : "Negro"));
    return `
      <div class="runway-model-card" data-index="${idx}" onclick="goToLookIndex(${idx})" title="Ver look: ${p.name}">
        <span class="runway-active-badge"><i class="fa-solid fa-sparkles"></i> ${p.name}</span>
        <div class="runway-model-img-wrap">
          ${generateFullBodyModelSVG(p, tryLookCurrentGender, isCenter, cardColor)}
        </div>
        <div class="runway-model-shadow"></div>
      </div>
    `;
  }).join("");

  updateRunwayPositions();
  updateLookSidebar(products[tryLookActiveIndex]);
}

function updateRunwayPositions() {
  const cards = document.querySelectorAll(".runway-model-card");
  const total = cards.length;
  if (!total) return;

  cards.forEach((card, idx) => {
    const diff = idx - tryLookActiveIndex;
    card.className = "runway-model-card";

    if (diff === 0) {
      card.classList.add("active-look");
    } else if (diff === -1) {
      card.classList.add("pos-left-1");
    } else if (diff === 1) {
      card.classList.add("pos-right-1");
    } else if (diff === -2) {
      card.classList.add("pos-left-2");
    } else if (diff === 2) {
      card.classList.add("pos-right-2");
    } else {
      card.classList.add("pos-hidden");
    }
  });

  // Actualizar barra de progreso y contador
  const fill = document.getElementById("runwayProgressFill");
  if (fill) {
    const pct = ((tryLookActiveIndex + 1) / total) * 100;
    fill.style.width = `${pct}%`;
  }

  const counter = document.getElementById("runwayCounterText");
  if (counter) {
    const cur = String(tryLookActiveIndex + 1).padStart(2, "0");
    const tot = String(total).padStart(2, "0");
    counter.innerText = `${cur} / ${tot}`;
  }
}

function goToLookIndex(idx) {
  const products = getTryLookProducts(tryLookCurrentGender);
  if (idx < 0 || idx >= products.length) return;

  tryLookActiveIndex = idx;
  tryLookQty = 1;
  const p = products[tryLookActiveIndex];
  if (p && p.colors && p.colors.length) {
    tryLookColor = p.colors[0];
  }
  updateRunwayPositions();
  updateLookSidebar(products[tryLookActiveIndex]);

  // Sincronizar color de la camisa en el modelo central
  const activeCard = document.querySelector(".runway-model-card.active-look");
  if (activeCard) {
    const shirt = activeCard.querySelector(".runway-model-shirt-fill");
    const hex = COLOR_HEX_MAP[tryLookColor.toLowerCase().trim()] || "#171512";
    if (shirt) shirt.setAttribute("fill", hex);
  }
}

function prevTryLook() {
  const products = getTryLookProducts(tryLookCurrentGender);
  if (tryLookActiveIndex > 0) {
    goToLookIndex(tryLookActiveIndex - 1);
  } else {
    goToLookIndex(products.length - 1); // Loop circular
  }
}

function nextTryLook() {
  const products = getTryLookProducts(tryLookCurrentGender);
  if (tryLookActiveIndex < products.length - 1) {
    goToLookIndex(tryLookActiveIndex + 1);
  } else {
    goToLookIndex(0); // Loop circular
  }
}

function updateLookSidebar(p) {
  if (!p) return;

  const currency = (window.store.settings && window.store.settings.currency) || "L.";
  const price = Number(p.price) || 0;
  const oldPrice = p.originalPrice ? Number(p.originalPrice) : null;

  // Actualizar colores y tallas predeterminados
  tryLookColor = (p.colors && p.colors[0]) || "Negro";
  tryLookSize = (p.sizes && p.sizes[0]) || "M";

  // Textos y precios
  const title = document.getElementById("lookProductTitle");
  const cat = document.getElementById("lookProductCat");
  const priceEl = document.getElementById("lookProductPrice");
  const oldPriceEl = document.getElementById("lookProductOldPrice");
  const thumb = document.getElementById("lookProductImg");

  if (title) title.innerText = p.name;
  if (cat) cat.innerText = `${p.category || 'Casual'} · ${tryLookCurrentGender === "mujer" ? "Dama" : "Caballero"}`;
  if (priceEl) priceEl.innerText = `${currency} ${price.toFixed(2)}`;
  if (oldPriceEl) {
    oldPriceEl.innerText = oldPrice ? `${currency} ${oldPrice.toFixed(2)}` : "";
    oldPriceEl.style.display = oldPrice ? "inline" : "none";
  }
  if (thumb) {
    thumb.src = p.image || (tryLookCurrentGender === "mujer" ? "assets/cat.jpg" : "assets/verd1.png");
  }

  // Selector de Color
  const colorContainer = document.getElementById("lookColorSwatches");
  const colorLabel = document.getElementById("lookSelectedColorLabel");
  if (colorLabel) colorLabel.innerText = tryLookColor;

  if (colorContainer) {
    const colors = (p.colors && p.colors.length) ? p.colors : ["Negro", "Blanco"];
    colorContainer.innerHTML = colors.map(c => {
      const hex = COLOR_HEX_MAP[c.toLowerCase().trim()] || "#333333";
      const isActive = c.toLowerCase() === tryLookColor.toLowerCase();
      return `
        <button type="button" class="look-color-chip ${isActive ? 'active' : ''}" onclick="selectLookColor('${c}')">
          <span class="look-color-dot" style="background-color: ${hex}; ${hex === '#ffffff' ? 'border-color: #bbb;' : ''}"></span>
          <span>${c}</span>
        </button>
      `;
    }).join("");
  }

  // Selector de Talla
  const sizeContainer = document.getElementById("lookSizePills");
  const sizeLabel = document.getElementById("lookSelectedSizeLabel");
  if (sizeLabel) sizeLabel.innerText = tryLookSize;

  if (sizeContainer) {
    const sizes = (p.sizes && p.sizes.length) ? p.sizes : ["S", "M", "L", "XL"];
    sizeContainer.innerHTML = sizes.map(s => {
      const isActive = s === tryLookSize;
      return `
        <button type="button" class="look-size-btn ${isActive ? 'active' : ''}" onclick="selectLookSize('${s}')">
          ${s}
        </button>
      `;
    }).join("");
  }

  // Cantidad y total
  const qtyVal = document.getElementById("lookQtyVal");
  if (qtyVal) qtyVal.innerText = tryLookQty;

  const totalVal = document.getElementById("lookTotalVal");
  if (totalVal) {
    totalVal.innerText = `${currency} ${(price * tryLookQty).toFixed(2)}`;
  }
}

function selectLookColor(c) {
  tryLookColor = c;
  const colorLabel = document.getElementById("lookSelectedColorLabel");
  if (colorLabel) colorLabel.innerText = c;

  document.querySelectorAll(".look-color-chip").forEach(el => {
    el.classList.toggle("active", el.innerText.trim() === c);
  });

  // Cambiar el color de la camisa en la persona central en vivo
  const activeCard = document.querySelector(".runway-model-card.active-look");
  if (activeCard) {
    const shirt = activeCard.querySelector(".runway-model-shirt-fill");
    const hex = COLOR_HEX_MAP[c.toLowerCase().trim()] || "#171512";
    if (shirt) shirt.setAttribute("fill", hex);
  }
}

function selectLookSize(s) {
  tryLookSize = s;
  const sizeLabel = document.getElementById("lookSelectedSizeLabel");
  if (sizeLabel) sizeLabel.innerText = s;

  document.querySelectorAll(".look-size-btn").forEach(el => {
    el.classList.toggle("active", el.innerText.trim() === s);
  });
}

function changeLookQty(delta) {
  const newQty = tryLookQty + delta;
  if (newQty >= 1 && newQty <= 20) {
    tryLookQty = newQty;
    const qtyVal = document.getElementById("lookQtyVal");
    if (qtyVal) qtyVal.innerText = tryLookQty;

    const products = getTryLookProducts(tryLookCurrentGender);
    const p = products[tryLookActiveIndex];
    if (p) {
      const currency = (window.store.settings && window.store.settings.currency) || "L.";
      const price = Number(p.price) || 0;
      const totalVal = document.getElementById("lookTotalVal");
      if (totalVal) totalVal.innerText = `${currency} ${(price * tryLookQty).toFixed(2)}`;
    }
  }
}

function addCurrentLookToCart(buyNow = false) {
  const products = getTryLookProducts(tryLookCurrentGender);
  const p = products[tryLookActiveIndex];
  if (!p) return;

  window.store.addToCart({
    productId: p.id,
    name: p.name,
    price: Number(p.price) || 0,
    image: p.image || (tryLookCurrentGender === "mujer" ? "assets/cat.jpg" : "assets/verd1.png"),
    size: tryLookSize,
    color: tryLookColor,
    quantity: tryLookQty
  });

  updateCartUI();

  if (buyNow) {
    openCheckout();
  } else {
    openCart();
  }
}

function consultLookOnWhatsApp() {
  const products = getTryLookProducts(tryLookCurrentGender);
  const p = products[tryLookActiveIndex];
  if (!p) return;

  const phone = (window.store.settings && window.store.settings.whatsappNumber) || "50400000000";
  const currency = (window.store.settings && window.store.settings.currency) || "L.";
  const cleanPhone = phone.replace(/[^0-9]/g, "");

  const msg = `¡Hola! Me encantó este estilo de su pasarela 'Try the Look':\n\n👕 *${p.name}*\n🎨 *Color:* ${tryLookColor}\n📏 *Talla:* ${tryLookSize}\n🔢 *Cantidad:* ${tryLookQty}\n💰 *Precio:* ${currency} ${(Number(p.price) * tryLookQty).toFixed(2)}\n\n¿Tienen disponibilidad para coordinar la entrega?`;

  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank");
}

function tryProductInFittingRoom(prodId) {
  const all = window.store.products || [];
  const p = all.find(it => it.id === prodId);
  if (!p) return;

  const g = (p.gender || "").toLowerCase();
  const cat = (p.category || "").toLowerCase();
  const isWoman = g === "mujer" || cat === "mujer" || p.name.toLowerCase().includes("dama") || p.name.toLowerCase().includes("mujer");

  const targetGender = isWoman ? "mujer" : "hombre";
  if (tryLookCurrentGender !== targetGender) {
    setTryLookGender(targetGender);
  }

  const products = getTryLookProducts(targetGender);
  const idx = products.findIndex(it => it.id === prodId);
  if (idx !== -1) {
    goToLookIndex(idx);
  }

  const section = document.getElementById("tryTheLookSection");
  if (section) {
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
            <button class="btn-view-card" onclick="tryProductInFittingRoom('${prod.id}')" title="Probar en el Modelo" style="color: var(--wine);">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
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
          const mallValue = document.getElementById("custAddress")?.value || "Acordar por WhatsApp";
          const spotValue = document.getElementById("custMallSpot")?.value.trim() || "";
          const fullAddress = spotValue ? `${mallValue} (Referencia: ${spotValue})` : mallValue;

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

