// MISTIZEN catalogue UI. Renders products from products.js and provides:
// search, category menu, filters (price, size, color, availability), sort,
// multiple-photo galleries, sale pricing, stock badges, wishlist,
// quick-view modal with customer reviews and related products.
(function () {
  const PRODUCTS = window.MISTIZEN_PRODUCTS || [];
  const SEED_REVIEWS = window.MISTIZEN_REVIEWS || {};
  const grid = document.getElementById('productGrid');
  if (!grid || !PRODUCTS.length) return;

  // ---- shared state ----
  const state = {
    query: '',
    category: 'All',
    maxPrice: null,
    sizes: [],
    colors: [],
    inStockOnly: false,
    onSaleOnly: false,
    sort: 'featured'
  };

  // ---- carts / wishlist are shared with script.js via localStorage ----
  const CART_KEY = 'mistizenCart';
  const WISH_KEY = 'mistizenWishlist';
  const REVIEW_KEY = 'mistizenReviews';

  function getWishlist() {
    try { return JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); } catch { return []; }
  }
  function setWishlist(list) { localStorage.setItem(WISH_KEY, JSON.stringify(list)); }

  function getAllReviews(productId) {
    const custom = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}');
    const merged = [...(SEED_REVIEWS[productId] || []), ...(custom[productId] || [])];
    return merged;
  }

  // ---- currency formatting (reuse rate objects updated by script.js) ----
  function fmt(amountKes) {
    const sel = window.localStorage.getItem('mistizenCurrency') || 'KES';
    const rates = window.__currencyRates || { KES: 1 };
    const amt = amountKes * (rates[sel] || 1);
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: sel, maximumFractionDigits: 0 }).format(amt);
    } catch { return sel + ' ' + amt.toFixed(0); }
  }

  // ---- filtering / sorting ----
  function matches(p) {
    if (state.category !== 'All' && p.category !== state.category) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      const haystack = (p.name + ' ' + p.category + ' ' + (p.tags || []).join(' ')).toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (state.maxPrice !== null && p.baseKes > state.maxPrice) return false;
    if (state.sizes.length && !(p.sizes || []).some(s => state.sizes.includes(s))) return false;
    if (state.colors.length && !(p.colors || []).some(c => state.colors.includes(c.name))) return false;
    if (state.inStockOnly && !(p.stock > 0)) return false;
    if (state.onSaleOnly && !p.isOnSale) return false;
    return true;
  }

  function sorted(list) {
    const arr = [...list];
    switch (state.sort) {
      case 'price-low': arr.sort((a, b) => a.baseKes - b.baseKes); break;
      case 'price-high': arr.sort((a, b) => b.baseKes - a.baseKes); break;
      case 'rating': arr.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      case 'name': arr.sort((a, b) => a.name.localeCompare(b.name)); break;
      default: arr.sort((a, b) => (b.isOnSale === a.isOnSale ? 0 : b.isOnSale ? 1 : -1));
    }
    return arr;
  }

  // ---- card rendering ----
  function stars(rating) {
    const full = Math.round(rating || 0);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  function cardHTML(p) {
    const wish = getWishlist().includes(p.id);
const price = p.isOnSale ? p.saleKes : p.baseKes;
    const multi = (p.images || []).length > 1;
    return `
      <article class="card" data-id="${p.id}" data-category="${p.category}">
        <div class="frame has-image">
          <div class="placeholder"><span>Product photo</span></div>
          <img class="preview" src="${p.images[0]}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
          ${multi ? `<button class="gallery-arrow gallery-prev" type="button" aria-label="Previous photo">‹</button>
          <button class="gallery-arrow gallery-next" type="button" aria-label="Next photo">›</button>
          <span class="gallery-count" aria-live="polite"></span>` : ''}
          ${p.isOnSale ? `<span class="sale-badge">SALE −${discountPct(p)}%</span>` : ''}
          ${p.stock === 0 ? `<span class="stock-badge out">Sold out</span>` : p.stock <= 5 ? `<span class="stock-badge low">Only ${p.stock} left</span>` : ''}
          <button class="wish-btn ${wish ? 'active' : ''}" type="button" aria-label="${wish ? 'Remove from wishlist' : 'Add to wishlist'}" aria-pressed="${wish}">${wish ? '♥' : '♡'}</button>
        </div>
        <div class="name-row"><p class="name-display">${escapeHtml(p.name)}</p></div>
        <div class="review-line" aria-hidden="true"><span class="star-rating">${stars(p.rating)}</span><span>${p.rating.toFixed(1)} (${p.reviewCount})</span></div>
        <div class="price-row">
          <span class="price-label">Price</span>
          ${p.isOnSale ? `<p class="price-display sale">${fmt(p.saleKes)}</p><span class="compare-at">${fmt(p.compareAtKes)}</span>` : `<p class="price-display">${fmt(p.baseKes)}</p>`}
        </div>
        <div class="controls"><div class="stock"><b class="stockLeft">${p.stock}</b> in stock</div></div>
        <button class="quick-view-btn" type="button">Quick view</button>
      </article>`;
  }

  function discountPct(p) {
    if (!p.compareAtKes || !p.saleKes) return 0;
    return Math.round((1 - p.saleKes / p.compareAtKes) * 100);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#39;' })[c]);
  }

  function renderGrid() {
    const list = sorted(PRODUCTS.filter(matches));
    grid.innerHTML = list.length
      ? list.map(cardHTML).join('')
      : '<p class="empty-cart">No products match your filters.</p>';
    document.getElementById('resultCount').textContent = list.length + ' product' + (list.length === 1 ? '' : 's');
    bindCardEvents();
  }

// ---- per-card behaviour: gallery, wishlist, quick view ----
  function bindCardEvents() {
    grid.querySelectorAll('.card').forEach(card => {
      const id = card.dataset.id;
      const product = PRODUCTS.find(p => p.id === id);
      const preview = card.querySelector('.preview');
      const images = product.images || [];
      let active = 0;

      const prev = card.querySelector('.gallery-prev');
      const next = card.querySelector('.gallery-next');
      const count = card.querySelector('.gallery-count');
      if (prev && next) {
const show = () => {
          preview.src = images[active];
          count.textContent = (active + 1) + ' / ' + images.length;
        };
        prev.addEventListener('click', e => { e.stopPropagation(); active = (active - 1 + images.length) % images.length; show(); });
        next.addEventListener('click', e => { e.stopPropagation(); active = (active + 1) % images.length; show(); });
        if (images.length > 1) count.textContent = '1 / ' + images.length;
}

      const wishBtn = card.querySelector('.wish-btn');
      wishBtn.addEventListener('click', e => {
        e.stopPropagation();
        let list = getWishlist();
        const on = list.includes(id);
        list = on ? list.filter(x => x !== id) : [...list, id];
        setWishlist(list);
        wishBtn.classList.toggle('active', !on);
        wishBtn.textContent = !on ? '♥' : '♡';
        wishBtn.setAttribute('aria-pressed', String(!on));
        wishBtn.setAttribute('aria-label', !on ? 'Remove from wishlist' : 'Add to wishlist');
        renderWishlistDrawer();
      });

      card.querySelector('.quick-view-btn').addEventListener('click', () => openQuickView(product));
    });
  }

// ---- quick-view modal ----
  const modal = document.getElementById('quickView');
  const modalBody = document.getElementById('quickViewBody');
  function openQuickView(product) {
    const reviews = getAllReviews(product.id);
    const related = (product.related || []).map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
    const price = product.isOnSale ? product.saleKes : product.baseKes;
    const sizeOpts = (product.sizes || []).map(s => `<option value="${s}">${s}</option>`).join('');
    const colorOpts = (product.colors || []).map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const reviewHTML = reviews.length
      ? reviews.map(r => `
          <div class="review-item">
            <div class="review-head"><strong>${escapeHtml(r.name)}</strong><span class="star-rating">${stars(r.rating)}</span><span class="review-date">${r.date}</span></div>
            <p>${escapeHtml(r.text)}</p>
          </div>`).join('')
      : '<p class="empty-cart">No reviews yet — be the first to review.</p>';
    const relatedHTML = related.length
      ? `<div class="related-wrap"><h3>You may also like</h3><div class="related-row">${related.map(r => `
          <button class="related-card" data-rel-id="${r.id}">
            <img src="${r.images[0]}" alt="${escapeHtml(r.name)}" loading="lazy">
            <span>${escapeHtml(r.name)}</span>
            <b>${fmt(r.isOnSale ? r.saleKes : r.baseKes)}</b>
          </button>`).join('')}</div></div>`
      : '';

    modalBody.innerHTML = `
      <div class="qv-media">
        <div class="qv-main-frame">
          <img id="qvMain" src="${product.images[0]}" alt="${escapeHtml(product.name)}">
          ${product.isOnSale ? `<span class="sale-badge">SALE −${discountPct(product)}%</span>` : ''}
          <button class="wish-btn ${getWishlist().includes(product.id) ? 'active' : ''}" type="button" aria-label="Toggle wishlist">${getWishlist().includes(product.id) ? '♥' : '♡'}</button>
        </div>
        ${(product.images || []).length > 1 ? `<div class="qv-thumbs">${product.images.map(img => `<button class="qv-thumb" data-src="${img}" style="background-image:url('${img}')"></button>`).join('')}</div>` : ''}
      </div>
      <div class="qv-info">
        <p class="qv-category">${escapeHtml(product.category)}</p>
        <h2 class="qv-name">${escapeHtml(product.name)}</h2>
        <div class="review-line"><span class="star-rating">${stars(product.rating)}</span><span>${product.rating.toFixed(1)} (${product.reviewCount} reviews)</span></div>
        <div class="price-row">
          <span class="price-label">Price</span>
          ${product.isOnSale ? `<p class="price-display sale">${fmt(product.saleKes)}</p><span class="compare-at">${fmt(product.compareAtKes)}</span>` : `<p class="price-display">${fmt(product.baseKes)}</p>`}
        </div>
        <p class="qv-desc">${escapeHtml(product.description)}</p>
        <div class="qv-stock ${product.stock === 0 ? 'out' : ''}">${product.stock === 0 ? 'Out of stock' : product.stock <= 5 ? `Low stock — only ${product.stock} left` : `${product.stock} in stock`}</div>
        <div class="qv-options">
          ${sizeOpts ? `<label>Size<select id="qvSize">${sizeOpts}</select></label>` : ''}
          ${colorOpts ? `<label>Colour<select id="qvColor">${colorOpts}</select></label>` : ''}
          <label>Quantity<div class="stepper"><button class="minus" type="button" aria-label="Decrease quantity">−</button><span class="qty">1</span><button class="plus" type="button" aria-label="Increase quantity">+</button></div></label>
        </div>
        <button class="add-btn qv-add" type="button" ${product.stock === 0 ? 'disabled' : ''}>Add to cart</button>
        <div class="qv-reviews">
          <h3>Customer reviews</h3>
          ${reviewHTML}
          <form class="review-form">
            <input name="name" placeholder="Your name" required>
            <div class="review-star-picker" role="radiogroup" aria-label="Rating">
              ${[1,2,3,4,5].map(n => `<button type="button" data-val="${n}" aria-label="${n} star${n>1?'s':''}">★</button>`).join('')}
            </div>
            <textarea name="text" placeholder="Share your thoughts..." required></textarea>
            <button type="submit" class="review-submit">Submit review</button>
          </form>
        </div>
        ${relatedHTML}
      </div>`;

    modal.classList.add('open');
    document.body.classList.add('modal-open');

// gallery thumbs
    const qvMain = modalBody.querySelector('#qvMain');
    modalBody.querySelectorAll('.qv-thumb').forEach(t => t.addEventListener('click', () => { qvMain.src = t.dataset.src; }));
    // wishlist in modal
    const wishBtn = modalBody.querySelector('.qv-main-frame .wish-btn');
    wishBtn.addEventListener('click', () => {
      let list = getWishlist();
      const on = list.includes(product.id);
      list = on ? list.filter(x => x !== product.id) : [...list, product.id];
      setWishlist(list);
      wishBtn.classList.toggle('active', !on);
      wishBtn.textContent = !on ? '♥' : '♡';
      renderWishlistDrawer();
    });
    // qty stepper
    const minus = modalBody.querySelector('.minus');
    const plus = modalBody.querySelector('.plus');
    const qtyEl = modalBody.querySelector('.qty');
    let qty = 1;
    minus.addEventListener('click', () => { if (qty > 1) { qty--; qtyEl.textContent = qty; } });
    plus.addEventListener('click', () => { if (qty < product.stock) { qty++; qtyEl.textContent = qty; } });
    // add to cart
    modalBody.querySelector('.qv-add').addEventListener('click', () => {
      const size = modalBody.querySelector('#qvSize')?.value || '';
      const color = modalBody.querySelector('#qvColor')?.value || '';
      const item = { id: product.id, name: product.name, price: price, quantity: qty, size, color, image: product.images[0] };
      const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      const existing = cart.find(i => i.id === product.id && i.size === size && i.color === color);
      if (existing) existing.quantity += qty; else cart.push(item);
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      const btn = modalBody.querySelector('.qv-add');
      btn.textContent = '✓ Added to cart';
      btn.classList.add('added');
      setTimeout(() => { btn.textContent = 'Add to cart'; btn.classList.remove('added'); }, 1200);
      refreshWishlistCartCount();
    });

    // review form
    const form = modalBody.querySelector('.review-form');
    let pickedRating = 0;
    const starBtns = modalBody.querySelectorAll('.review-star-picker button');
    starBtns.forEach(b => b.addEventListener('click', () => {
      pickedRating = Number(b.dataset.val);
      starBtns.forEach(s => s.classList.toggle('picked', Number(s.dataset.val) <= pickedRating));
    }));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = form.querySelector('input[name=name]').value.trim();
      const text = form.querySelector('textarea[name=text]').value.trim();
      if (!pickedRating || !name || !text) return;
      const all = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}');
      all[product.id] = all[product.id] || [];
      all[product.id].push({ name, rating: pickedRating, date: new Date().toISOString().slice(0, 10), text });
      localStorage.setItem(REVIEW_KEY, JSON.stringify(all));
      form.reset();
      openQuickView(product);
    });

    // related products
    modalBody.querySelectorAll('.related-card').forEach(rc => rc.addEventListener('click', () => {
      const rel = PRODUCTS.find(p => p.id === rc.dataset.relId);
      if (rel) openQuickView(rel);
    }));
  }

  function closeQuickView() {
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
  }
  modal.querySelector('.qv-close').addEventListener('click', closeQuickView);
  modal.addEventListener('click', e => { if (e.target === modal) closeQuickView(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeQuickView(); });

  // ---- wishlist drawer ----
  const drawer = document.getElementById('wishlistDrawer');
  const drawerList = document.getElementById('wishlistItems');
  const drawerCount = document.getElementById('wishlistCount');
  function renderWishlistDrawer() {
    const list = getWishlist();
    if (drawerCount) drawerCount.textContent = list.length;
    if (!drawerList) return;
    if (!list.length) { drawerList.innerHTML = '<p class="empty-cart">Your wishlist is empty.</p>'; return; }
    drawerList.innerHTML = list.map(id => {
      const p = PRODUCTS.find(x => x.id === id);
      if (!p) return '';
      return `
        <div class="wish-item">
          <img src="${p.images[0]}" alt="${escapeHtml(p.name)}">
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <span>${fmt(p.isOnSale ? p.saleKes : p.baseKes)}</span>
          </div>
          <button class="wish-view" data-id="${p.id}">View</button>
          <button class="wish-remove" data-id="${p.id}" aria-label="Remove">×</button>
        </div>`;
    }).join('');
    drawerList.querySelectorAll('.wish-view').forEach(b => b.addEventListener('click', () => {
      openQuickView(PRODUCTS.find(p => p.id === b.dataset.id));
    }));
    drawerList.querySelectorAll('.wish-remove').forEach(b => b.addEventListener('click', () => {
      setWishlist(getWishlist().filter(x => x !== b.dataset.id));
      renderWishlistDrawer();
    }));
  }
  function openDrawer() { drawer.classList.add('open'); document.body.classList.add('modal-open'); }
  function closeDrawer() { drawer.classList.remove('open'); document.body.classList.remove('modal-open'); }
  document.getElementById('wishlistToggle').addEventListener('click', openDrawer);
  drawer.querySelector('.wishlist-close').addEventListener('click', closeDrawer);
  drawer.querySelector('.drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  renderWishlistDrawer();

  // badge in nav cart count
  function refreshWishlistCartCount() {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    const total = cart.reduce((s, i) => s + (i.quantity || 1), 0);
    const cartBadge = document.getElementById('cartCountBadge');
    if (cartBadge) cartBadge.textContent = total;
    const wishBadge = document.getElementById('wishlistCount');
    if (wishBadge) wishBadge.textContent = getWishlist().length;
  }
  refreshWishlistCartCount();

  // ---- controls wiring ----
  const queryInput = document.getElementById('searchInput');
  queryInput.addEventListener('input', () => { state.query = queryInput.value.trim(); renderGrid(); });

  const categorySelect = document.getElementById('categorySelect');
  function renderCategories() {
    const cats = window.getMistizenCategories();
    categorySelect.innerHTML = '<option value="All">All categories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  renderCategories();
  categorySelect.addEventListener('change', () => { state.category = categorySelect.value; renderGrid(); });

  const maxPrice = document.getElementById('priceFilter');
  const priceLabel = document.getElementById('priceFilterLabel');
  // Price slider operates on the selected currency so its range, step and
  // label follow the currency switcher. state.maxPrice is always stored in
  // KES so filtering stays consistent regardless of display currency.
  const PRICE_MIN_KES = 500;
  const PRICE_MAX_KES = 2000;
  const PRICE_STEP_KES = 50;
  function getCurrencyRate() {
    const sel = window.localStorage.getItem('mistizenCurrency') || 'KES';
    const rates = window.__currencyRates || { KES: 1 };
    return rates[sel] || 1;
  }
  function syncPriceFilterToCurrency() {
    const rate = getCurrencyRate();
    const step = Math.max(1, Math.round(PRICE_STEP_KES * rate));
    maxPrice.min = Math.max(0, Math.round(PRICE_MIN_KES * rate));
    maxPrice.max = Math.round(PRICE_MAX_KES * rate);
    maxPrice.step = step;
    if (maxPrice.value) {
      // Rebase the current KES threshold into the new display range.
      const kes = state.maxPrice !== null ? state.maxPrice : PRICE_MAX_KES;
      maxPrice.value = String(Math.min(maxPrice.max, Math.max(maxPrice.min, Math.round(kes * rate))));
      priceLabel.textContent = 'Max: ' + fmt(kes);
    } else {
      priceLabel.textContent = 'Max: All';
    }
  }
  maxPrice.addEventListener('input', () => {
    if (!maxPrice.value) { state.maxPrice = null; priceLabel.textContent = 'Max: All'; renderGrid(); return; }
    const rate = getCurrencyRate();
    // Convert the displayed currency slider value back into KES for filtering.
    state.maxPrice = rate ? Math.round(Number(maxPrice.value) / rate) : Number(maxPrice.value);
    priceLabel.textContent = 'Max: ' + fmt(state.maxPrice);
    renderGrid();
  });
  // Keep the slider in sync whenever the currency switcher or live rates change.
  window.addEventListener('mistizenCurrencyChange', syncPriceFilterToCurrency);

  document.querySelectorAll('.size-filter input').forEach(cb => cb.addEventListener('change', updateFilters));
  document.querySelectorAll('.color-filter input').forEach(cb => cb.addEventListener('change', updateFilters));
  document.getElementById('inStockFilter').addEventListener('change', updateFilters);
  document.getElementById('onSaleFilter').addEventListener('change', updateFilters);

  function updateFilters() {
    state.sizes = [...document.querySelectorAll('.size-filter input:checked')].map(i => i.value);
    state.colors = [...document.querySelectorAll('.color-filter input:checked')].map(i => i.value);
    state.inStockOnly = document.getElementById('inStockFilter').checked;
    state.onSaleOnly = document.getElementById('onSaleFilter').checked;
    renderGrid();
  }

  const sortSelect = document.getElementById('sortSelect');
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; renderGrid(); });

  document.getElementById('clearFilters').addEventListener('click', () => {
    queryInput.value = '';
    state.query = '';
    categorySelect.value = 'All';
    state.category = 'All';
    maxPrice.value = '';
    priceLabel.textContent = 'Max: All';
    state.maxPrice = null;
    document.querySelectorAll('.size-filter input').forEach(i => i.checked = false);
    document.querySelectorAll('.color-filter input').forEach(i => i.checked = false);
    document.getElementById('inStockFilter').checked = false;
    document.getElementById('onSaleFilter').checked = false;
    sortSelect.value = 'featured';
    state.sizes = []; state.colors = []; state.inStockOnly = false; state.onSaleOnly = false; state.sort = 'featured';
    renderGrid();
  });

  // mobile filter toggle
  const filterToggle = document.getElementById('filterToggle');
  const filterPanel = document.getElementById('filterPanel');
  if (filterToggle && filterPanel) {
    filterToggle.addEventListener('click', () => filterPanel.classList.toggle('open'));
  }

  // expose for currency switcher re-render
  window.renderMistizenGrid = renderGrid;

  renderGrid();
})();
