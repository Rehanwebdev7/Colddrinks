# Cold Drinks Shop - Complete Project Documentation

## Overview
**Cold Drinks Shop** is a full-stack e-commerce application for ordering beverages online with an integrated admin panel. It supports user authentication, shopping cart, order management, payment processing (COD + Online/UPI), notifications, and comprehensive admin controls.

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18.2, React Router 6.20, Vite, Axios, Recharts, React Icons, React Hot Toast |
| Backend | PHP (built-in server), Node.js (server.js) |
| Database | **Migrating to Firebase Firestore** (currently JSON flat files) |
| Image Storage | **Google Drive** (URLs stored in Firebase) |
| Auth | JWT (7-day expiry, bcrypt password hashing) |
| Notifications | Firebase Cloud Messaging (FCM) |
| Payment | QR Code based UPI + Cash on Delivery |

---

## Directory Structure

```
cold-drinks-shop/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx            # Product listing, search, categories, recently viewed
│   │   │   ├── ProductDetail.jsx   # Product details, wishlist, sharing
│   │   │   ├── Cart.jsx            # Cart items, checkout, coupon, payment method
│   │   │   ├── MyOrders.jsx        # Order list with filters, cancellation
│   │   │   ├── OrderTracking.jsx   # Order tracking, status timeline, ratings
│   │   │   ├── Profile.jsx         # User profile, address, stats
│   │   │   ├── Wishlist.jsx        # Saved products
│   │   │   ├── UserNotifications.jsx # User notifications
│   │   │   ├── Login.jsx           # Customer login
│   │   │   ├── Register.jsx        # Customer registration
│   │   │   └── AdminLogin.jsx      # Admin login with password reset
│   │   ├── admin/
│   │   │   ├── Dashboard.jsx       # Stats, charts, recent orders, low stock
│   │   │   ├── Products.jsx        # CRUD products, pagination, filters
│   │   │   ├── Orders.jsx          # Order management, status updates, bills
│   │   │   ├── Bills.jsx           # Bill management, PDF download
│   │   │   ├── Payments.jsx        # Payment history, verification
│   │   │   ├── Customers.jsx       # Customer management
│   │   │   ├── Notifications.jsx   # Send notifications to users
│   │   │   ├── Sliders.jsx         # Home page sliders/banners
│   │   │   ├── Categories.jsx      # Product categories management
│   │   │   ├── Coupons.jsx         # Coupon/discount management
│   │   │   ├── AdminProfile.jsx    # Admin profile settings
│   │   │   ├── ThemeConfig.jsx     # Branding, colors, fonts
│   │   │   ├── themeColors.js      # Theme color palette
│   │   │   └── AdminLayout.jsx     # Admin dashboard wrapper
│   │   ├── components/
│   │   │   ├── Navbar.jsx          # Header with search, cart, notifications, dark mode
│   │   │   ├── Footer.jsx          # Footer links, info
│   │   │   ├── ProductCard.jsx     # Product card display
│   │   │   ├── OrderCard.jsx       # Order card display
│   │   │   ├── HeroSlider.jsx      # Home page image slider
│   │   │   ├── BottomNav.jsx       # Mobile bottom navigation
│   │   │   ├── BackToTop.jsx       # Scroll to top button
│   │   │   ├── SideDrawer.jsx      # Mobile menu drawer
│   │   │   ├── AdminSidebar.jsx    # Admin navigation sidebar
│   │   │   ├── Modal.jsx           # Reusable modal dialog
│   │   │   ├── ImageCropModal.jsx  # Image cropping utility
│   │   │   ├── ProtectedRoute.jsx  # Auth-protected routes wrapper
│   │   │   ├── Loader.jsx          # Loading spinner
│   │   │   ├── SkeletonLoader.jsx  # Skeleton loading states
│   │   │   └── StatusBadge.jsx     # Status badge display
│   │   ├── context/
│   │   │   ├── AuthContext.jsx     # Authentication state
│   │   │   ├── CartContext.jsx     # Shopping cart state
│   │   │   ├── ThemeContext.jsx    # Dark/light mode state
│   │   │   └── SettingsContext.jsx # Site settings, branding, colors
│   │   ├── config/
│   │   │   ├── api.js              # Axios instance, interceptors
│   │   │   └── firebaseConfig.js   # Firebase configuration
│   │   ├── App.jsx                 # Route definitions
│   │   ├── main.jsx                # React entry point
│   │   └── index.css               # Global styles
│   ├── package.json
│   └── dist/                       # Built frontend assets
│
└── backend/
    ├── api/
    │   ├── auth/       → register.php, login.php, verify.php
    │   ├── products/   → index.php, add.php, update.php, delete.php
    │   ├── orders/     → index.php, create.php, status.php
    │   ├── cart/       → add.php, get.php, remove.php
    │   ├── bills/      → generate.php, download.php, index.php
    │   ├── dashboard/  → stats.php, charts.php
    │   ├── notifications/ → send.php, list.php, markread.php
    │   └── index.php   # API root docs
    ├── database/       # JSON data files (migrating to Firebase)
    ├── helpers/
    │   ├── response.php   # Standardized JSON responses
    │   ├── auth.php       # JWT creation/verification, bcrypt
    │   └── firebase.php   # FCM notifications
    ├── router.php         # URL routing
    └── server.js          # Node.js server
```

