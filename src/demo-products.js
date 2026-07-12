export const demoProducts = [
  {
    id: "demo-1",
    title: "Handmade Jesmonite Skull Candle Holder 12cm x 8cm",
    handle: "handmade-jesmonite-skull-candle-holder",
    status: "ACTIVE",
    vendor: "Q-MER.CH Demo",
    productType: "Home Decor",
    tags: ["handmade", "jesmonite", "gothic", "home decor"],
    description:
      "Handmade jesmonite skull candle holder with a smooth sealed finish. Ideal for home decor, gothic styling, and gift listings.",
    imageUrl:
      "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?auto=format&fit=crop&w=400&q=80",
    variants: [
      {
        id: "demo-variant-1",
        title: "Default Title",
        sku: "QST-SKULL-001",
        price: "18.00",
        inventoryQuantity: 8,
        selectedOptions: []
      }
    ],
    updatedAt: "2026-06-03T12:00:00Z"
  },
  {
    id: "demo-2",
    title: "Vintage Style Floral T-Shirt Multiple Colours",
    handle: "vintage-style-floral-t-shirt",
    status: "ACTIVE",
    vendor: "Q-MER.CH Demo",
    productType: "Apparel",
    tags: ["t-shirt", "floral", "vintage", "summer"],
    description:
      "Soft cotton t-shirt with a vintage floral print. Available in multiple colour and size combinations.",
    imageUrl:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=80",
    variants: [
      {
        id: "demo-variant-2a",
        title: "Black / S",
        sku: "TEE-FLR-BLK-S",
        price: "22.00",
        inventoryQuantity: 4,
        selectedOptions: [
          { name: "Colour", value: "Black" },
          { name: "Size", value: "S" }
        ]
      },
      {
        id: "demo-variant-2b",
        title: "Black / M",
        sku: "TEE-FLR-BLK-M",
        price: "22.00",
        inventoryQuantity: 6,
        selectedOptions: [
          { name: "Colour", value: "Black" },
          { name: "Size", value: "M" }
        ]
      },
      {
        id: "demo-variant-2c",
        title: "Cream / M",
        sku: "TEE-FLR-CRM-M",
        price: "22.00",
        inventoryQuantity: 3,
        selectedOptions: [
          { name: "Colour", value: "Cream" },
          { name: "Size", value: "M" }
        ]
      }
    ],
    updatedAt: "2026-06-02T09:30:00Z"
  },
  {
    id: "demo-3",
    title: "Personalised Ceramic Mug",
    handle: "personalised-ceramic-mug",
    status: "DRAFT",
    vendor: "Q-MER.CH Demo",
    productType: "Kitchenware",
    tags: ["mug", "personalised", "gift"],
    description: "",
    imageUrl: "",
    variants: [
      {
        id: "demo-variant-3",
        title: "Default Title",
        sku: "",
        price: "12.00",
        inventoryQuantity: 0,
        selectedOptions: []
      }
    ],
    updatedAt: "2026-06-01T16:15:00Z"
  }
];

const screenshotCatalog = [
  ["Handcrafted Interlocking Heart Sculpture - Lilac/Plum, Gold Leaf, Jesmonite", "Home Decor", "QST-HEART", "29.99", "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?auto=format&fit=crop&w=400&q=80"],
  ["Large Handcrafted Skull Ornament - Jesmonite and Epoxy Resin", "Home Decor", "QST-SKULL", "34.99", "https://images.unsplash.com/photo-1604200213928-ba3cf4fc8436?auto=format&fit=crop&w=400&q=80"],
  ["Handmade Jesmonite Bee Coaster Set with Holder", "Home Decor", "QST-BEE", "18.00", "https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?auto=format&fit=crop&w=400&q=80"],
  ["Set of 3 Purple Bronze Abstract Jesmonite Figurine Ornaments", "Home Decor", "QST-FIG", "42.00", "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=400&q=80"],
  ["Minimalist Concrete Desk Planter with Drainage Tray", "Garden and Patio", "QST-PLANT", "16.50", "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=400&q=80"],
  ["Botanical Wax Melt Gift Box with Floral Notes", "Home Fragrance", "QST-WAX", "14.00", "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=400&q=80"],
  ["Ceramic Trinket Dish with Gold Accent Rim", "Home Decor", "QST-DISH", "12.50", "https://images.unsplash.com/photo-1610701596061-2ecf227e85b2?auto=format&fit=crop&w=400&q=80"],
  ["Modern Terrazzo Tea Light Holder Pair", "Home Decor", "QST-TEA", "19.95", "https://images.unsplash.com/photo-1604014237800-1c9102c219da?auto=format&fit=crop&w=400&q=80"],
  ["Botanical Print Cotton Tote Bag", "Bags", "QST-TOTE", "15.99", "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=400&q=80"],
  ["Hand Poured Soy Candle in Amber Glass", "Home Fragrance", "QST-CANDLE", "21.00", "https://images.unsplash.com/photo-1608181831718-c9ffd8d2cf1c?auto=format&fit=crop&w=400&q=80"],
  ["Monochrome Ceramic Mug Gift Set", "Kitchenware", "QST-MUG", "24.00", "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=400&q=80"],
  ["Vintage Floral T-Shirt", "Apparel", "QST-TEE", "22.00", "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=80"],
  ["Leather Effect Crossbody Handbag", "Bags", "QST-BAG", "38.00", "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=400&q=80"],
  ["Sterling Silver Moon Pendant Necklace", "Jewellery", "QST-MOON", "31.00", "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80"],
  ["Aromatherapy Bath Salt Jar", "Health and Beauty", "QST-BATH", "13.50", "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=400&q=80"]
];

export const screenshotProducts = Array.from({ length: 50 }, (_, index) => {
  const [baseTitle, productType, skuPrefix, price, imageUrl] = screenshotCatalog[index % screenshotCatalog.length];
  const number = String(index + 1).padStart(2, "0");
  const reviewProduct = index >= 41;
  const variantCount = index < 11 ? 2 : 1;
  const title = index < screenshotCatalog.length ? baseTitle : `${baseTitle} ${Math.floor(index / screenshotCatalog.length) + 1}`;
  const variants = Array.from({ length: variantCount }, (_, variantIndex) => {
    const option = variantCount > 1 ? (variantIndex === 0 ? "Standard" : "Gift boxed") : "";
    return {
      id: `screenshot-variant-${number}-${variantIndex + 1}`,
      title: option || "Default Title",
      sku: reviewProduct ? "" : `${skuPrefix}-${number}${variantCount > 1 ? `-${variantIndex + 1}` : ""}`,
      price,
      inventoryQuantity: 6 + ((index + variantIndex) % 12),
      selectedOptions: option ? [{ name: "Finish", value: option }] : []
    };
  });

  return {
    id: `screenshot-${number}`,
    title,
    handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    status: "ACTIVE",
    vendor: "Q-MER.CH Demo",
    productType,
    tags: [productType.toLowerCase(), "marketplace-ready", "qst-demo"],
    description: `${title} prepared as sample product data for QST App Store screenshots.`,
    imageUrl,
    images: [{ url: imageUrl, altText: title }],
    variants,
    updatedAt: `2026-07-${String((index % 9) + 1).padStart(2, "0")}T10:00:00Z`
  };
});
