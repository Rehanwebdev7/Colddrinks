import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import API from '../config/api'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import BackToTop from '../components/BackToTop'
import toast from 'react-hot-toast'
import { FiMinus, FiPlus, FiTrash2, FiShoppingBag, FiEdit2, FiCheck, FiCopy, FiExternalLink } from 'react-icons/fi'
import { MdLocalShipping } from 'react-icons/md'
import { ImSpinner8 } from 'react-icons/im'
import Modal from '../components/Modal'
import { getCartItemSummary, getCartItemUnitPriceLabel } from '../utils/purchase'

const Cart = () => {
  const navigate = useNavigate()
  const { items, updateQuantity, removeFromCart, getSubtotal, getTax, getTotal, getDeliveryCharge, getGstPercent, clearCart } = useCart()
  const { user, isAuthenticated } = useAuth()
  const { settings } = useSettings()

  const formatAddress = (addr) => {
    if (!addr) return ''
    if (typeof addr === 'string') return addr
    const parts = [addr.label, addr.street, addr.city, addr.state, addr.pincode].filter(Boolean)
    return parts.join(', ')
  }
  const savedAddress = formatAddress(user?.addresses?.[0]) || formatAddress(user?.address) || ''
  const [address, setAddress] = useState(savedAddress)
  const [editingAddress, setEditingAddress] = useState(!savedAddress)
  const [paymentMethod, setPaymentMethod] = useState('COD')
  const [placing, setPlacing] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [qrImageError, setQrImageError] = useState(false)

  const couponDiscount = 0

  useEffect(() => {
    const addr = formatAddress(user?.addresses?.[0]) || formatAddress(user?.address) || ''
    if (addr) {
      setAddress(addr)
      setEditingAddress(false)
    }
  }, [user])

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error('Please login to view your cart')
      navigate('/login')
    }
  }, [isAuthenticated, navigate])

  const getFinalTotal = () => {
    return Math.max(0, getTotal() - couponDiscount)
  }

  const payableAmount = Number(getFinalTotal().toFixed(2))
  const upiId = settings?.upiId || '7028732945@ybl'
  const upiPayeeName = settings?.upiPayeeName || settings?.siteName || 'NOOR COLDINKS'
  const upiLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${encodeURIComponent(payableAmount.toFixed(2))}&cu=INR`
    : ''
  const dynamicQrUrl = upiLink
    ? `https://quickchart.io/qr?text=${encodeURIComponent(upiLink)}&size=320`
    : settings?.paymentQr || ''

  const placeOrderAPI = async () => {
    try {
      setPlacing(true)
        const orderData = {
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            purchaseMode: item.purchaseMode
          })),
        deliveryAddress: address.trim(),
        paymentMethod
      }

      await API.post('/orders/create', orderData)
      toast.success('Order placed successfully!')
      clearCart()
      setShowQRModal(false)
      navigate('/orders')
    } catch (err) {
      console.error('Order failed:', err)
      if (err.response?.status === 403) {
        toast.error(err.response?.data?.message || 'Your account has been blocked. Please contact support.', { duration: 5000 })
      } else {
        toast.error(err.response?.data?.message || 'Failed to place order. Please try again.')
      }
    } finally {
      setPlacing(false)
    }
  }

  const handlePlaceOrder = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to place an order')
      navigate('/login')
      return
    }

    if (!address.trim()) {
      toast.error('Please enter a delivery address')
      return
    }

    if (items.length === 0) {
      toast.error('Your cart is empty')
      return
    }

    if (paymentMethod === 'Online') {
      setShowQRModal(true)
      return
    }

    await placeOrderAPI()
  }

  const handleOpenUpiApp = () => {
    if (!upiLink) {
      toast.error('UPI payment link not configured')
      return
    }
    window.location.href = upiLink
  }

  const handleCopy = async (value, label) => {
    const textToCopy = String(value)
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy)
        toast.success(`${label} copied`)
        return
      }

      const textArea = document.createElement('textarea')
      textArea.value = textToCopy
      textArea.setAttribute('readonly', '')
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      textArea.style.pointerEvents = 'none'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      const copied = document.execCommand('copy')
      document.body.removeChild(textArea)

      if (!copied) throw new Error('execCommand failed')
      toast.success(`${label} copied`)
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`)
    }
  }

  if (!isAuthenticated) return null

  // Empty cart state with illustration
  if (items.length === 0) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="container page-min-height empty-cart-container">
          <div className="empty-state">
            <svg className="empty-state-illustration" viewBox="0 0 140 140" fill="none">
              <circle cx="70" cy="70" r="65" fill="#FEE2E2" />
              <rect x="35" y="50" width="70" height="50" rx="6" fill="#FECACA" stroke="#E23744" strokeWidth="2"/>
              <path d="M35 60h70" stroke="#E23744" strokeWidth="2"/>
              <circle cx="55" cy="105" r="5" fill="#E23744"/>
              <circle cx="85" cy="105" r="5" fill="#E23744"/>
              <path d="M45 50l-8-20h-12" stroke="#E23744" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M55 75h30M55 85h20" stroke="#FCA5A5" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <h3 className="empty-state-title">Your cart is empty</h3>
            <p className="empty-state-text">Looks like you haven't added any drinks yet.</p>
            <Link to="/products" className="btn btn-primary">
              Browse Products
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <Navbar />

      <div className="container section-padding cart-page">
        <h1 className="page-title">Your Cart ({items.length} {items.length === 1 ? 'item' : 'items'})</h1>

        <div className="cart-layout">
          {/* Cart Items */}
          <div className="cart-items-section">
            <div className="cart-items">
              {items.map((item) => (
                <div key={item.cartItemId || `${item.productId}-${item.purchaseMode || 'full_box'}`} className="cart-item">
                  <div className="cart-item-image-wrapper">
                    <img
                      src={item.image || '/images/placeholder-drink.svg'}
                      alt={item.name}
                      className="cart-item-image"
                      onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
                    />
                  </div>

                  <div className="cart-item-details">
                    <h3 className="cart-item-name">{item.name}</h3>
                    <p className="cart-item-price">
                      {'\u20B9'}{(item.price || 0).toFixed(2)} {getCartItemUnitPriceLabel(item)}
                    </p>
                    <p className="cart-item-meta">{getCartItemSummary(item)}</p>

                    <div className="cart-item-controls">
                      {item.purchaseMode !== 'half_box' ? (
                        <div className="quantity-controls">
                          <button
                            className="qty-btn"
                            onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <FiMinus />
                          </button>
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="qty-value qty-input"
                            value={item.quantity}
                            min={1}
                            max={item.maxQuantity || item.stock || 999}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '')
                              if (raw === '') return
                              const val = parseInt(raw)
                              if (val > 0 && val <= (item.maxQuantity || item.stock || 999)) updateQuantity(item.cartItemId, val)
                            }}
                          />
                          <button
                            className="qty-btn"
                            onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                            disabled={item.quantity >= (item.maxQuantity || item.stock || 99)}
                          >
                            <FiPlus />
                          </button>
                        </div>
                      ) : (
                        <div className="cart-fixed-mode">Half box fixed at 1</div>
                      )}

                      <button
                        className="btn-icon btn-danger"
                        onClick={() => removeFromCart(item.cartItemId)}
                        title="Remove item"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>

                  <div className="cart-item-total">
                    <span>{'\u20B9'}{((item.price || 0) * item.quantity).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Summary Sidebar */}
          <div className="order-summary">
            <h2 className="summary-title">Order Summary</h2>

            <div className="summary-row">
              <span>Subtotal ({items.length} items)</span>
              <span>{'\u20B9'}{getSubtotal().toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span><MdLocalShipping className="inline-icon" /> Delivery</span>
              <span className={getDeliveryCharge() === 0 ? 'free-delivery' : ''}>
                {getDeliveryCharge() === 0 ? 'FREE' : `${'\u20B9'}${getDeliveryCharge().toFixed(2)}`}
              </span>
            </div>
            <div className="summary-divider" />
            <div className="summary-row summary-total">
              <span>Total</span>
              <span>{'\u20B9'}{getFinalTotal().toFixed(2)}</span>
            </div>

            {/* Delivery Address */}
            <div className="form-group" style={{ marginTop: 20 }}>
              <label className="form-label">Delivery Address</label>

              {!editingAddress && address ? (
                <div className="address-card">
                  <p className="address-card-text">{address}</p>
                  <button
                    className="address-edit-btn"
                    onClick={() => setEditingAddress(true)}
                    title="Edit address"
                  >
                    <FiEdit2 />
                  </button>
                </div>
              ) : (
                <div className="address-edit-wrapper">
                  <textarea
                    className="form-textarea"
                    placeholder="Enter your full delivery address..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={3}
                  />
                  {savedAddress && (
                    <button
                      className="address-save-btn"
                      onClick={() => {
                        if (address.trim()) setEditingAddress(false)
                        else toast.error('Address cannot be empty')
                      }}
                      title="Save address"
                    >
                      <FiCheck /> Done
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <div className="payment-options">
                <label className={`payment-option ${paymentMethod === 'COD' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    value="COD"
                    checked={paymentMethod === 'COD'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <span>Cash on Delivery</span>
                </label>
                <label className={`payment-option ${paymentMethod === 'Online' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    value="Online"
                    checked={paymentMethod === 'Online'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <span>Online Payment</span>
                </label>
              </div>
            </div>

            {/* Place Order */}
            <button
              className="btn btn-primary btn-lg btn-block"
              onClick={handlePlaceOrder}
              disabled={placing || !address.trim()}
            >
              {placing ? (
                <>
                  <ImSpinner8 className="spinner-sm" /> Placing Order...
                </>
              ) : (
                `Place Order \u2014 \u20B9${getFinalTotal().toFixed(2)}`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* QR Payment Modal */}
      <Modal isOpen={showQRModal} onClose={() => setShowQRModal(false)} title="Online Payment">
        <div className="qr-modal-content">
          <p className="qr-modal-amount">Amount: {'\u20B9'}{getFinalTotal().toFixed(2)}</p>

          {(dynamicQrUrl || settings?.paymentQr) && !qrImageError ? (
            <img
              src={dynamicQrUrl || settings.paymentQr}
              alt="Payment QR Code"
              className="qr-modal-image"
              onError={() => setQrImageError(true)}
            />
          ) : (
            <div className="qr-modal-fallback">
              <p>QR Code not available</p>
              <p style={{ fontSize: '12px', marginTop: '8px' }}>Contact admin for payment details</p>
            </div>
          )}

          <p className="qr-modal-note">
            QR scan karein ya direct UPI app kholein. Amount auto-filled rahega.
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '12px' }}>
            Agar app open na ho to Chrome use karein ya UPI details copy karke manually pay karein.
          </p>

          <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
            <button
              className="btn btn-secondary btn-lg btn-block"
              onClick={handleOpenUpiApp}
              disabled={!upiLink}
            >
              <FiExternalLink /> Pay via UPI App
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                className="btn btn-secondary btn-block"
                type="button"
                onClick={() => handleCopy(upiId, 'UPI ID')}
                disabled={!upiId}
              >
                <FiCopy /> Copy UPI ID
              </button>
              <button
                className="btn btn-secondary btn-block"
                type="button"
                onClick={() => handleCopy(payableAmount.toFixed(2), 'Amount')}
              >
                <FiCopy /> Copy Amount
              </button>
            </div>
            {upiId && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                UPI ID: <strong>{upiId}</strong>
              </div>
            )}
          </div>

          <button
            className="btn btn-primary btn-lg btn-block"
            onClick={placeOrderAPI}
            disabled={placing}
          >
            {placing ? (
              <><ImSpinner8 className="spinner-sm" /> Confirming...</>
            ) : (
              "I've Paid — Place Order"
            )}
          </button>
        </div>
      </Modal>

      <Footer />
      <BackToTop />
    </div>
  )
}

export default Cart
