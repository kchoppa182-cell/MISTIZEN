(function () {
  const canvas = document.getElementById('webCanvas');
  // The animated background belongs only to the landing page. Avoid starting
  // a render loop on catalogue, cart, account, and checkout pages.
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width, height;
  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- mouse tracking (for bending strands) ----
  const mouse = { x: -9999, y: -9999 };
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('mouseleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
    }
  }, { passive: true });

  // ---- parallax tracking (for depth motion) ----
  let rawX = 0, rawY = 0;       // -1 to 1, raw cursor offset from center
  let smoothX = 0, smoothY = 0; // eased version, used for actual movement
  const PARALLAX_EASE = 0.06;   // lower = smoother/laggier, higher = snappier
  const PARALLAX_STRENGTH = 60; // max pixels a depth-1 layer would move

  window.addEventListener('mousemove', (e) => {
    rawX = (e.clientX / width - 0.5) * 2;
    rawY = (e.clientY / height - 0.5) * 2;
  });

  // ---- physics tuning ----
  const SPRING = 0.02;
  const DAMPING = 0.90;
  const MOUSE_RADIUS = 120;
  const MOUSE_FORCE = 9;

  // ---- a single web ----
  class SpiderWeb {
    constructor({ cx, cy, radius, spokes, rings, startAngle, endAngle, depth }) {
      this.points = [];
      this.depth = depth; // 0 = no parallax movement, 1 = full movement
      this.silkOpacity = 0.30 + Math.random() * 0.18;
      this.dewDrops = [];
      const angleStep = (endAngle - startAngle) / (spokes - 1);

      for (let s = 0; s < spokes; s++) {
        const angle = startAngle + s * angleStep;
        const col = [];
        for (let r = 0; r < rings; r++) {
          // Real capture silk is never perfectly even; subtle variation makes
          // each ring look hand-spun while preserving the web's overall shape.
          const dist = radius * ((r + 1) / rings) * (0.96 + Math.random() * 0.08);
          const x = cx + Math.cos(angle) * dist;
          const y = cy + Math.sin(angle) * dist;
          const isOuterAnchor = (r === rings - 1);
          col.push({
            x, y,
            ox: x, oy: y,
            vx: 0, vy: 0,
            fixed: isOuterAnchor
          });
        }
        this.points.push(col);
      }

      for (let i = 0; i < Math.max(4, Math.floor(rings * 1.5)); i++) {
        this.dewDrops.push({
          spoke: Math.floor(Math.random() * spokes),
          ring: Math.floor(Math.random() * rings),
          size: 0.7 + Math.random() * 1.15
        });
      }

      this.centerFixed = { x: cx, y: cy };
    }

    update() {
      for (const col of this.points) {
        for (const p of col) {
          if (p.fixed) continue;

          const fx = (p.ox - p.x) * SPRING;
          const fy = (p.oy - p.y) * SPRING;
          p.vx += fx;
          p.vy += fy;

          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < MOUSE_RADIUS && dist > 0.001) {
            const strength = (1 - dist / MOUSE_RADIUS) * MOUSE_FORCE;
            p.vx += (dx / dist) * strength;
            p.vy += (dy / dist) * strength;
          }

          p.vx *= DAMPING;
          p.vy *= DAMPING;
          p.x += p.vx;
          p.y += p.vy;
        }
      }
    }

    draw(ctx, parallaxOffsetX, parallaxOffsetY) {
      ctx.save();
      // shift the whole web by its own depth-scaled parallax offset
      ctx.translate(parallaxOffsetX * this.depth, parallaxOffsetY * this.depth);

      const isLightTheme = document.body.classList.contains('light-theme');
      ctx.strokeStyle = isLightTheme
        ? 'rgba(8, 12, 10, 0.9)'
        : `rgba(0, 0, 0, ${this.silkOpacity + 0.28})`;
      ctx.lineWidth = 2.15;
      ctx.shadowColor = isLightTheme ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 1;

      for (const col of this.points) {
        ctx.beginPath();
        ctx.moveTo(this.centerFixed.x, this.centerFixed.y);
        for (const p of col) {
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      const rings = this.points[0].length;
      for (let r = 0; r < rings; r++) {
        const ringPoints = this.points.map(col => col[r]);
        ctx.beginPath();
        const first = ringPoints[0];
        const last = ringPoints[ringPoints.length - 1];
        ctx.moveTo(first.x, first.y);
        for (let s = 1; s < ringPoints.length - 1; s++) {
          const p = ringPoints[s];
          const next = ringPoints[s + 1];
          ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
        }
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      for (const drop of this.dewDrops) {
        const point = this.points[drop.spoke][drop.ring];
        ctx.beginPath();
        ctx.fillStyle = isLightTheme ? 'rgba(8, 12, 10, 0.7)' : 'rgba(0, 0, 0, 0.55)';
        ctx.arc(point.x, point.y, drop.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // ---- build webs, each with a different depth ----
  let webs = [];
  function buildWebs() {
    // Each corner is just over half of the screen diagonal from the centre,
    // so all four webs meet in the middle at every screen size.
    const centerReach = Math.hypot(width, height) * 0.53;
    webs = [
      new SpiderWeb({ cx: 0, cy: 0, radius: centerReach, spokes: 9, rings: 6, startAngle: 0, endAngle: Math.PI / 2, depth: 0.4 }),
      new SpiderWeb({ cx: width, cy: 0, radius: centerReach, spokes: 8, rings: 5, startAngle: Math.PI / 2, endAngle: Math.PI, depth: 0.7 }),
      new SpiderWeb({ cx: width, cy: height, radius: centerReach, spokes: 9, rings: 6, startAngle: Math.PI, endAngle: Math.PI * 1.5, depth: 0.5 }),
      new SpiderWeb({ cx: 0, cy: height, radius: centerReach, spokes: 7, rings: 5, startAngle: Math.PI * 1.5, endAngle: Math.PI * 2, depth: 1.0 })
    ];
  }
  buildWebs();
  window.addEventListener('resize', buildWebs);

  // ---- animation loop ----
  let animationFrame = null;
  function animate() {
    if (document.hidden) {
      animationFrame = null;
      return;
    }
    ctx.clearRect(0, 0, width, height);

    // ease the parallax offset toward the raw cursor position
    smoothX += (rawX - smoothX) * PARALLAX_EASE;
    smoothY += (rawY - smoothY) * PARALLAX_EASE;

    const offsetX = smoothX * PARALLAX_STRENGTH;
    const offsetY = smoothY * PARALLAX_STRENGTH;

    for (const web of webs) {
      web.update();
      web.draw(ctx, offsetX, offsetY);
    }
    animationFrame = requestAnimationFrame(animate);
  }
  animate();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && animationFrame === null) animate();
  });
})();

// HOME EXPERIENCE: a down-scroll (wheel, swipe, or keyboard) moves from the
// landing page into the catalogue. The foreground brand moves separately from
// the already-parallaxed canvas to make the page feel layered.
function setupHomeScrollNavigation() {
  const home = document.querySelector('.home-content');
  const stage = document.querySelector('.home-parallax-stage');
  if (!home || !stage) return;

  let isNavigating = false;
  let touchStartY = null;
  const enterCloset = () => {
    if (isNavigating) return;
    isNavigating = true;
    home.classList.add('is-leaving');
    window.setTimeout(() => { window.location.href = 'PRODUCTS.html'; }, 420);
  };

  window.addEventListener('mousemove', event => {
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    stage.style.transform = `translate3d(${x * 14}px, ${y * 10}px, 0)`;
  });
  window.addEventListener('mouseleave', () => { stage.style.transform = ''; });

  window.addEventListener('wheel', event => {
    if (event.deltaY <= 8 || isNavigating) return;
    event.preventDefault();
    enterCloset();
  }, { passive: false });
  window.addEventListener('touchstart', event => { touchStartY = event.touches[0]?.clientY ?? null; }, { passive: true });
  window.addEventListener('touchend', event => {
    if (touchStartY !== null && touchStartY - event.changedTouches[0].clientY > 55) enterCloset();
    touchStartY = null;
  }, { passive: true });
  window.addEventListener('keydown', event => {
    if (['ArrowDown', 'PageDown', ' '].includes(event.key)) {
      event.preventDefault();
      enterCloset();
    }
  });
}
setupHomeScrollNavigation();

// MOUSE-WHEEL NAVIGATION: at the top of the catalogue, an upward wheel scroll
// returns to the home page. Normal scrolling inside the catalogue is unchanged.
function setupCatalogueScrollBack() {
  if (document.querySelector('.home-content') || !document.querySelector('.page')) return;
  let isNavigating = false;
  window.addEventListener('wheel', event => {
    if (window.scrollY > 2 || event.deltaY >= -8 || isNavigating) return;
    event.preventDefault();
    isNavigating = true;
    document.body.classList.add('page-leaving');
    window.setTimeout(() => { window.location.href = 'Frontend.html'; }, 360);
  }, { passive: false });
}
setupCatalogueScrollBack();

function setupAboutSectionTransition() {
  const aboutSection = document.getElementById('about-section');
  if (!aboutSection) return;

  const toggleAboutState = () => {
    const rect = aboutSection.getBoundingClientRect();
    const isActive = rect.top < window.innerHeight * 0.65 && rect.bottom > 120;
    document.body.classList.toggle('about-section-active', isActive);
  };

  toggleAboutState();
  window.addEventListener('scroll', toggleAboutState, { passive: true });
  window.addEventListener('resize', toggleAboutState);
}
setupAboutSectionTransition();

// FRONTEND CONCEPT: this file runs in the browser and connects page elements,
// local browser storage, and server APIs to create interactive UI behavior.
const STOCK_TOTAL = 12; // default stock per card
const BASE_ITEM_PRICE_KES = 1200;
// FRONTEND CONCEPT: the reusable lightbox is inserted once and opened whenever
// a product image is selected.
document.body.insertAdjacentHTML('beforeend', `
  <div id="imageLightbox" class="image-lightbox" role="dialog" aria-modal="true" aria-label="Enlarged product photo" hidden>
    <button class="lightbox-close" type="button" aria-label="Close enlarged photo">×</button>
    <img id="lightboxImage" alt="Enlarged product photo">
  </div>`);
const imageLightbox = document.getElementById('imageLightbox');
const lightboxImage = document.getElementById('lightboxImage');
function closeImageLightbox() { imageLightbox.hidden = true; }
function openImageLightbox(imageSource, imageAlt) {
  lightboxImage.src = imageSource;
  lightboxImage.alt = imageAlt || 'Enlarged product photo';
  imageLightbox.hidden = false;
}
imageLightbox.querySelector('.lightbox-close').addEventListener('click', closeImageLightbox);
imageLightbox.addEventListener('click', event => { if (event.target === imageLightbox) closeImageLightbox(); });
window.addEventListener('keydown', event => { if (event.key === 'Escape') closeImageLightbox(); });

// FRONTEND CONCEPT: each product card owns its own image gallery, quantity
// state, and Add to cart event handlers.
// The catalogue page renders its cards dynamically via catalog.js (which has
// its own gallery, wishlist, and quick-view wiring), so skip it here.
const isCatalogPage = typeof window.MISTIZEN_PRODUCTS !== 'undefined' && document.getElementById('productGrid');
document.querySelectorAll('.card').forEach(card => {
  if (isCatalogPage) return;
  const frame = card.querySelector('.frame');
  const preview = card.querySelector('.preview');

  const qtyEl = card.querySelector('.qty');
  const minusBtn = card.querySelector('.minus');
  const plusBtn = card.querySelector('.plus');
  const stockLeftEl = card.querySelector('.stockLeft');
  const addBtn = card.querySelector('.add-btn');
  const nameDisplay = card.querySelector('.name-display');

  let qty = 1;
  let images = (card.dataset.images || '').split(',').map(image => image.trim()).filter(Boolean);
  let activeImage = 0;

  frame.insertAdjacentHTML('beforeend', `
    <button class="gallery-arrow gallery-prev" type="button" aria-label="Previous photo">‹</button>
    <button class="gallery-arrow gallery-next" type="button" aria-label="Next photo">›</button>
    <span class="gallery-count" aria-live="polite"></span>`);
  const previousImage = frame.querySelector('.gallery-prev');
  const nextImage = frame.querySelector('.gallery-next');
  const imageCount = frame.querySelector('.gallery-count');

  function showImage() {
    if (!images.length) return;
    preview.decoding = 'async';
    preview.loading = 'lazy';
    preview.src = images[activeImage];
    frame.classList.add('has-image');
    imageCount.textContent = images.length > 1 ? `${activeImage + 1} / ${images.length}` : '';
    previousImage.hidden = nextImage.hidden = images.length < 2;
  }

  if (images.length) showImage();

  function moveImage(step) {
    if (images.length < 2) return;
    activeImage = (activeImage + step + images.length) % images.length;
    showImage();
  }

  preview.addEventListener('click', event => {
    if (!preview.src) return;
    event.preventDefault();
    event.stopPropagation();
    openImageLightbox(preview.src, preview.alt);
  });

  [previousImage, nextImage].forEach((button, index) => button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    moveImage(index === 0 ? -1 : 1);
  }));

  function renderQty() {
    qtyEl.textContent = qty;
    minusBtn.disabled = qty <= 1;
    plusBtn.disabled = qty >= STOCK_TOTAL;
    stockLeftEl.textContent = STOCK_TOTAL - qty + 1;
  }

  minusBtn.addEventListener('click', () => { if (qty > 1) { qty--; renderQty(); } });
  plusBtn.addEventListener('click', () => { if (qty < STOCK_TOTAL) { qty++; renderQty(); } });
  renderQty();

  const cartIconHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.5 3h2l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21.5 7H6"/></svg> Add to cart`;

  addBtn.addEventListener('click', () => {
    const item = {
      name: nameDisplay.textContent.trim() || 'Untitled product',
      price: BASE_ITEM_PRICE_KES,
      quantity: qty
    };
    const cart = JSON.parse(localStorage.getItem('mistizenCart') || '[]');
    const existingItem = cart.find(cartItem => cartItem.name === item.name && cartItem.price === item.price);
    if (existingItem) existingItem.quantity += item.quantity;
    else cart.push(item);
    localStorage.setItem('mistizenCart', JSON.stringify(cart));
    setTimeout(() => { window.location.href = 'cart.html'; }, 500);
    addBtn.classList.add('added');
    addBtn.innerHTML = '✓ Added';
    setTimeout(() => {
      addBtn.classList.remove('added');
      addBtn.innerHTML = cartIconHTML;
    }, 1200);
  });
});