---

## Frontend Routes

### Public
| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Product listing, search, categories |
| `/product/:id` | ProductDetail | Product details, wishlist |
| `/login` | Login | Customer login |
| `/register` | Register | Customer registration |
| `/admin/login` | AdminLogin | Admin login |

### Protected (Customer)
| Route | Page | Description |
|-------|------|-------------|
| `/cart` | Cart | Shopping cart, checkout |
| `/orders` | MyOrders | Order list with filters |
| `/order/:id` | OrderTracking | Order tracking, ratings |
| `/profile` | Profile | User profile, addresses |
| `/wishlist` | Wishlist | Saved products |
| `/notifications` | UserNotifications | Notifications |

### Admin
| Route | Page | Description |
|-------|------|-------------|
| `/admin` | Dashboard | Stats, charts, alerts |
| `/admin/products` | Products | Product CRUD |
| `/admin/orders` | Orders | Order management |
| `/admin/bills` | Bills | Bill management |
| `/admin/payments` | Payments | Payment verification |
| `/admin/customers` | Customers | Customer management |
| `/admin/notifications` | Notifications | Send notifications |
| `/admin/sliders` | Sliders | Banner management |
| `/admin/categories` | Categories | Category management |
| `/admin/coupons` | Coupons | Coupon management |
| `/admin/profile` | AdminProfile | Admin settings |
| `/admin/theme` | ThemeConfig | Branding, colors |

---

## Backend API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login (returns JWT) |
| GET | `/api/auth/verify` | Yes | Verify JWT token |

### Products
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/products` | No | List products (filters: category, search, status) |
| POST | `/api/products/add` | Admin | Create product |
| PUT | `/api/products/update` | Admin | Update product |
| DELETE | `/api/products/delete` | Admin | Delete product |

### Orders
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/orders` | Yes | List orders |
| POST | `/api/orders/create` | Yes | Create order |
| PUT | `/api/orders/:id/status` | Admin | Update status |
| PUT | `/api/orders/:id/cancel` | Yes | Cancel order |
| PUT | `/api/orders/:id/rate` | Yes | Rate order |

### Cart
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/cart` | Yes | Get cart items |
| POST | `/api/cart/add` | Yes | Add to cart |
| DELETE | `/api/cart/remove` | Yes | Remove from cart |

### Bills
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/bills/generate` | Admin | Generate bill |
| GET | `/api/bills/download` | Yes | Download bill PDF |
| GET | `/api/bills` | Admin | List bills |

