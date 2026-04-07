# Firebase Firestore — Collection Structure

> **Project:** noor-coldrinks
> **Architecture:** Node.js REST API backend with Firestore as primary database
> **Design:** Flat collections (no unnecessary subcollections) — optimized for server-side API access

---

## Collection Map

```
firestore-root/
├── users/              # All users (customers + admins)
│   └── {USR-001}       # Document ID = user ID
├── products/           # All products
│   └── {PRD-001}
├── categories/         # Product categories
│   └── {CAT-001}
├── orders/             # All orders (statusHistory as array field)
│   └── {ORD-001}
├── cart/               # User carts (one doc per user)
│   └── {USR-001}       # Document ID = userId
├── bills/              # Generated invoices
│   └── {BILL-001}
├── coupons/            # Discount coupons
│   └── {CPN-001}
├── notifications/      # All notifications (filtered by targetUserId)
│   └── {NOTIF-001}
├── paymentHistory/     # Payment transaction log
│   └── {PH-001}
├── paymentRequests/    # Customer clearance requests
│   └── {PREQ-001}
├── sliders/            # Homepage banners
│   └── {SLD-001}
├── wishlist/           # User wishlists
│   └── {WL-001}
└── settings/
    └── app             # Single document: app config + Google Drive token
```

---

## Why Flat Collections (Not Subcollections)

- Backend API handles all logic — clients don't access Firestore directly
- Simpler queries, no collection group queries needed
- Small arrays (addresses, cart items, statusHistory) fit easily inside documents
- Easier to debug, maintain, and export
- Firestore 1MB document limit is never a concern for this data

---

## Collections

### `users/{userId}`
```javascript
{
  id: "USR-001",
  name: "Rajesh Kumar",
  email: "admin@cooldrinks.com",
  phone: "+919876543210",
  password: "sha256-hash",
  role: "admin",                    // "admin" | "customer"
  status: "active",                 // "active" | "blocked"
  addresses: [                      // Array of addresses (not subcollection)
    { type: "office", label: "Warehouse", street: "...", city: "...", state: "...", pincode: "...", isDefault: true }
  ],
  wallet: 0,
  outstanding: 0,                   // Outstanding balance for COD orders
  fcmToken: "...",
  createdAt: "ISO-string"
}
```

### `products/{productId}`
```javascript
{
  id: "PRD-002",
  name: "Pepsi",
  category: "Soft Drinks",
  description: "Pepsi 300ml glass bottles...",
  boxQuantity: 24,
  pricePerBox: 460,
  mrp: 552,
  stockQuantity: 108,
  lowStockAlert: 20,
  image: "/images/pepsi.svg",       // Or Google Drive URL
  gstPercent: 18,
  deliveryCharge: 0,
  volume: 300,
  rating: 4.3,
  totalReviews: 189,
  status: "active"                  // "active" | "out_of_stock"
}
```

### `categories/{categoryId}`
```javascript
{
  id: "CAT-001",
  name: "Soft Drinks",
  status: "active",
  createdAt: "ISO-string"
}
```

### `orders/{orderId}`
```javascript
{
  id: "ORD-001",
  orderNumber: "ORD-1001",
  userId: "USR-002",
  customerName: "Amit Sharma",
  customerPhone: "+919823456789",
  deliveryAddress: { street, city, state, pincode },
  orderDate: "ISO-string",
  items: [
    { productId: "PRD-001", name: "Coca-Cola", image: "...", quantity: 2, price: 480, gstPercent: 18, deliveryCharge: 0 }
  ],
  subtotal: 3600,
  tax: 648,
  deliveryCharge: 0,
  total: 4248,
  orderStatus: "Delivered",         // Placed | Confirmed | Processing | Shipped | Delivered | Cancelled
  paymentStatus: "Paid",            // Pending | Paid | Verification Pending | Rejected
  paymentMethod: "COD",             // COD | Online
  statusHistory: [                  // Array (not subcollection)
    { status: "Placed", timestamp: "ISO-string" },
    { status: "Delivered", timestamp: "ISO-string" }
  ],
  rating: { score: 5, comment: "...", ratedAt: "ISO-string", ratedBy: "USR-002" },
  updatedAt: "ISO-string"
}
```