// FRONTEND CONCEPT: shared navigation is generated once so every HTML page
// receives the same menu without duplicating its markup.
document.body.insertAdjacentHTML('afterbegin', `
  <nav class="side-menu" aria-label="Main navigation">
    <span class="menu-handle" aria-hidden="true">☰</span>
    <a href="Frontend.html" aria-label="Home" title="Home">
      <span class="nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 10.5 12 4l8 6.5"></path>
          <path d="M7 10.5V20h10V10.5"></path>
        </svg>
      </span>
      <span class="nav-label">Home</span>
    </a>
    <a href="PRODUCTS.html" aria-label="Closet" title="Closet">
      <span class="nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 7.5 12 4l5 3.5v2L12 10 7 9.5z"></path>
          <path d="M8 9.5v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7"></path>
        </svg>
      </span>
      <span class="nav-label">Closet</span>
    </a>
    <a href="cart.html" aria-label="Cart" title="Cart">
      <span class="nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.4a1 1 0 0 0 1-.8L18 7H7"></path>
          <circle cx="10" cy="19" r="1.4"></circle>
          <circle cx="17" cy="19" r="1.4"></circle>
        </svg>
      </span>
      <span class="nav-label">Cart</span>
    </a>
    <a href="support.html" aria-label="Customer support" title="Customer support">
      <span class="nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 5.5h16v13H4z"></path><path d="m4 7 8 6 8-6"></path>
        </svg>
      </span>
      <span class="nav-label">Support</span>
    </a>
    <a href="auth.html" class="account-nav-link" aria-label="Account" title="Log in or sign up">
      <span class="nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M5 19a7 7 0 0 1 14 0"></path>
        </svg>
      </span>
      <span class="nav-label">Account</span>
    </a>
  </nav>`);

