/**
 * Moda Casual - Lógica del Panel de Administración (admin.js)
 */

let activeTab = "products";
let editingProductId = null;
let currentImageBase64 = "";

// VERIFICACIÓN DE SESIÓN AL CARGAR
document.addEventListener("DOMContentLoaded", async () => {
  if (sessionStorage.getItem("mc_admin_authenticated") === "true") {
    unlockPanel();
  }
  updateDbStatusDisplay();
});

function verifyPin() {
  const pin = document.getElementById("pinInput").value;
  const settings = window.store.settings;

  if (pin === settings.adminPin || pin === "1234") {
    sessionStorage.setItem("mc_admin_authenticated", "true");
    unlockPanel();
  } else {
    const err = document.getElementById("loginError");
    err.style.display = "block";
    document.getElementById("pinInput").value = "";
  }
}

function unlockPanel() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("adminApp").style.display = "block";
  document.getElementById("logoutBtn").style.display = "inline-flex";

  // Cargar productos y settings
  initAdminData();
}

function logout() {
  sessionStorage.removeItem("mc_admin_authenticated");
  location.reload();
}

function switchTab(tabName, btn) {
  activeTab = tabName;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  if (btn) {
    btn.classList.add("active");
  } else if (event && event.currentTarget) {
    event.currentTarget.classList.add("active");
  }

  document.getElementById("tab-products").style.display = tabName === "products" ? "block" : "none";
  document.getElementById("tab-orders").style.display = tabName === "orders" ? "block" : "none";
  document.getElementById("tab-database").style.display = tabName === "database" ? "block" : "none";
  document.getElementById("tab-settings").style.display = tabName === "settings" ? "block" : "none";

  if (tabName === "orders") renderOrdersList();
  if (tabName === "database") fillFirebaseForm();
  if (tabName === "settings") fillSettingsForm();
}

async function initAdminData() {
  await window.store.loadInitialProducts();
  window.store.listenToProducts(() => {
    renderProductsList();
    updateDbStatusDisplay();
  });
  renderOrdersList();
  fillSettingsForm();
}

function updateDbStatusDisplay() {
  const badge = document.getElementById("dbStatusBadge");
  const dot = badge.querySelector(".db-dot");
  const text = document.getElementById("dbStatusText");

  if (window.store.isFirebaseReady) {
    dot.classList.add("connected");
    text.innerText = "Base de datos en la nube (Conectado)";
  } else {
    dot.classList.remove("connected");
    text.innerText = "Almacenamiento Local (Conectar nube)";
  }
}