### `cart/{userId}`
```javascript
{
  userId: "USR-002",
  items: [
    { productId: "PRD-001", name: "Coca-Cola", quantity: 3, pricePerBox: 480, image: "..." }
  ]
}
```

### `bills/{billId}`
```javascript
{
  id: "BILL-001",
  billNumber: "BILL-2001",
  orderId: "ORD-001",
  userId: "USR-002",
  customerName: "Amit Sharma",
  billDate: "ISO-string",
  items: [ { productId, name, quantity, price, amount } ],
  subtotal: 3600,
  gst: 648,
  total: 4248,
  paymentStatus: "Paid",
  pdfUrl: "/bills/BILL-2001.pdf"
}
```

### `coupons/{couponId}`
```javascript
{
  id: "CPN-001",
  code: "SUMMER20",
  discountType: "percentage",       // "percentage" | "flat"
  discountValue: 20,
  minOrderAmount: 500,
  maxDiscount: 200,
  expiryDate: "ISO-string",
  usageLimit: 100,
  usedCount: 5,
  active: true,
  createdAt: "ISO-string"
}
```

### `notifications/{notificationId}`
```javascript
{
  id: "NOTIF-001",
  type: "order",                    // "order" | "payment" | "stock" | "general"
  title: "Order Delivered",
  message: "Your order ORD-1001 has been delivered.",
  image: "",
  targetUserId: "USR-002",          // null = broadcast to all
  isRead: false,
  createdAt: "ISO-string"
}
```

### `paymentHistory/{paymentId}`
```javascript
{
  id: "PH-001",
  userId: "USR-012",
  type: "debit",                    // "debit" | "credit" | "rejected"
  amount: 1274.40,
  description: "Order ORD-1032 delivered (COD) - added to outstanding",
  orderId: "ORD-032",
  createdAt: "ISO-string"
}
```

### `paymentRequests/{requestId}`
```javascript
{
  id: "PREQ-001",
  userId: "USR-012",
  userName: "Rehan Shaikh",
  userPhone: "1212121212",
  amount: 99.40,
  status: "approved",               // "pending" | "approved" | "rejected"
  createdAt: "ISO-string",
  updatedAt: "ISO-string"
}
```

### `sliders/{sliderId}`
```javascript
{
  id: "SLD-001",
  image: "https://lh3.googleusercontent.com/d/{fileId}",
  driveFileId: "google-drive-file-id",
  title: "Summer Sale!",
  subtitle: "Get 30% off",
  link: "/products?category=Soft Drinks",
  active: true,
  order: 1,
  createdAt: "ISO-string"
}
```

### `wishlist/{wishlistId}`
```javascript
{
  id: "WL-001",
  userId: "USR-002",
  productId: "PRD-002",
  addedAt: "ISO-string"
}
```

### `settings/app` (Single Document)
```javascript
{
  // App settings
  siteName: "Royal Cold Drinks",
  siteTagline: "...",
  colors: { primary: "#E23744", ... },
  contact: { address: "...", phone: "...", email: "..." },
  policies: { privacy: "...", terms: "...", refund: "..." },
  taxPercent: 18,

  // Google Drive integration (managed by frontend)
  driveRefreshToken: "stored-by-frontend-useDrive-hook",

  updatedAt: "ISO-string"
}
```

---

## Google Drive Integration

- Images uploaded from frontend directly to Google Drive via OAuth 2.0
- Drive folder: `1Rw05a5FRqOkFqt4B0W9eIF8NMQ20jsLA`
- Subfolders: `products/`, `sliders/`, `logos/`, `payment-qr/`
- Public URLs: `https://lh3.googleusercontent.com/d/{fileId}`
- Refresh token stored in `settings/app.driveRefreshToken` (Firestore)