const sideMenu = document.querySelector('.side-menu');
const menuHandle = document.querySelector('.menu-handle');
const menuBackdrop = document.createElement('button');
menuBackdrop.className = 'menu-backdrop';
menuBackdrop.type = 'button';
menuBackdrop.tabIndex = -1;
menuBackdrop.setAttribute('aria-label', 'Close navigation menu');
document.body.append(menuBackdrop);
if (sideMenu && menuHandle) {
  menuHandle.removeAttribute('aria-hidden');
  menuHandle.setAttribute('role', 'button');
  menuHandle.setAttribute('tabindex', '0');
  menuHandle.setAttribute('aria-label', 'Open navigation menu');
  menuHandle.setAttribute('aria-expanded', 'false');
  menuHandle.addEventListener('click', toggleMenu);
  menuHandle.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleMenu();
    }
  });
  function toggleMenu() {
    const isOpen = sideMenu.classList.toggle('is-open');
    menuHandle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
    menuHandle.setAttribute('aria-expanded', String(isOpen));
    menuBackdrop.classList.toggle('is-visible', isOpen);
  }
  menuBackdrop.addEventListener('click', toggleMenu);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sideMenu.classList.contains('is-open')) toggleMenu();
  });
}

if (sideMenu) {
  sideMenu.insertAdjacentHTML('beforeend', '<button class="theme-toggle" type="button" aria-pressed="false">Light mode</button>');
  const themeToggle = sideMenu.querySelector('.theme-toggle');
  const savedTheme = localStorage.getItem('mistizenTheme');
  const useLightTheme = savedTheme === 'light' || (!savedTheme && window.matchMedia('(prefers-color-scheme: light)').matches);

  function setTheme(isLight) {
    document.body.classList.toggle('light-theme', isLight);
    themeToggle.textContent = isLight ? 'Dark mode' : 'Light mode';
    themeToggle.setAttribute('aria-pressed', String(isLight));
    localStorage.setItem('mistizenTheme', isLight ? 'light' : 'dark');
  }

  setTheme(useLightTheme);
  themeToggle.addEventListener('click', () => setTheme(!document.body.classList.contains('light-theme')));
}

// FRONTEND CONCEPT: cart data is stored in localStorage, so it survives page
// navigation in the same browser. renderCart turns that data into HTML.
function renderCart() {
  const cartItems = document.getElementById('cartItems');
  const cartTotal = document.getElementById('cartTotal');
  if (!cartItems || !cartTotal) return;
  const cart = JSON.parse(localStorage.getItem('mistizenCart') || '[]');
  if (!cart.length) {
    cartItems.innerHTML = '<p class="empty-cart">Your cart is empty.</p>';
    cartTotal.textContent = '';
    return;
  }
  cartItems.innerHTML = cart.map((item, index) => {
    const variants = [item.size, item.color].filter(Boolean).join(' · ');
    const variantLine = variants ? `<small>${escapeHtml(variants)}</small>` : '';
    return `
    <article class="cart-item">
      <div><strong>${escapeHtml(item.name)}</strong>${variantLine}<small>Quantity: ${item.quantity}</small></div>
      <span>${formatCurrency(priceInKes(item) * item.quantity)}</span>
      <button class="remove-item" data-index="${index}">Remove</button>
    </article>`;
  }).join('');
  const total = cart.reduce((sum, item) => sum + priceInKes(item) * item.quantity, 0);
  cartTotal.textContent = `Total: ${formatCurrency(total)}`;
  cartItems.querySelectorAll('.remove-item').forEach(button => button.addEventListener('click', () => {
    cart.splice(Number(button.dataset.index), 1);
    localStorage.setItem('mistizenCart', JSON.stringify(cart));
    renderCart();
  }));
}

