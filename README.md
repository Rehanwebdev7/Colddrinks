# Cold Drinks Shop - Full Stack E-Commerce Application

A complete full-stack e-commerce web application for a cold drinks / beverages shop with a customer-facing storefront and a powerful admin panel. Built with **React.js** (Frontend) and **Node.js** (Backend).

**DEVELOPED by REHAN & PARVEZ**

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Default Logins](#default-logins)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Admin Panel](#admin-panel)
- [Customer Panel](#customer-panel)
- [Order & Payment Flow](#order--payment-flow)

---

## Features

### Customer Side
- User registration & login (JWT based authentication)
- Browse products with category filter & search
- Product detail page
- Add to cart, update quantity, remove items
- Place orders (COD & Online payment)
- Order tracking with real-time status timeline
- Notifications (order updates, payment alerts)
- Profile management with multiple delivery addresses
- Payment summary & outstanding balance
- Payment clearance requests
- Dark / Light theme support

### Admin Panel
- Dashboard with KPIs, charts & analytics (Recharts)
- Product management (CRUD with image upload)
- Category management
- Order management with status updates (Placed > Confirmed > Processing > Shipped > Delivered)
- Customer management (view, block/unblock)
- Payment management (record payments, verify online payments, outstanding tracking)
- Online payment history with accept/reject timestamps
- Bill/Invoice generation (GST compliant)
- Notification system (send to all users or specific user by name/phone/email)
- Homepage slider management
- Theme/Color customization
- Admin profile & settings

### Security
- JWT token based authentication (7 day expiry)
- SHA-256 password hashing
- Role based access control (admin / customer)
- Protected routes on frontend & backend
- Forgot password with email + phone verification

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18.2.0 | UI Framework |
| Vite | 5.4.21 | Build Tool & Dev Server |
| React Router DOM | 6.20.0 | Client-side Routing |
| Axios | 1.6.0 | HTTP Client |
| Recharts | 2.10.0 | Charts & Data Visualization |
| React Hot Toast | 2.4.1 | Toast Notifications |
| React Icons | 4.12.0 | Icon Library |
| React Image Crop | 11.0.10 | Image Cropping |

### Backend
| Technology | Purpose |
|---|---|
| Node.js | Runtime Environment |
| Native HTTP Server | API Server (no Express) |
| JSON Files | Flat-file Database |
| JWT (Custom) | Authentication |
| SHA-256 (crypto) | Password Hashing |

### Integrations
| Service | Purpose |
|---|---|
| Firebase (FCM) | Push Notifications |
| Razorpay | Online Payment Gateway |

---

## Project Structure

```
cold-drinks-shop/
├── frontend/                         # React Frontend
│   ├── public/
│   ├── src/
│   │   ├── admin/                    # Admin Panel Pages
│   │   │   ├── Dashboard.jsx         # KPI Dashboard with charts
│   │   │   ├── Products.jsx          # Product CRUD
│   │   │   ├── Orders.jsx            # Order Management
│   │   │   ├── Customers.jsx         # Customer Management
│   │   │   ├── Payments.jsx          # Payment Tracking & Verification
│   │   │   ├── Bills.jsx             # Invoice Generation
│   │   │   ├── Notifications.jsx     # Send Notifications
│   │   │   ├── Categories.jsx        # Category Management
│   │   │   ├── Sliders.jsx           # Homepage Slider
│   │   │   ├── AdminProfile.jsx      # Admin Settings
│   │   │   ├── ThemeConfig.jsx       # Theme Customization
│   │   │   └── themeColors.js        # Color Palette
│   │   │
│   │   ├── pages/                    # Customer Pages
│   │   │   ├── Home.jsx              # Homepage with products
│   │   │   ├── ProductDetail.jsx     # Product Detail
│   │   │   ├── Cart.jsx              # Shopping Cart
│   │   │   ├── MyOrders.jsx          # Order History
│   │   │   ├── OrderTracking.jsx     # Order Status Timeline
│   │   │   ├── UserNotifications.jsx # User Notifications
│   │   │   ├── Profile.jsx           # User Profile
│   │   │   ├── Login.jsx             # Customer Login
│   │   │   ├── Register.jsx          # Customer Registration
│   │   │   └── AdminLogin.jsx        # Admin Login
│   │   │
│   │   ├── components/               # Reusable Components
│   │   │   ├── AdminLayout.jsx       # Admin Page Layout
│   │   │   ├── AdminSidebar.jsx      # Admin Sidebar Navigation
│   │   │   ├── Navbar.jsx            # Customer Navbar
│   │   │   ├── Footer.jsx            # Footer
│   │   │   ├── ProductCard.jsx       # Product Card
│   │   │   ├── OrderCard.jsx         # Order Card
│   │   │   ├── Modal.jsx             # Reusable Modal
│   │   │   ├── HeroSlider.jsx        # Homepage Slider
│   │   │   ├── SideDrawer.jsx        # Mobile Drawer
│   │   │   ├── StatusBadge.jsx       # Status Badge
│   │   │   ├── ImageCropModal.jsx    # Image Crop Modal
│   │   │   ├── Loader.jsx            # Loading Spinner
│   │   │   └── ProtectedRoute.jsx    # Auth Guard
│   │   │
│   │   ├── context/                  # React Context (State Management)
│   │   │   ├── AuthContext.jsx       # Authentication State
│   │   │   ├── CartContext.jsx       # Shopping Cart State
│   │   │   ├── ThemeContext.jsx      # Dark/Light Mode
│   │   │   └── SettingsContext.jsx   # App Settings
│   │   │
│   │   ├── config/
│   │   │   ├── api.js                # Axios Instance & Interceptors
│   │   │   └── firebaseConfig.js     # Firebase Configuration
│   │   │
│   │   ├── App.jsx                   # Main App with Routes
│   │   └── main.jsx                  # Entry Point
│   │
│   ├── package.json
│   └── vite.config.js
│
├── backend/                          # Node.js Backend
│   ├── server.js                     # Main Server (All API Handlers)
│   ├── database/                     # JSON Flat-file Database
│   │   ├── users.json                # User Accounts
│   │   ├── products.json             # Product Catalog
│   │   ├── orders.json               # Orders
│   │   ├── cart.json                 # Shopping Carts
│   │   ├── notifications.json        # Notifications
│   │   ├── bills.json                # Invoices
│   │   ├── categories.json           # Product Categories
│   │   ├── sliders.json              # Homepage Sliders
│   │   ├── payment-history.json      # Payment Audit Trail
│   │   ├── payment-requests.json     # Clearance Requests
│   │   └── settings.json             # App Configuration
│   │
│   ├── api/                          # PHP API files (legacy)
│   └── helpers/                      # Helper utilities
│
└── README.md
```

---

## Installation & Setup

### Prerequisites
- **Node.js** (v16 or higher)
- **npm** or **yarn**

### 1. Clone the Repository
```bash
git clone <repository-url>
cd cold-drinks-shop
```

### 2. Setup Backend
```bash
cd backend
node server.js
```
Backend will start on **http://localhost:8000**

### 3. Setup Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend will start on **http://localhost:3000**

### 4. Firebase Setup (Optional - for Push Notifications)
Update `frontend/src/config/firebaseConfig.js` with your Firebase credentials:
```js
const firebaseConfig = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID'
}
```

---

## Default Logins

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@cooldrinks.com | Admin@123 |
| Customer | rahul@gmail.com | User@123 |

---

## API Endpoints

All endpoints return: `{ "success": true/false, "data": {}, "message": "" }`

### Authentication
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | User Registration | No |
| POST | `/api/auth/login` | Login (email/phone + password) | No |
| GET | `/api/auth/verify` | Verify JWT Token | Yes |
| PUT | `/api/auth/profile` | Update Profile | Yes |
| PUT | `/api/auth/change-password` | Change Password | Yes |
| POST | `/api/auth/forgot-password` | Reset Password | No |

### Products
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/products` | List Products (filter: category, search) | No |
| GET | `/api/products?id=PRD-001` | Get Single Product | No |
| POST | `/api/products/add` | Create Product | Admin |
| PUT | `/api/products/:id` | Update Product | Admin |
| DELETE | `/api/products/:id` | Delete Product | Admin |
| PUT | `/api/products/:id/restock` | Restock Product | Admin |

### Orders
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/orders` | List Orders | Yes |
| GET | `/api/orders/:id` | Get Order Details | Yes |
| POST | `/api/orders/create` | Place Order | Yes |
| PUT | `/api/orders/:id/status` | Update Order Status | Admin |
| PUT | `/api/orders/:id/cancel` | Cancel Order | Yes |

### Cart
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/cart/get` | Get User's Cart | Yes |
| POST | `/api/cart/add` | Add Item to Cart | Yes |
| POST | `/api/cart/sync` | Sync Entire Cart | Yes |
| DELETE | `/api/cart/remove?productId=X` | Remove Item | Yes |
| POST | `/api/cart/clear` | Clear Cart | Yes |

### Payments
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/payments/stats` | Payment Statistics | Admin |
| GET | `/api/payments/online-history` | Online Payment History | Admin |
| POST | `/api/payments/record` | Record Payment | Admin |
| GET | `/api/payments/history/:customerId` | Customer Payment History | Admin |
| GET | `/api/payments/outstanding` | Outstanding Balances | Admin |
| GET | `/api/payments/my-summary` | User's Payment Summary | Yes |
| POST | `/api/payments/clear-request` | Request Payment Clearance | Yes |
| PUT | `/api/payments/clear-request/:id` | Approve/Reject Clearance | Admin |
| GET | `/api/payments/clear-requests` | List Clearance Requests | Admin |

### Notifications
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/notifications` | List Notifications | Yes |
| POST | `/api/notifications/send` | Send Notification | Admin |
| PUT | `/api/notifications/:id/read` | Mark as Read | Yes |
| PUT | `/api/notifications/read-all` | Mark All as Read | Yes |

### Bills
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/bills` | List All Bills | Admin |
| POST | `/api/bills/generate` | Generate Invoice | Admin |
| GET | `/api/bills/download?id=X` | Download Bill (HTML) | Admin |

### Dashboard
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/dashboard/stats` | KPI Statistics | Admin |
| GET | `/api/dashboard/charts` | Chart Data | Admin |

### Users
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/users` | List All Users | Admin |
| PUT | `/api/users/:id/block` | Block User | Admin |
| PUT | `/api/users/:id/unblock` | Unblock User | Admin |

### Categories
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/categories` | List Categories | No |
| POST | `/api/categories/create` | Create Category | Admin |

### Sliders
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/sliders` | List Sliders | No |
| POST | `/api/sliders/add` | Add Slider | Admin |
| PUT | `/api/sliders/:id` | Update Slider | Admin |
| DELETE | `/api/sliders/:id` | Delete Slider | Admin |

### Settings
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/settings` | Get App Settings | No |
| PUT | `/api/settings` | Update Settings | Admin |

---

## Database Schema

### User
```json
{
  "id": "USR-001",
  "name": "Rajesh Kumar",
  "email": "rajesh@example.com",
  "phone": "+919876543210",
  "password": "<sha256_hash>",
  "role": "customer | admin",
  "status": "active | blocked",
  "addresses": [
    {
      "type": "home",
      "label": "Home",
      "street": "123 Main St",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "isDefault": true
    }
  ],
  "wallet": 0,
  "outstanding": 0,
  "fcmToken": "firebase_token",
  "createdAt": "2025-01-10T09:00:00.000Z"
}
```

### Product
```json
{
  "id": "PRD-001",
  "name": "Coca Cola 2L",
  "category": "CAT-001",
  "description": "Chilled Coca Cola 2 Litre bottle",
  "price": 85,
  "mrp": 95,
  "stockQuantity": 100,
  "lowStockAlert": 10,
  "image": "base64_or_url",
  "gstPercent": 18,
  "deliveryCharge": 0,
  "status": "active",
  "createdAt": "2025-01-10T09:00:00.000Z"
}
```

### Order
```json
{
  "id": "ORD-001",
  "orderNumber": "ORD-1001",
  "userId": "USR-002",
  "customerName": "Rajesh Kumar",
  "customerPhone": "+919876543210",
  "items": [
    {
      "productId": "PRD-001",
      "name": "Coca Cola 2L",
      "price": 85,
      "quantity": 2,
      "image": "url"
    }
  ],
  "subtotal": 170,
  "tax": 30.6,
  "total": 200.6,
  "deliveryAddress": {
    "street": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001"
  },
  "orderStatus": "Placed | Confirmed | Processing | Shipped | Delivered | Cancelled",
  "paymentStatus": "Pending | Verification Pending | Paid | Rejected",
  "paymentMethod": "COD | Online",
  "paymentVerifiedAt": "2025-01-15T10:30:00.000Z",
  "paymentRejectedAt": null,
  "statusHistory": [
    { "status": "Placed", "timestamp": "2025-01-10T09:00:00.000Z" }
  ],
  "orderDate": "2025-01-10T09:00:00.000Z",
  "createdAt": "2025-01-10T09:00:00.000Z"
}
```

### Notification
```json
{
  "id": "NOTIF-001",
  "type": "order | payment | stock | general",
  "title": "Order Delivered",
  "message": "Your order ORD-1001 has been delivered.",
  "image": "url_or_base64",
  "targetUserId": "USR-002 | null (broadcast)",
  "isRead": false,
  "createdAt": "2025-01-10T09:00:00.000Z"
}
```

### Bill
```json
{
  "id": "BILL-001",
  "billNumber": "BILL-2001",
  "orderId": "ORD-001",
  "customerName": "Rajesh Kumar",
  "items": [],
  "subtotal": 170,
  "gst": 30.6,
  "total": 200.6,
  "paymentStatus": "Paid",
  "createdAt": "2025-01-10T09:00:00.000Z"
}
```

---

## Admin Panel

| Page | Route | Features |
|---|---|---|
| Dashboard | `/admin` | KPI cards, weekly orders chart, revenue by category, order status distribution, recent orders, low stock alerts |
| Products | `/admin/products` | Add/Edit/Delete products, image upload, stock management, GST & delivery charge config |
| Orders | `/admin/orders` | View all orders, update status, filter by status/payment, cancel orders |
| Customers | `/admin/customers` | View all customers, block/unblock, order history |
| Payments | `/admin/payments` | Outstanding balances, record payments, verify online payments, online payment history, clearance requests |
| Bills | `/admin/bills` | Generate GST invoices, download as HTML |
| Notifications | `/admin/notifications` | Send to all or specific user, type selection, image attachment |
| Categories | `/admin/categories` | Add/Edit/Delete categories |
| Sliders | `/admin/sliders` | Manage homepage hero banners |
| Theme | `/admin/theme` | Customize brand colors |
| Profile | `/admin/profile` | Admin settings, password change |

---

## Customer Panel

| Page | Route | Features |
|---|---|---|
| Home | `/` | Product listing, category filter, search, hero slider |
| Product Detail | `/product/:id` | Product info, add to cart |
| Cart | `/cart` | View cart, update quantity, checkout (COD/Online) |
| My Orders | `/orders` | Order history (sorted latest first), filter by status, cancel orders |
| Order Tracking | `/order/:id` | Status timeline, items, price breakdown, delivery info |
| Notifications | `/notifications` | View notifications (sorted latest first), mark as read |
| Profile | `/profile` | Edit profile, manage addresses, payment summary |
| Login | `/login` | Email/Phone + Password login |
| Register | `/register` | New user registration |

---

## Order & Payment Flow

### Order Flow
```
Customer Places Order
        |
        v
   [Placed] -----> Admin Confirms -----> [Confirmed]
                                              |
                                              v
                                        [Processing]
                                              |
                                              v
                                          [Shipped]
                                              |
                                              v
                                         [Delivered]
```

### Payment Flow
```
COD Order:
  Placed (Pending) --> Delivered --> Outstanding Added --> Admin Records Payment --> Paid

Online Order:
  Placed (Verification Pending) --> Admin Accepts (Paid) / Rejects (Rejected)
  Timestamps saved: paymentVerifiedAt / paymentRejectedAt
```

---

## ID Formats

| Entity | Format | Example |
|---|---|---|
| Users | `USR-XXX` | USR-001 |
| Products | `PRD-XXX` | PRD-001 |
| Orders | `ORD-XXXX` | ORD-1001 |
| Notifications | `NOTIF-XXX` | NOTIF-001 |
| Bills | `BILL-XXXX` | BILL-2001 |
| Categories | `CAT-XXX` | CAT-001 |
| Sliders | `SLD-XXX` | SLD-001 |
| Payment History | `PH-XXX` | PH-001 |
| Payment Requests | `PREQ-XXX` | PREQ-001 |

---

## Configuration

| Config | Value |
|---|---|
| Frontend Port | 3000 |
| Backend Port | 8000 |
| JWT Secret | `cold_drinks_shop_secret_key_2024` |
| Token Expiry | 7 days |
| Default GST | 18% |
| Max Image Size | 5MB |

---

## License

This project is private and proprietary.

**DEVELOPED by REHAN & PARVEZ**