/* ==================================================
   RENDER DE PRODUCTOS EN ADMIN
================================================== */
function renderProductsList() {
  const container = document.getElementById("adminProductsContainer");
  const searchTerm = (document.getElementById("productSearchInput")?.value || "").toLowerCase();
  let list = window.store.products || [];

  document.getElementById("totalProductsCount").innerText = list.length;

  if (searchTerm) {
    list = list.filter(p => 
      (p.name && p.name.toLowerCase().includes(searchTerm)) ||
      (p.category && p.category.toLowerCase().includes(searchTerm))
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: #fff; border-radius: 16px; border: 1px solid var(--border);">
        <i class="fa-solid fa-shirt" style="font-size: 40px; color: var(--muted); margin-bottom: 12px;"></i>
        <h3>No se encontraron productos</h3>
        <p style="color: var(--muted); margin-top: 6px;">Usa el botón "+ Nuevo Producto" para agregar el primero.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(prod => `
    <article class="admin-prod-card">
      <div class="admin-prod-img-box">
        <img src="${prod.image || 'assets/logo.png'}" alt="${prod.name}" onerror="this.src='assets/logo.png'">
        ${prod.badge ? `<span class="admin-badge">${prod.badge}</span>` : ""}
        <span class="admin-stock-status">${prod.inStock ? "✅ En Stock" : "❌ Agotado"}</span>
      </div>

      <div class="admin-prod-content">
        <span class="admin-prod-cat">${prod.category || "General"}</span>
        <h4 class="admin-prod-title">${prod.name}</h4>
        
        <div class="admin-prod-price">
          L. ${Number(prod.price).toFixed(2)}
          ${prod.originalPrice ? `<span class="old">L. ${Number(prod.originalPrice).toFixed(2)}</span>` : ""}
        </div>

        <div class="admin-prod-meta">
          <strong>Tallas:</strong> ${(prod.sizes || []).join(", ") || "Todas"}<br>
          <strong>Colores:</strong> ${(prod.colors || []).join(", ") || "Varios"}
        </div>

        <div class="admin-card-actions">
          <button class="btn-edit" onclick="editProduct('${prod.id}')">
            <i class="fa-solid fa-pen-to-square"></i> Editar
          </button>
          <button class="btn-del" onclick="deleteProductPrompt('${prod.id}', '${encodeURIComponent(prod.name)}')" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    </article>
  `).join("");
}

/* ==================================================
   MODAL DE PRODUCTO (NUEVO / EDITAR)
================================================== */
function openProductModal(prod = null) {
  editingProductId = prod ? prod.id : null;
  document.getElementById("modalTitle").innerText = prod ? "Editar Producto" : "Nuevo Producto";
  document.getElementById("prodId").value = prod ? prod.id : "";
  document.getElementById("prodName").value = prod ? prod.name : "";
  document.getElementById("prodPrice").value = prod ? prod.price : "";
  document.getElementById("prodOriginalPrice").value = prod && prod.originalPrice ? prod.originalPrice : "";
  document.getElementById("prodCategory").value = prod ? prod.category : "cristiana";
  document.getElementById("prodBadge").value = prod && prod.badge ? prod.badge : "";
  document.getElementById("prodImageUrl").value = prod ? prod.image : "";
  document.getElementById("prodColors").value = prod && prod.colors ? prod.colors.join(", ") : "Negro, Blanco";
  document.getElementById("prodDesc").value = prod && prod.description ? prod.description : "";
  document.getElementById("prodStock").value = prod && prod.inStock === false ? "false" : "true";

  // Vista previa de imagen
  const previewBox = document.getElementById("imagePreviewBox");
  const previewImg = document.getElementById("imagePreviewImg");
  if (prod && prod.image) {
    previewImg.src = prod.image;
    previewBox.style.display = "block";
    currentImageBase64 = prod.image;
  } else {
    previewBox.style.display = "none";
    currentImageBase64 = "";
  }

  // Tallas
  const selectedSizes = prod && prod.sizes ? prod.sizes : ["S", "M", "L", "XL"];
  document.querySelectorAll("#sizesGroup input").forEach(input => {
    input.checked = selectedSizes.includes(input.value);
  });

  document.getElementById("productModal").classList.add("open");
}

function closeProductModal() {
  document.getElementById("productModal").classList.remove("open");
  editingProductId = null;
  currentImageBase64 = "";
}

// Subida de imagen comprimida en Base64
async function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const compressedBase64 = await StoreManager.compressImage(file, 900, 0.82);
    currentImageBase64 = compressedBase64;
    document.getElementById("prodImageUrl").value = "";
    const previewBox = document.getElementById("imagePreviewBox");
    const previewImg = document.getElementById("imagePreviewImg");
    previewImg.src = compressedBase64;
    previewBox.style.display = "block";
  } catch (err) {
    alert("No se pudo procesar la imagen: " + err.message);
  }
}

// Al escribir URL de imagen manual
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("prodImageUrl")?.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    const previewBox = document.getElementById("imagePreviewBox");
    const previewImg = document.getElementById("imagePreviewImg");
    if (val) {
      previewImg.src = val;
      previewBox.style.display = "block";
      currentImageBase64 = val;
    }
  });
});