const clearCartButton = document.getElementById('clearCart');
if (clearCartButton) {
  clearCartButton.addEventListener('click', () => {
    if (!confirm('Remove all items from your cart?')) return;
    localStorage.removeItem('mistizenCart');
    renderCart();
  });
}
// FRONTEND CONCEPT: currency preference is persisted in localStorage. Prices
// are stored as KES amounts and formatted only when displayed.
let selectedCurrency = localStorage.getItem('mistizenCurrency') || 'KES';
const fallbackCurrencyRates = { KES: 1, USD: 0.0077, EUR: 0.0071, GBP: 0.0060 };
let currencyRates = { ...fallbackCurrencyRates };
// Share the live rates with catalog.js so its dynamically rendered cards show
// the same converted prices as the rest of the site.
window.__currencyRates = currencyRates;

function getApiBase() {
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const isFlaskServer = window.location.port === '5000';
  // Static preview servers can use different ports. Keep the hostname so
  // session cookies work consistently for localhost and 127.0.0.1.
  return isLocalHost && !isFlaskServer ? `http://${window.location.hostname}:5000` : '';
}

const API_BASE = getApiBase();
function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function profileInitials(user) {
  return (user.username || user.email || 'A').trim().slice(0, 1).toUpperCase();
}

function updateAccountNavigation(user) {
  const accountLink = document.querySelector('.account-nav-link');
  if (!accountLink) return;
  if (!user) {
    accountLink.href = 'auth.html';
    accountLink.title = 'Log in or sign up';
    accountLink.setAttribute('aria-label', 'Account');
    accountLink.querySelector('.nav-label').textContent = 'Account';
    return;
  }
  const displayName = user.username || user.email;
  accountLink.href = 'account.html';
  accountLink.title = `Account: ${displayName}`;
  accountLink.setAttribute('aria-label', `Account: ${displayName}`);
  accountLink.querySelector('.nav-label').textContent = displayName;
  const icon = accountLink.querySelector('.nav-icon');
  icon.classList.add('account-avatar');
  icon.innerHTML = user.profile_photo
    ? `<img src="${escapeHtml(user.profile_photo)}" alt="">`
    : `<span>${escapeHtml(profileInitials(user))}</span>`;
}

async function loadAccountNavigation() {
  try {
    const response = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' });
    const data = await response.json();
    updateAccountNavigation(data.authenticated ? data.user : null);
  } catch {
    updateAccountNavigation(null);
  }
}

loadAccountNavigation();

function currencyName(code) {
  try {
    return new Intl.DisplayNames([navigator.language], { type: 'currency' }).of(code) || code;
  } catch {
    return code;
  }
}

function renderCurrencyOptions(selector) {
  selector.innerHTML = Object.keys(currencyRates).sort().map(code =>
    `<option value="${code}">${code} — ${currencyName(code)}</option>`
  ).join('');
}

function priceInKes(item) {
  return Number(item.price || item.baseKes || BASE_ITEM_PRICE_KES);
}

function formatCurrency(amountKes) {
  const convertedAmount = amountKes * (currencyRates[selectedCurrency] || 1);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: selectedCurrency, maximumFractionDigits: 2 }).format(convertedAmount);
  } catch {
    return `${selectedCurrency} ${convertedAmount.toFixed(2)}`;
  }
}

function getDeliveryFeeKes() {
  const deliveryFeeNote = document.getElementById('deliveryFeeNote');
  return Number(deliveryFeeNote?.dataset.fee || 0);
}

function updateDisplayedPrices() {
  // On the catalogue page (#productGrid) prices are rendered dynamically by
  // catalog.js with per-product sale/compare-at values, so leave them alone.
  if (typeof window.MISTIZEN_PRODUCTS !== 'undefined' && document.getElementById('productGrid')) {
    if (window.renderMistizenGrid) window.renderMistizenGrid();
  } else {
    document.querySelectorAll('.price-display').forEach(display => {
      display.textContent = formatCurrency(BASE_ITEM_PRICE_KES);
    });
  }
  document.querySelectorAll('.delivery-method[data-fee-kes]').forEach(method => {
    const feeLabel = method.querySelector('small');
    if (feeLabel) feeLabel.textContent = formatCurrency(Number(method.dataset.feeKes));
  });
  const deliveryFeeNote = document.getElementById('deliveryFeeNote');
  if (deliveryFeeNote?.dataset.fee) {
    deliveryFeeNote.textContent = `Delivery fee: ${formatCurrency(Number(deliveryFeeNote.dataset.fee))}`;
  }
  renderCart();
  const checkoutTotal = document.getElementById('checkoutTotal');
  if (checkoutTotal) {
    const cart = JSON.parse(localStorage.getItem('mistizenCart') || '[]');
    const subtotalKes = cart.reduce((sum, item) => sum + priceInKes(item) * item.quantity, 0);
    const deliveryFeeKes = getDeliveryFeeKes();
    checkoutTotal.textContent = formatCurrency(subtotalKes + deliveryFeeKes);
  }
}

// FRONTEND CONCEPT: async/await lets the UI request live exchange rates without
// freezing the page; fallback rates keep the selector useful offline.
async function setupCurrencySwitcher() {
  const selector = document.getElementById('currencySelect');
  if (!selector) return;
  selector.innerHTML = '<option value="KES">KES — Kenyan Shilling</option>';
  renderCurrencyOptions(selector);
  selector.value = currencyRates[selectedCurrency] ? selectedCurrency : 'KES';
  updateDisplayedPrices();
  try {
    const response = await fetch(apiUrl('/api/rates'), { credentials: 'include' });
    const data = await response.json();
    if (data.result !== 'success' || !data.rates) throw new Error('Rates unavailable');
    currencyRates = data.rates;
    currencyRates.KES = 1;
    window.__currencyRates = currencyRates;
    if (typeof window.renderMistizenGrid === 'function') window.renderMistizenGrid();
    const currencies = Object.keys(currencyRates).sort();
    selector.innerHTML = currencies.map(code => `<option value="${code}">${code} — ${new Intl.DisplayNames([navigator.language], { type: 'currency' }).of(code) || code}</option>`).join('');
    renderCurrencyOptions(selector);
  } catch {
    renderCurrencyOptions(selector);
    selector.title = 'Live rates could not be loaded. Prices are shown in Kenyan Shillings.';
  }
  selector.value = currencyRates[selectedCurrency] ? selectedCurrency : 'KES';
  selectedCurrency = selector.value;
  selector.addEventListener('change', () => {
    selectedCurrency = selector.value;
    localStorage.setItem('mistizenCurrency', selectedCurrency);
    // Notify catalog.js so the max-price slider range/label follows the new
    // currency while the underlying KES filter stays consistent.
    window.dispatchEvent(new CustomEvent('mistizenCurrencyChange', { detail: { currency: selectedCurrency } }));
    updateDisplayedPrices();
  });
  updateDisplayedPrices();
}
setupCurrencySwitcher();
renderCart();

