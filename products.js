// MISTIZEN product catalog data model.
// Client-side catalogue data so search/filters/categories can run instantly,
// mirroring the existing client-side cart architecture. Product prices are in
// Kenyan Shillings (KES) and converted at display time by script.js.
window.MISTIZEN_PRODUCTS = [
  {
    id: 'mistizen-white',
    name: 'MISTIZEN White Graphic Tee',
    category: 'Graphic Tees',
    baseKes: 1200,
    compareAtKes: 1600,
    saleKes: 1200,
    isOnSale: true,
    stock: 12,
    description: 'Our signature white graphic tee — a clean, breathable canvas for the MISTIZEN print. Cut for a relaxed everyday fit with a soft hand-feel.',
    images: [
      'assets/products/mistizen-white-studio.jpg',
      'assets/products/mistizen-white-worn.jpg',
      'assets/products/mistizen-white-flatlay.jpg',
      'assets/products/mistizen-white-back.jpg'
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [
      { name: 'White', swatch: '#f5f2ea' },
      { name: 'Black', swatch: '#10100f' }
    ],
    tags: ['best-seller', 'essentials'],
    rating: 4.8,
    reviewCount: 23,
    related: ['mistizen-white-worn', 'mistizen-black', 'strike-bandit-white']
  },
  {
    id: 'mistizen-white-worn',
    name: 'MISTIZEN White Worn-In Tee',
    category: 'Graphic Tees',
    baseKes: 1200,
    saleKes: 1200,
    isOnSale: false,
    stock: 8,
    description: 'The same MISTIZEN print in a worn-in silhouette — styled loose and layered, perfect for everyday comfort with a lived-in look.',
    images: [
      'assets/products/mistizen-white-worn.jpg',
      'assets/products/mistizen-white-studio.jpg',
      'assets/products/mistizen-white-back.jpg'
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [{ name: 'White', swatch: '#f5f2ea' }],
    tags: ['essentials'],
    rating: 4.6,
    reviewCount: 14,
    related: ['mistizen-white', 'mistizen-black', 'strike-bandit-black']
  },
  {
    id: 'mistizen-black',
    name: 'MISTIZEN Black Graphic Tee',
    category: 'Graphic Tees',
    baseKes: 1200,
    compareAtKes: 1500,
    saleKes: 1200,
    isOnSale: false,
    stock: 15,
    description: 'A bold black graphic tee with the MISTIZEN print on the back. Dark, sharp, and versatile — a statement piece that matches anything.',
    images: [
      'assets/products/mistizen-black-back.jpg',
      'assets/products/mistizen-white-flatlay.jpg',
      'assets/products/mistizen-white-studio.jpg'
    ],
    sizes: ['M', 'L', 'XL', 'XXL'],
    colors: [{ name: 'Black', swatch: '#10100f' }],
    tags: ['limited'],
    rating: 4.7,
    reviewCount: 19,
    related: ['mistizen-white', 'strike-bandit-black']
  },
  {
    id: 'mistizen-white-back',
    name: 'MISTIZEN White Backprint Tee',
    category: 'Limited Drops',
    baseKes: 1200,
    saleKes: 1200,
    isOnSale: false,
    stock: 6,
    description: 'Studio-shot edition featuring a full back print. Iconic MISTIZEN lettering with a crisp white finish — a collector favourite.',
    images: [
      'assets/products/mistizen-white-back.jpg',
      'assets/products/mistizen-white-studio.jpg',
      'assets/products/mistizen-white-flatlay.jpg'
    ],
    sizes: ['S', 'M', 'L'],
    colors: [{ name: 'White', swatch: '#f5f2ea' }],
    tags: ['limited'],
    rating: 4.9,
    reviewCount: 11,
    related: ['mistizen-white', 'mistizen-black', 'strike-bandit-white']
  },
  {
    id: 'strike-bandit-black',
    name: 'Strike Bandit Black Edition',
    category: 'Limited Drops',
    baseKes: 1200,
    compareAtKes: 1400,
    saleKes: 900,
    isOnSale: true,
    stock: 4,
    description: 'The Strike Bandit black edition — a dark, edgy drop with the signature bandit artwork. Limited quantities available.',
    images: [
      'assets/products/strike-bandit-black.jpg',
      'assets/products/strike-bandit-white.jpg',
      'assets/products/mistizen-black-back.jpg'
    ],
    sizes: ['M', 'L', 'XL'],
    colors: [{ name: 'Black', swatch: '#10100f' }],
    tags: ['sale', 'limited'],
    rating: 4.5,
    reviewCount: 9,
    related: ['strike-bandit-white', 'mistizen-black']
  },
  {
    id: 'strike-bandit-white',
    name: 'Strike Bandit White Edition',
    category: 'Limited Drops',
    baseKes: 1200,
    saleKes: 1200,
    isOnSale: false,
    stock: 10,
    description: 'The Strike Bandit white edition — clean and graphic with the bandit artwork taking centre stage. A bold everyday essential.',
    images: [
      'assets/products/strike-bandit-white.jpg',
      'assets/products/strike-bandit-black.jpg',
      'assets/products/mistizen-white-flatlay.jpg'
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [{ name: 'White', swatch: '#f5f2ea' }],
    tags: ['best-seller'],
    rating: 4.7,
    reviewCount: 17,
    related: ['strike-bandit-black', 'mistizen-white']
  }
];

// Seeded customer reviews shared across the catalogue. Ratings are 1–5 stars.
window.MISTIZEN_REVIEWS = {
  'mistizen-white': [
    { name: 'Amani K.', rating: 5, date: '2024-11-02', text: 'Perfect fit and the print looks even better in person. Really premium quality.' },
    { name: 'Grace W.', rating: 4, date: '2024-10-18', text: 'Love the fit, very comfortable fabric. Runs slightly big for me but still great.' },
    { name: 'Brian O.', rating: 5, date: '2024-09-30', text: 'My new favourite tee. Delivery to Nairobi was quick.' }
  ],
  'mistizen-white-worn': [
    { name: 'Diana M.', rating: 5, date: '2024-10-05', text: 'The worn-in look is awesome — soft from the first wear.' },
    { name: 'Kevin R.', rating: 4, date: '2024-09-12', text: 'Great quality cotton. Would buy again.' }
  ],
  'mistizen-black': [
    { name: 'Sam T.', rating: 5, date: '2024-11-15', text: 'Black tee hits different. Bold print, sturdy stitching.' },
    { name: 'Leah N.', rating: 4, date: '2024-10-22', text: 'Nice dark shade, fits true to size.' }
  ],
  'mistizen-white-back': [
    { name: 'Miguel A.', rating: 5, date: '2024-12-01', text: 'Back print is clean and sharp. Studio quality is unmatched.' },
    { name: 'Faith J.', rating: 5, date: '2024-11-08', text: 'Collector edition — glad I grabbed it before it sold out.' }
  ],
  'strike-bandit-black': [
    { name: 'Chris B.', rating: 4, date: '2024-09-25', text: 'Bold artwork, great for casual fits.' },
    { name: 'Zara K.', rating: 5, date: '2024-09-02', text: 'The drop was worth the wait. Excellent quality.' }
  ],
  'strike-bandit-white': [
    { name: 'Paul M.', rating: 5, date: '2024-10-30', text: 'Clean white with striking print. Got lots of compliments.' },
    { name: 'Nancy A.', rating: 4, date: '2024-10-12', text: 'Very comfortable, nice and roomy.' }
  ]
};

// Helpers used by catalog.js for the product grid and quick view.
window.getMistizenCategories = function () {
  return [...new Set(MISTIZEN_PRODUCTS.map(function (p) { return p.category; }))];
};

window.getAllSizes = function () {
  const set = new Set();
  MISTIZEN_PRODUCTS.forEach(function (p) { (p.sizes || []).forEach(function (s) { set.add(s); }); });
  return [...set];
};

window.getAllColors = function () {
  const set = new Set();
  MISTIZEN_PRODUCTS.forEach(function (p) {
    (p.colors || []).forEach(function (c) { set.add(c.name); });
  });
  return [...set];
};