### Dashboard
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard/stats` | Admin | Statistics |
| GET | `/api/dashboard/charts` | Admin | Chart data |

### Notifications
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | Yes | Get notifications |
| POST | `/api/notifications/send` | Admin | Send notification |
| PUT | `/api/notifications/:id/read` | Yes | Mark as read |

### Others
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/wishlist/*` | Yes | Wishlist operations |
| POST | `/api/coupons/apply` | Yes | Apply coupon |
| GET | `/api/categories` | No | Get categories |
| GET | `/api/settings` | No | Get site settings |
| GET | `/api/sliders` | No | Get home sliders |

---

## Features

### Customer Features
1. **Auth** — Register (name, email, phone, password, address), Login (email/phone), JWT-based sessions
2. **Browse** — Search, filter by category, product details, ratings, recently viewed, related products
3. **Cart** — Add/remove/update qty, persist in localStorage + backend, real-time calculations
4. **Checkout** — Delivery address, payment method (COD/Online), apply coupons, order summary
5. **Orders** — View all/active/delivered/cancelled, track status timeline, cancel, rate (1-5 stars)
6. **Wishlist** — Add/remove products, quick add-to-cart
7. **Notifications** — Order updates, payment updates, mark as read
8. **Dark Mode** — Toggle, persisted in localStorage

### Admin Features
1. **Dashboard** — Metrics (orders, revenue, pending payments, low stock), charts, recent orders
2. **Products** — CRUD, pagination, search, filter by category/stock, image upload with crop
3. **Orders** — View all, update status flow (placed→confirmed→processing→shipped→delivered), reject
4. **Bills** — Generate from orders, download PDF
5. **Payments** — View history, verify pending payments
6. **Customers** — View all, search, view order history, block/unblock
7. **Notifications** — Send direct/broadcast, FCM push
8. **Categories** — CRUD, activate/deactivate
9. **Coupons** — Create (percentage/flat), min order, max discount, usage limits, expiry
10. **Sliders** — Home page banners, image upload, ordering
11. **Theme** — Site name, tagline, colors, fonts, logo, contact info, social links, payment QR

---

## Business Logic

### Cart Calculations
- **Subtotal** = Σ(item.price × item.quantity)
- **Tax** = 18% GST on subtotal
- **Delivery** = Σ(item.deliveryCharge × qty) — FREE if total > ₹500
- **Total** = Subtotal + Tax + Delivery - Coupon Discount

### Order Status Flow
```
Placed → Confirmed → Processing → Shipped → Delivered
  ↓          ↓
Cancelled  Cancelled (only from Placed/Confirmed)
```

### Stock Management
- Decremented on order creation
- Low stock alert when stock < lowStockAlert threshold
- Out of stock when stock = 0

### Payment Flow
- **COD**: Payment status "Pending" until admin marks "Paid"
- **Online (UPI)**: QR code shown → User confirms → Status "Verification Pending" → Admin verifies/rejects

---

## State Management (React Contexts)

| Context | Key State | Methods |
|---------|-----------|---------|
| AuthContext | user, isAuthenticated, loading | login(), register(), logout(), updateProfile() |
| CartContext | items, loading | addToCart(), removeFromCart(), updateQuantity(), clearCart(), getSubtotal(), getTax(), getTotal() |
| ThemeContext | darkMode | toggleTheme() |
| SettingsContext | settings | refreshSettings() |

---

## Image Strategy (NEW — Google Drive)
- All images (products, sliders, logo, QR code) will be uploaded to **Google Drive**
- The returned **Google Drive URL** will be stored in **Firebase Firestore** document fields
- No local image storage — fully cloud-based

---

## Authentication Flow
1. Register/Login → Backend validates → Returns JWT (7-day expiry)
2. Token stored in localStorage (`token` for customer, `adminToken` for admin)
3. Axios interceptor auto-adds `Authorization: Bearer <token>` header
4. On 401 → Token cleared → Redirect to login
5. Admin routes check `role === 'admin'`