// FRONTEND CONCEPT: checkout switches form fields based on the chosen payment
// method and sends the final order to the backend API.
function setupCheckout() {
  const form = document.getElementById('paymentForm');
  const totalElement = document.getElementById('checkoutTotal');
  if (!form || !totalElement) return;
  const message = document.getElementById('paymentMessage');
  const cart = JSON.parse(localStorage.getItem('mistizenCart') || '[]');
  const total = cart.reduce((sum, item) => sum + priceInKes(item) * item.quantity, 0);
  totalElement.textContent = formatCurrency(total);
  let selectedMethod = 'mpesa';
  let selectedDelivery = 'nairobi';
  const deliveryAddressWrap = document.getElementById('deliveryAddressWrap');
  const deliveryPhone = document.getElementById('deliveryPhone');
  const deliveryCountryCode = document.getElementById('deliveryCountryCode');
  const deliveryHouseNumber = document.getElementById('deliveryHouseNumber');
  const deliveryAddress1 = document.getElementById('deliveryAddress1');
  const deliveryAddress2 = document.getElementById('deliveryAddress2');
  const deliveryZip = document.getElementById('deliveryZip');
  const deliveryFeeNote = document.getElementById('deliveryFeeNote');
  const deliveryFees = { nairobi: 50, nearby: 100, countrywide: 150, international: 400 };
  // National-number rules for the country codes offered at checkout. Customers
  // enter the number after the selected dialling code (a leading local 0 is OK).
  const phoneRules = {
    '+254': { name: 'Kenyan', pattern: /^(?:1|7)\d{8}$/, placeholder: '712 345 678' },
    '+233': { name: 'Ghanaian', pattern: /^(?:2|5)\d{8}$/, placeholder: '24 123 4567' },
    '+234': { name: 'Nigerian', pattern: /^[2-9]\d{9}$/, placeholder: '803 123 4567' },
    '+256': { name: 'Ugandan', pattern: /^(?:2|3|4|7)\d{8}$/, placeholder: '712 345 678' },
    '+255': { name: 'Tanzanian', pattern: /^(?:2|4|6|7|8)\d{8}$/, placeholder: '712 345 678' },
    '+250': { name: 'Rwandan', pattern: /^(?:2|7|8)\d{8}$/, placeholder: '788 123 456' },
    '+267': { name: 'Botswanan', pattern: /^[2-7]\d{6,7}$/, placeholder: '71 234 567' },
    '+268': { name: 'Eswatini', pattern: /^(?:2|7)\d{7}$/, placeholder: '7612 3456' },
    '+265': { name: 'Malawian', pattern: /^(?:1|2|8|9)\d{8}$/, placeholder: '991 234 567' },
    '+260': { name: 'Zambian', pattern: /^(?:2|5|6|7|9)\d{8}$/, placeholder: '971 234 567' },
    '+263': { name: 'Zimbabwean', pattern: /^[1-9]\d{8}$/, placeholder: '77 123 4567' },
    '+27': { name: 'South African', pattern: /^[1-8]\d{8}$/, placeholder: '82 123 4567' },
    '+1': { name: 'US or Canadian', pattern: /^[2-9]\d{2}[2-9]\d{6}$/, placeholder: '202 555 0123' },
    '+44': { name: 'UK', pattern: /^\d{9,10}$/, placeholder: '7700 900123' },
    '+91': { name: 'Indian', pattern: /^[6-9]\d{9}$/, placeholder: '98765 43210' },
    '+61': { name: 'Australian', pattern: /^\d{9}$/, placeholder: '412 345 678' },
    '+49': { name: 'German', pattern: /^\d{7,11}$/, placeholder: '151 23456789' },
    '+33': { name: 'French', pattern: /^[1-9]\d{8}$/, placeholder: '6 12 34 56 78' },
    '+81': { name: 'Japanese', pattern: /^\d{9,10}$/, placeholder: '90 1234 5678' },
    '+971': { name: 'UAE', pattern: /^[2-9]\d{7,8}$/, placeholder: '50 123 4567' }
  };
  function normaliseNationalPhone(value) {
    return value.replace(/[\s().-]/g, '').replace(/^0/, '');
  }
  function validateDeliveryPhone() {
    const rule = phoneRules[deliveryCountryCode?.value];
    const nationalNumber = normaliseNationalPhone(deliveryPhone?.value.trim() || '');
    const valid = Boolean(rule && rule.pattern.test(nationalNumber));
    if (deliveryPhone) {
      deliveryPhone.setCustomValidity(valid || !deliveryPhone.value.trim()
        ? ''
        : `Enter a valid ${rule?.name || 'phone'} number for ${deliveryCountryCode.value}.`);
    }
    return { valid, nationalNumber, rule };
  }
  function updatePhoneHint() {
    const rule = phoneRules[deliveryCountryCode?.value];
    if (deliveryPhone && rule) deliveryPhone.placeholder = rule.placeholder;
    validateDeliveryPhone();
  }
  function updateDeliveryFee() {
    const fee = deliveryFees[selectedDelivery];
    deliveryFeeNote.dataset.fee = String(fee);
    const feeLabel = formatCurrency(fee);
    deliveryFeeNote.textContent = `Delivery fee: ${feeLabel}`;
    updateDisplayedPrices();
  }

  const paymentFields = {
    mpesa: `<label for="paymentPhone">M-Pesa phone number</label><input id="paymentPhone" type="tel" inputmode="tel" placeholder="254 7XX XXX XXX" required><button class="pay-now" type="submit">Request M-Pesa prompt</button>`,
    card: `<label for="cardName">Name on card</label><input id="cardName" type="text" autocomplete="cc-name" required><label for="cardNumber">Card number</label><input id="cardNumber" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="•••• •••• •••• ••••" required><button class="pay-now" type="submit">Pay with card</button>`,
    paypal: `<p>You will be redirected securely to PayPal to complete payment.</p><button class="pay-now" type="submit">Continue to PayPal</button>`,
    sendwave: `<p>Continue to Sendwave to complete your payment securely.</p><button class="pay-now" type="submit">Continue to Sendwave</button>`
  };
  paymentFields.card = `<label for="cardName">Name on card</label><input id="cardName" type="text" autocomplete="cc-name" placeholder="Name as shown on card" required><label for="cardNumber">Card number</label><input id="cardNumber" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" minlength="13" maxlength="23" required><div class="card-security-row"><div><label for="cardExpiry">Expiry date</label><input id="cardExpiry" type="text" inputmode="numeric" autocomplete="cc-exp" placeholder="MM / YY" maxlength="7" required></div><div><label for="cardCvc">CVC</label><input id="cardCvc" type="text" inputmode="numeric" autocomplete="cc-csc" placeholder="123" minlength="3" maxlength="4" required></div></div><button class="pay-now" type="submit">Pay with card</button>`;
  function showPaymentMethod() {
    form.innerHTML = paymentFields[selectedMethod];
    message.textContent = '';
    const cardNumber = document.getElementById('cardNumber');
    const cardExpiry = document.getElementById('cardExpiry');
    const cardCvc = document.getElementById('cardCvc');
    if (cardNumber) cardNumber.addEventListener('input', () => {
      cardNumber.value = cardNumber.value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
    });
    if (cardExpiry) cardExpiry.addEventListener('input', () => {
      const digits = cardExpiry.value.replace(/\D/g, '').slice(0, 4);
      cardExpiry.value = digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
    });
    if (cardCvc) cardCvc.addEventListener('input', () => { cardCvc.value = cardCvc.value.replace(/\D/g, '').slice(0, 4); });
  }
  document.querySelectorAll('.payment-method').forEach(button => button.addEventListener('click', () => {
    selectedMethod = button.dataset.payment;
    document.querySelectorAll('.payment-method').forEach(item => item.classList.toggle('active', item === button));
    showPaymentMethod();
  }));
  document.querySelectorAll('.delivery-method').forEach(button => button.addEventListener('click', () => {
    selectedDelivery = button.dataset.delivery;
    document.querySelectorAll('.delivery-method').forEach(item => item.classList.toggle('active', item === button));
    deliveryAddressWrap.hidden = false;
    [deliveryPhone, deliveryHouseNumber, deliveryAddress1, deliveryZip].forEach(field => {
      if (field) field.required = true;
    });
    updateDeliveryFee();
  }));
  deliveryCountryCode?.addEventListener('change', updatePhoneHint);
  deliveryPhone?.addEventListener('input', validateDeliveryPhone);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!cart.length) { message.textContent = 'Your cart is empty. Add an item before paying.'; return; }
    const phoneValue = deliveryPhone?.value.trim() || '';
    const countryCodeValue = deliveryCountryCode?.value || '';
    const phoneCheck = validateDeliveryPhone();
    const fullPhoneValue = `${countryCodeValue}${phoneCheck.nationalNumber}`;
    const deliveryDetails = [
      phoneValue,
      deliveryHouseNumber?.value.trim(),
      deliveryAddress1?.value.trim(),
      deliveryAddress2?.value.trim(),
      deliveryZip?.value.trim()
    ].filter(Boolean);
    if (!phoneCheck.valid) { message.textContent = `Please enter a valid ${phoneCheck.rule?.name || ''} phone number for the selected country code.`; deliveryPhone?.reportValidity(); return; }
    if (deliveryDetails.length < 4) { message.textContent = 'Please complete your delivery details, including phone number, house number, address, and ZIP code.'; return; }
    if (selectedMethod === 'card') {
      const number = document.getElementById('cardNumber').value.replace(/\s/g, '');
      const expiry = document.getElementById('cardExpiry').value.match(/^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/);
      const cvc = document.getElementById('cardCvc').value;
      const luhnValid = number.length >= 13 && [...number].reverse().reduce((sum, digit, index) => {
        let value = Number(digit);
        if (index % 2) value = value > 4 ? value * 2 - 9 : value * 2;
        return sum + value;
      }, 0) % 10 === 0;
      const now = new Date();
      const expiryValid = expiry && new Date(2000 + Number(expiry[2]), Number(expiry[1]), 0) >= new Date(now.getFullYear(), now.getMonth(), 1);
      if (!luhnValid) { message.textContent = 'Enter a valid card number.'; return; }
      if (!expiryValid) { message.textContent = 'Enter a valid, unexpired expiry date.'; return; }
      if (!/^\d{3,4}$/.test(cvc)) { message.textContent = 'Enter a valid 3- or 4-digit CVC.'; return; }
    }
    const labels = { mpesa: 'M-Pesa STK prompt', card: 'card payment', paypal: 'PayPal checkout', sendwave: 'Sendwave checkout' };
    message.textContent = 'Processing your order securely...';
    try {
      const response = await fetch(apiUrl('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          total_kes: total,
          payment_method: selectedMethod,
          delivery_method: selectedDelivery,
          delivery_address: {
            phone: fullPhoneValue || '',
            house_number: deliveryHouseNumber?.value.trim() || '',
            address_1: deliveryAddress1?.value.trim() || '',
            address_2: deliveryAddress2?.value.trim() || '',
            zip_code: deliveryZip?.value.trim() || ''
          }
        }),
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok || data.result !== 'success') throw new Error(data.message || 'Unable to place order.');
      localStorage.removeItem('mistizenCart');
      message.textContent = `${labels[selectedMethod]} accepted. Order #${data.order_id} was saved.${data.email_sent ? ' Your order details were emailed to you.' : ' Order email will be available once store email is configured.'}`;
      setTimeout(() => { window.location.href = 'PRODUCTS.html'; }, 700);
    } catch (error) {
      message.textContent = error.message || 'Unable to place order.';
    }
  });
  showPaymentMethod();
  updatePhoneHint();
  updateDeliveryFee();
}
setupCheckout();

