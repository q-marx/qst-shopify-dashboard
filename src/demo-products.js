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
