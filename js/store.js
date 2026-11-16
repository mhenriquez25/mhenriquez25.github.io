/**
 * Moda Casual - Store & Database Management
 * Soporta Firebase Firestore (gratuito) y almacenamiento local con sincronización en tiempo real.
 */

const DEFAULT_SETTINGS = {
  whatsappNumber: "50433911316", // Número de WhatsApp para pruebas
  currency: "L.",
  adminPin: "1234",
  businessName: "Moda Casual Honduras",
  firebaseConfig: null // Se guarda desde el panel admin o archivo
};

// Claves de LocalStorage
const LS_KEYS = {
  PRODUCTS: "mc_products_cache",
  CART: "mc_cart",
  SETTINGS: "mc_settings",
  ORDERS: "mc_orders"
};

class StoreManager {
  constructor() {
    this.products = [];
    this.cart = this.loadCart();
    this.settings = this.loadSettings();
    this.orders = this.loadOrders();
    this.firebaseApp = null;
    this.firestore = null;
    this.listeners = [];
    this.isFirebaseReady = false;

    this.initFirebase();
  }

  loadSettings() {
    try {
      const stored = localStorage.getItem(LS_KEYS.SETTINGS);
      const parsed = stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_SETTINGS };
      if (!parsed.whatsappNumber || parsed.whatsappNumber === "50400000000") {
        parsed.whatsappNumber = DEFAULT_SETTINGS.whatsappNumber;
      }
      return parsed;
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(this.settings));
    if (newSettings.firebaseConfig) {
      this.initFirebase();
    }
    return this.settings;
  }

  initFirebase() {
    const config = this.settings.firebaseConfig;
    if (config && typeof firebase !== "undefined") {
      try {
        if (!firebase.apps.length) {
          this.firebaseApp = firebase.initializeApp(config);
        } else {
          this.firebaseApp = firebase.app();
        }
        this.firestore = firebase.firestore();
        this.isFirebaseReady = true;
        console.log("Firebase Firestore inicializado con éxito.");
      } catch (err) {
        console.warn("No se pudo inicializar Firebase con la configuración dada:", err);
        this.isFirebaseReady = false;
      }
    }
  }

  async loadInitialProducts() {
    // 1. Intentar desde Firebase si está configurado
    if (this.isFirebaseReady && this.firestore) {
      try {
        const snapshot = await this.firestore.collection("products").orderBy("createdAt", "desc").get();
        if (!snapshot.empty) {
          const list = [];
          snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
          this.products = list;
          localStorage.setItem(LS_KEYS.PRODUCTS, JSON.stringify(this.products));
          this.notifyListeners();
          return this.products;
        }
      } catch (e) {
        console.warn("Error leyendo de Firebase, usando cache local:", e);
      }
    }

    // 2. Intentar desde LocalStorage (productos agregados o editados localmente)
    const localData = localStorage.getItem(LS_KEYS.PRODUCTS);
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.products = parsed;
          this.notifyListeners();
          return this.products;
        }
      } catch (e) {}
    }

    // 3. Fallback a products.json
    try {
      const res = await fetch("products.json");
      if (res.ok) {
        const data = await res.json();
        this.products = data;
        localStorage.setItem(LS_KEYS.PRODUCTS, JSON.stringify(this.products));
        this.notifyListeners();
        return this.products;
      }
    } catch (e) {
      console.warn("No se pudo cargar products.json:", e);
    }

    return this.products;
  }

  listenToProducts(callback) {
    this.listeners.push(callback);
    callback(this.products);

    // Escucha en tiempo real si Firebase está conectado
    if (this.isFirebaseReady && this.firestore) {
      try {
        this.firestore.collection("products").onSnapshot(snapshot => {
          const list = [];
          snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
          if (list.length > 0) {
            this.products = list;
            localStorage.setItem(LS_KEYS.PRODUCTS, JSON.stringify(this.products));
            this.notifyListeners();
          }
        }, err => console.warn("Error en realtime Firebase:", err));
      } catch (e) {
        console.warn("Realtime listener error:", e);
      }
    }
  }

  notifyListeners() {
    this.listeners.forEach(cb => {
      try { cb(this.products); } catch (e) { console.error(e); }
    });
  }

  async saveProduct(productData) {
    const isEdit = !!productData.id;
    const id = isEdit ? productData.id : "prod-" + Date.now();
    const item = {
      ...productData,
      id,
      price: Number(productData.price) || 0,
      originalPrice: productData.originalPrice ? Number(productData.originalPrice) : null,
      updatedAt: new Date().toISOString(),
      createdAt: productData.createdAt || new Date().toISOString(),
      inStock: productData.inStock !== false
    };

    // Si Firebase está activo, guardar en la colección 'products'
    if (this.isFirebaseReady && this.firestore) {
      try {
        await this.firestore.collection("products").doc(id).set(item, { merge: true });
      } catch (e) {
        console.error("Error guardando en Firebase:", e);
        throw e;
      }
    }

    // Actualizar cache local
    const index = this.products.findIndex(p => p.id === id);
    if (index >= 0) {
      this.products[index] = item;
    } else {
      this.products.unshift(item);
    }
    localStorage.setItem(LS_KEYS.PRODUCTS, JSON.stringify(this.products));
    this.notifyListeners();

    return item;
  }

  async deleteProduct(productId) {
    if (this.isFirebaseReady && this.firestore) {
      try {
        await this.firestore.collection("products").doc(productId).delete();
      } catch (e) {
        console.error("Error eliminando de Firebase:", e);
        throw e;
      }
    }

    this.products = this.products.filter(p => p.id !== productId);
    localStorage.setItem(LS_KEYS.PRODUCTS, JSON.stringify(this.products));
    this.notifyListeners();
    return true;
  }

  /* ============================
     CARRITO DE COMPRAS
  ============================ */
  loadCart() {
    try {
      const data = localStorage.getItem(LS_KEYS.CART);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveCart() {
    localStorage.setItem(LS_KEYS.CART, JSON.stringify(this.cart));
    window.dispatchEvent(new CustomEvent("mc_cart_updated", { detail: { cart: this.cart } }));
  }

  addToCart(product, selectedSize = "M", selectedColor = "Negro", quantity = 1) {
    const cartItemId = `${product.id}_${selectedSize}_${selectedColor}`;
    const existing = this.cart.find(item => item.cartItemId === cartItemId);

    if (existing) {
      existing.quantity += Number(quantity);
    } else {
      this.cart.push({
        cartItemId,
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        size: selectedSize,
        color: selectedColor,
        quantity: Number(quantity)
      });
    }
    this.saveCart();
    return this.cart;
  }

  removeFromCart(cartItemId) {
    this.cart = this.cart.filter(item => item.cartItemId !== cartItemId);
    this.saveCart();
    return this.cart;
  }

  updateCartQty(cartItemId, change) {
    const item = this.cart.find(i => i.cartItemId === cartItemId);
    if (item) {
      item.quantity += change;
      if (item.quantity <= 0) {
        this.removeFromCart(cartItemId);
        return;
      }
    }
    this.saveCart();
  }

  clearCart() {
    this.cart = [];
    this.saveCart();
  }

  getCartTotal() {
    return this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  getCartCount() {
    return this.cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  /* ============================
     GESTIÓN DE PEDIDOS / CHECKOUT
  ============================ */
  loadOrders() {
    try {
      const data = localStorage.getItem(LS_KEYS.ORDERS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  async createOrder(customerData) {
    if (this.cart.length === 0) {
      throw new Error("El carrito está vacío");
    }

    const orderNumber = "MC-" + Math.floor(1000 + Math.random() * 9000);
    const total = this.getCartTotal();

    const order = {
      orderNumber,
      customer: customerData,
      items: [...this.cart],
      total,
      currency: this.settings.currency,
      status: "Pendiente",
      createdAt: new Date().toISOString()
    };

    // Guardar en Firebase si está activo
    if (this.isFirebaseReady && this.firestore) {
      try {
        await this.firestore.collection("orders").doc(orderNumber).set(order);
      } catch (e) {
        console.warn("No se pudo guardar la orden en Firebase:", e);
      }
    }

    // Guardar en histórico local
    this.orders.unshift(order);
    localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(this.orders.slice(0, 50)));

    // Generar texto de WhatsApp
    const whatsappUrl = this.buildWhatsAppOrderUrl(order);

    // Vaciar carrito
    this.clearCart();

    return { order, whatsappUrl };
  }

  buildWhatsAppOrderUrl(order) {
    const c = order.customer;
    let itemsText = "";
    order.items.forEach(it => {
      itemsText += `• ${it.quantity}x ${it.name}\n  Talla: ${it.size} | Color: ${it.color}\n  Precio: ${order.currency} ${it.price.toFixed(2)}\n`;
    });

    const msg = `🛍️ *NUEVO PEDIDO EN MODA CASUAL*
*Orden:* #${order.orderNumber}
━━━━━━━━━━━━━━━━━━
👤 *CLIENTE:*
• *Nombre:* ${c.name}
• *Teléfono:* ${c.phone}
• *Ciudad/Depto:* ${c.city}
• *Dirección:* ${c.address}
${c.notes ? `• *Notas:* ${c.notes}\n` : ""}
━━━━━━━━━━━━━━━━━━
📦 *DETALLE DE COMPRA:*
${itemsText}
━━━━━━━━━━━━━━━━━━
💰 *TOTAL A PAGAR:* ${order.currency} ${order.total.toFixed(2)}
💳 *Método de pago:* ${c.paymentMethod}
━━━━━━━━━━━━━━━━━━
¡Hola! Acabo de hacer este pedido desde su sitio web. ¿Me confirman disponibilidad y los datos para el envío?`;

    const encoded = encodeURIComponent(msg);
    const phone = (this.settings.whatsappNumber || "50433911316").replace(/[^0-9]/g, "");
    return `https://wa.me/${phone}?text=${encoded}`;
  }

  // Utilidad para comprimir y convertir fotos subidas en Base64
  static compressImage(file, maxWidth = 1000, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

// Instancia global
window.store = new StoreManager();