const authForm = document.getElementById('authForm');
if (authForm) {
  let authMode = 'login';
  const title = document.getElementById('authTitle');
  const subtitle = document.getElementById('authSubtitle');
  const submit = authForm.querySelector('.auth-submit');
  const message = document.getElementById('authMessage');
  const params = new URLSearchParams(window.location.search);
  const authError = params.get('auth_error');
  if (authError) {
    const friendlyMessages = {
      google_not_configured: 'Google sign-in is not configured yet. Please use the email form for now.',
      invalid_state: 'The Google sign-in request was interrupted. Please try again.',
      missing_code: 'Google did not return a valid sign-in code. Please try again.',
      token_exchange_failed: 'Google sign-in could not be completed. Please try again.',
      userinfo_failed: 'Google did not return your profile details. Please try again.',
      email_missing: 'Google did not return a usable email address.',
      access_denied: 'Google sign-in was cancelled.'
    };
    message.textContent = friendlyMessages[authError] || 'Google sign-in could not be completed.';
  }
  if (params.get('auth') === 'demo') {
    message.textContent = 'Google sign-in was not fully available, so you were signed in with a demo account.';
  }
  const googleButton = document.getElementById('googleSignIn');
  if (googleButton) {
    fetch(apiUrl('/api/auth/providers'), { credentials: 'include' })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => {
        if (!data.google?.configured) {
          googleButton.disabled = true;
          googleButton.title = 'Google sign-in needs server configuration.';
          if (!authError) message.textContent = 'Google sign-in is not available yet. You can still log in with your email and password.';
        }
      })
      .catch(() => {
        // The regular email form remains usable if the optional provider check fails.
      });
  }
  document.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
    authMode = tab.dataset.mode;
    document.querySelectorAll('.auth-tab').forEach(item => item.classList.toggle('active', item === tab));
    title.textContent = authMode === 'signup' ? 'Create your account' : 'Welcome back';
    subtitle.textContent = authMode === 'signup' ? 'Join MISTIZEN and shop your fit.' : 'Sign in to continue shopping.';
    submit.textContent = authMode === 'signup' ? 'Sign up with email' : 'Log in with email';
    message.textContent = '';
  }));
  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const endpoint = authMode === 'signup' ? '/api/auth/register' : '/api/auth/login';
    message.textContent = 'Please wait...';
    try {
      const response = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok || data.result !== 'success') throw new Error(data.message || 'Authentication failed.');
      localStorage.setItem('mistizenUser', JSON.stringify(data.user || { email, method: 'email' }));
      message.textContent = `${authMode === 'signup' ? 'Account created' : 'Logged in'} for ${email}.`;
      setTimeout(() => { window.location.href = 'PRODUCTS.html'; }, 600);
    } catch (error) {
      message.textContent = error.message || 'Authentication failed.';
    }
  });
  document.querySelectorAll('[data-provider]').forEach(button => button.addEventListener('click', () => {
    const provider = button.dataset.provider;
    if (provider === 'Google') {
      window.location.href = apiUrl('/api/auth/google');
      return;
    }
    localStorage.setItem('mistizenUser', JSON.stringify({ method: provider }));
    message.textContent = `${provider} sign-in is ready to connect. Add provider credentials to enable the real secure sign-in.`;
  }));
}