async function handleProductSubmit(e) {
  e.preventDefault();
  const saveBtn = document.getElementById("saveProdBtn");
  saveBtn.disabled = true;
  saveBtn.innerText = "Guardando...";

  try {
    const sizes = [];
    document.querySelectorAll("#sizesGroup input:checked").forEach(cb => sizes.push(cb.value));

    const colorsRaw = document.getElementById("prodColors").value;
    const colors = colorsRaw ? colorsRaw.split(",").map(c => c.trim()).filter(Boolean) : ["Único"];

    const img = currentImageBase64 || document.getElementById("prodImageUrl").value || "assets/logo.png";

    const productData = {
      id: editingProductId,
      name: document.getElementById("prodName").value.trim(),
      price: parseFloat(document.getElementById("prodPrice").value),
      originalPrice: document.getElementById("prodOriginalPrice").value ? parseFloat(document.getElementById("prodOriginalPrice").value) : null,
      category: document.getElementById("prodCategory").value,
      badge: document.getElementById("prodBadge").value.trim(),
      image: img,
      sizes: sizes.length > 0 ? sizes : ["Única"],
      colors,
      description: document.getElementById("prodDesc").value.trim(),
      inStock: document.getElementById("prodStock").value === "true"
    };

    await window.store.saveProduct(productData);
    closeProductModal();
    renderProductsList();
  } catch (err) {
    alert("Error al guardar: " + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Guardar Producto';
  }
}

function editProduct(id) {
  const prod = window.store.products.find(p => p.id === id);
  if (prod) openProductModal(prod);
}

async function deleteProductPrompt(id, encodedName) {
  const name = decodeURIComponent(encodedName);
  if (confirm(`¿Estás seguro de que deseas eliminar el producto "${name}"?`)) {
    try {
      await window.store.deleteProduct(id);
      renderProductsList();
    } catch (e) {
      alert("Error al eliminar: " + e.message);
    }
  }
}

function exportProductsJson() {
  const jsonStr = JSON.stringify(window.store.products, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "products.json";
  a.click();
  URL.revokeObjectURL(url);
}

/* ==================================================
   HISTORIAL DE PEDIDOS
================================================== */
function renderOrdersList() {
  const orders = window.store.loadOrders();
  const tbody = document.getElementById("ordersTableBody");
  document.getElementById("totalOrdersCount").innerText = orders.length;

  if (orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 30px; color: var(--muted);">
          Aún no hay pedidos registrados. Cuando los clientes completen la compra en la web, aparecerán aquí.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = orders.map(ord => {
    const c = ord.customer || {};
    const itemsSummary = (ord.items || []).map(i => `${i.quantity}x ${i.name} (${i.size})`).join(", ");
    const dateStr = ord.createdAt ? new Date(ord.createdAt).toLocaleDateString("es-HN", { hour: "2-digit", minute: "2-digit" }) : "";
    const phone = (c.phone || "").replace(/[^0-9]/g, "");

    return `
      <tr>
        <td><strong>#${ord.orderNumber}</strong></td>
        <td><small style="color: var(--muted);">${dateStr}</small></td>
        <td>
          <strong>${c.name || "Cliente"}</strong><br>
          <small>${c.phone || ""}</small>
        </td>
        <td>${c.city || ""}<br><small style="color: var(--muted);">${c.address || ""}</small></td>
        <td><small>${itemsSummary}</small></td>
        <td><strong>${ord.currency || "L."} ${(ord.total || 0).toFixed(2)}</strong></td>
        <td><span class="admin-badge" style="background: #2563eb; position: static;">${c.paymentMethod || "Efectivo"}</span></td>
        <td>
          ${phone ? `
            <a href="https://wa.me/${phone}" target="_blank" class="btn-secondary" style="padding: 4px 10px; font-size: 12px;">
              <i class="fa-brands fa-whatsapp" style="color: #10b981;"></i> Chatear
            </a>
          ` : "-"}
        </td>
      </tr>
    `;
  }).join("");
}

/* ==================================================
   CONFIGURACIÓN FIREBASE
================================================== */
function fillFirebaseForm() {
  const config = window.store.settings.firebaseConfig;
  if (config) {
    document.getElementById("firebaseConfigJson").value = JSON.stringify(config, null, 2);
  }
}

function saveFirebaseConfig(e) {
  e.preventDefault();
  const raw = document.getElementById("firebaseConfigJson").value.trim();
  let configObj = null;

  if (raw) {
    try {
      configObj = JSON.parse(raw);
    } catch (err) {
      alert("El texto no tiene formato JSON válido. Asegúrate de pegar el objeto entre llaves { }.");
      return;
    }
  }

  window.store.saveSettings({ firebaseConfig: configObj });
  
  const alertBox = document.getElementById("dbSaveAlert");
  alertBox.style.display = "block";
  setTimeout(() => alertBox.style.display = "none", 4000);

  updateDbStatusDisplay();
}

function testFirebaseConnection() {
  if (window.store.isFirebaseReady) {
    alert("✅ ¡Conexión con Firebase Firestore exitosa! Tus productos se sincronizan en la nube en tiempo real.");
  } else {
    alert("⚠️ Firebase aún no está conectado. Revisa los datos de configuración o asegúrate de tener conexión a internet.");
  }
}

/* ==================================================
   CONFIGURACIÓN DEL NEGOCIO
================================================== */
function fillSettingsForm() {
  const s = window.store.settings;
  document.getElementById("settingWhatsapp").value = s.whatsappNumber || "50400000000";
  document.getElementById("settingCurrency").value = s.currency || "L.";
  document.getElementById("settingBusinessName").value = s.businessName || "Moda Casual Honduras";
  document.getElementById("settingPin").value = s.adminPin || "1234";
}

function saveStoreSettings(e) {
  e.preventDefault();
  const updated = {
    whatsappNumber: document.getElementById("settingWhatsapp").value.trim(),
    currency: document.getElementById("settingCurrency").value.trim(),
    businessName: document.getElementById("settingBusinessName").value.trim(),
    adminPin: document.getElementById("settingPin").value.trim() || "1234"
  };

  window.store.saveSettings(updated);

  const alertBox = document.getElementById("settingsSaveAlert");
  alertBox.style.display = "block";
  setTimeout(() => alertBox.style.display = "none", 3000);
}