function setupAccountPage() {
  const profileForm = document.getElementById('profileForm');
  if (!profileForm) return;
  const message = document.getElementById('accountMessage');
  const email = document.getElementById('profileEmail');
  const username = document.getElementById('profileUsername');
  const preview = document.getElementById('profilePreview');
  const photoInput = document.getElementById('profilePhoto');
  const paymentForm = document.getElementById('paymentPreferenceForm');
  const paymentMethod = document.getElementById('paymentPreference');
  const paymentDetail = document.getElementById('paymentDetail');
  const paymentLabel = document.getElementById('paymentDetailLabel');
  const savedPayment = document.getElementById('savedPayment');
  let photoData = '';

  function showPhoto(user) {
    photoData = user.profile_photo || '';
    preview.src = photoData || '';
    preview.hidden = !photoData;
    preview.alt = photoData ? 'Your profile photo' : '';
  }
  function renderUser(user) {
    email.value = user.email;
    username.value = user.username || user.email.split('@')[0];
    showPhoto(user);
    savedPayment.textContent = user.payment_label || 'No saved payment preference.';
    if (user.payment_method) paymentMethod.value = user.payment_method;
    document.getElementById('adminDashboardLink').hidden = !user.is_admin;
    updatePaymentInput();
    updateAccountNavigation(user);
  }
  function updatePaymentInput() {
    const isCard = paymentMethod.value === 'card';
    const needsDetail = isCard || paymentMethod.value === 'mpesa';
    paymentLabel.textContent = isCard ? 'Card number (only the last four digits are retained)' : 'M-Pesa phone number';
    paymentDetail.placeholder = isCard ? '1234 5678 9012 3456' : '254 7XX XXX XXX';
    paymentDetail.required = needsDetail;
    paymentLabel.toggleAttribute('hidden', !needsDetail);
    paymentDetail.hidden = !needsDetail;
  }
  async function getAccount() {
    const response = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' });
    const data = await response.json();
    if (!data.authenticated) { window.location.replace('auth.html'); return; }
    renderUser(data.user);
  }
  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { message.textContent = 'Choose an image smaller than 1 MB.'; photoInput.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { photoData = String(reader.result); preview.src = photoData; preview.hidden = false; };
    reader.readAsDataURL(file);
  });
  profileForm.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = 'Saving profile...';
    try {
      const response = await fetch(apiUrl('/api/account/profile'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ username: username.value, profile_photo: photoData }) });
      const data = await response.json();
      if (!response.ok || data.result !== 'success') throw new Error(data.message);
      renderUser(data.user); message.textContent = 'Profile saved.';
    } catch (error) { message.textContent = error.message || 'Could not save your profile.'; }
  });
  paymentMethod.addEventListener('change', updatePaymentInput);
  paymentForm.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = 'Saving payment preference...';
    try {
      const response = await fetch(apiUrl('/api/account/payment'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ method: paymentMethod.value, detail: paymentDetail.value }) });
      const data = await response.json();
      if (!response.ok || data.result !== 'success') throw new Error(data.message);
      renderUser(data.user); paymentDetail.value = ''; message.textContent = 'Payment preference saved.';
    } catch (error) { message.textContent = error.message || 'Could not save payment preference.'; }
  });
  document.getElementById('logoutButton').addEventListener('click', async () => {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    localStorage.removeItem('mistizenUser');
    window.location.replace('Frontend.html');
  });
  getAccount().catch(() => { message.textContent = 'Could not load your account.'; });
}

setupAccountPage();

function setupSupportPage() {
  const form = document.getElementById('supportForm');
  if (!form) return;
  const message = document.getElementById('supportMessage');
  const submit = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(form);
    submit.disabled = true;
    message.textContent = 'Sending your feedback...';
    try {
      const response = await fetch(apiUrl('/api/support'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          feedback: formData.get('feedback')
        })
      });
      const data = await response.json();
      if (!response.ok || data.result !== 'success') throw new Error(data.message || 'Could not send feedback.');
      form.reset();
      message.textContent = data.message;
    } catch (error) {
      message.textContent = error.message || 'Could not send feedback.';
    } finally {
      submit.disabled = false;
    }
  });
}

setupSupportPage();

function setupAdminDashboard() {
  const container = document.getElementById('adminOrders');
  if (!container) return;
  const message = document.getElementById('adminMessage');
  const statusOptions = ['new', 'processing', 'out_for_delivery', 'delivered', 'cancelled'];
  function readable(value) { return String(value || '').replaceAll('_', ' '); }

  // ---- KPI stats ----
  function statEl(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function renderStats(stats) {
    if (!stats) return;
    statEl('statTodaySales', formatCurrency(stats.today_sales_kes));
    statEl('statWeekRevenue', formatCurrency(stats.week_revenue_kes));
    statEl('statMonthRevenue', formatCurrency(stats.month_revenue_kes));
    statEl('statTotalOrders', Number(stats.total_orders || 0).toLocaleString());
    statEl('statAvgOrder', formatCurrency(stats.average_order_value_kes));
    statEl('statNewCustomers', Number(stats.new_customers || 0).toLocaleString());
  }
  async function loadStats() {
    try {
      const response = await fetch(apiUrl('/api/admin/stats'), { credentials: 'include' });
      const data = await response.json();
      if (response.status === 403) { window.location.replace('account.html'); return; }
      if (!response.ok || data.result !== 'success') throw new Error(data.message);
      renderStats(data.stats);
    } catch (error) {
      statEl('statTodaySales', '—');
      if (message) message.textContent = error.message || 'Could not load stats.';
    }
  }

  // ---- Best-selling & low-stock product lists (client-side from product data
  // and order payloads already fetched for the orders view). ----
  function renderProducts(orders) {
    const bestEl = document.getElementById('bestSellers');
    const lowEl = document.getElementById('lowStock');
    const products = window.MISTIZEN_PRODUCTS || [];
    if (!bestEl && !lowEl) return;

    // Aggregate quantities sold per product across all orders.
    const soldByProduct = {};
    (orders || []).forEach(order => {
      let items = [];
      try { items = JSON.parse(order.payload); } catch { items = []; }
      items.forEach(item => {
        const key = item.id || (item.name || '').toString();
        if (!key) return;
        soldByProduct[key] = (soldByProduct[key] || 0) + Number(item.quantity || 1);
      });
    });

    // Best sellers: most units sold first, fall back to stock tag.
    const best = [...products].sort((a, b) => {
      const aSold = soldByProduct[a.id] || 0;
      const bSold = soldByProduct[b.id] || 0;
      if (aSold !== bSold) return bSold - aSold;
      const aBest = (a.tags || []).includes('best-seller') ? 1 : 0;
      const bBest = (b.tags || []).includes('best-seller') ? 1 : 0;
      return bBest - aBest;
    }).slice(0, 5);

    // Low stock: available units below threshold, lowest first.
    const LOW_STOCK_THRESHOLD = 6;
    const low = products.filter(p => p.stock <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.stock - b.stock);

    function productRow(p, meta) {
      const price = p.isOnSale ? p.saleKes : p.baseKes;
      return `<div class="admin-product-row">
        <span class="admin-product-name">${escapeHtml(p.name)}</span>
        <span class="admin-product-meta">${meta}</span>
        <span class="admin-product-price">${formatCurrency(price)}</span>
      </div>`;
    }

    if (bestEl) {
      bestEl.innerHTML = best.length
        ? best.map(p => productRow(p, `${soldByProduct[p.id] || 0} sold · ${p.stock} left`)).join('')
        : '<p class="empty-cart">No product data available.</p>';
    }
    if (lowEl) {
      lowEl.innerHTML = low.length
        ? low.map(p => productRow(p, `${p.stock} left${p.stock <= 3 ? ' · reorder soon' : ''}`)).join('')
        : '<p class="empty-cart">All products are well stocked.</p>';
    }
  }

  // ---- Orders list ----
  function render(orders) {
    renderProducts(orders);
    if (!orders.length) {
      container.innerHTML = '<p class="empty-cart">No orders yet.</p>';
      return;
    }
    container.innerHTML = orders.map(order => {
      let items = [];
      try { items = JSON.parse(order.payload); } catch { items = []; }
      const itemSummary = items.map(item => `${escapeHtml(item.name)} × ${Number(item.quantity || 1)}`).join(', ') || 'Order items unavailable';
      return `<article class="admin-order">
        <div class="admin-order-heading"><strong>Order #${order.id}</strong><span class="order-status">${escapeHtml(readable(order.status))}</span></div>
        <p><b>${escapeHtml(order.username || order.email)}</b><br>${escapeHtml(order.email)}</p>
        <p>${itemSummary}</p>
        <p><b>KSh ${Number(order.total_kes).toLocaleString()}</b> · ${escapeHtml(order.payment_method)}</p>
        <p><b>${escapeHtml(readable(order.delivery_method))} · KSh ${Number(order.delivery_fee_kes || 0).toLocaleString()}</b>${order.delivery_address ? `<br>${escapeHtml(order.delivery_address)}` : ''}</p>
        <label>Order status <select class="order-status-select" data-order-id="${order.id}">${statusOptions.map(status => `<option value="${status}" ${status === order.status ? 'selected' : ''}>${readable(status)}</option>`).join('')}</select></label>
      </article>`;
    }).join('');
    container.querySelectorAll('.order-status-select').forEach(select => select.addEventListener('change', async () => {
      message.textContent = 'Updating order...';
      try {
        const response = await fetch(apiUrl(`/api/admin/orders/${select.dataset.orderId}/status`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status: select.value }) });
        const data = await response.json();
        if (!response.ok || data.result !== 'success') throw new Error(data.message);
        message.textContent = 'Order status updated.';
        loadOrders();
      } catch (error) { message.textContent = error.message || 'Could not update the order.'; }
    }));
  }
  async function loadOrders() {
    try {
      const response = await fetch(apiUrl('/api/admin/orders'), { credentials: 'include' });
      const data = await response.json();
      if (response.status === 403) { window.location.replace('account.html'); return; }
      if (!response.ok || data.result !== 'success') throw new Error(data.message);
      render(data.orders);
      loadStats();
    } catch (error) { message.textContent = error.message || 'Could not load orders.'; }
  }
  loadOrders();
  loadStats();
}

setupAdminDashboard();
