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

const MIN_ORDER_AMOUNT = 1000

const Cart = () => {
  const navigate = useNavigate()
  const { items, updateQuantity, removeFromCart, getSubtotal, getTax, getTotal, getDeliveryCharge, getGstPercent, clearCart } = useCart()
  const { user, isAuthenticated, updateProfile } = useAuth()
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
  const [addressError, setAddressError] = useState('')
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
      setAddressError('')
      return
    }
    setAddress('')
    setEditingAddress(true)
  }, [user])

  const validateAddress = () => {
    const trimmedAddress = address.trim()
    if (!trimmedAddress) {
      setEditingAddress(true)
      setAddressError('Delivery address is required')
      return ''
    }
    setAddressError('')
    return trimmedAddress
  }

  const handleAddressChange = (value) => {
    setAddress(value)
    if (value.trim()) {
      setAddressError('')
    }
  }

  const handleAddressDone = async () => {
    const trimmedAddress = validateAddress()
    if (!trimmedAddress) return
    setAddress(trimmedAddress)
    setEditingAddress(false)
    try {
      await updateProfile({ address: trimmedAddress })
    } catch {
      // silent fail - address still saved locally for current order
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error('Please login to view your cart')
      navigate('/login')
    }
  }, [isAuthenticated, navigate])

  const getFinalTotal = () => {
    return Math.max(0, getTotal() - couponDiscount)
  }

  const isBelowMinimumOrder = getFinalTotal() < MIN_ORDER_AMOUNT
  const minimumOrderMessage = `Minimum order amount is ₹${MIN_ORDER_AMOUNT}. Add more items to continue.`

  const payableAmount = Number(getFinalTotal().toFixed(2))
  const upiId = settings?.upiId || '7028732945@ybl'
  const upiPayeeName = settings?.upiPayeeName || settings?.siteName || 'NOOR COLDINKS'
  const upiLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${encodeURIComponent(payableAmount.toFixed(2))}&cu=INR`
    : ''
  const dynamicQrUrl = upiLink
    ? `https://quickchart.io/qr?text=${encodeURIComponent(upiLink)}&size=320`
    : settings?.paymentQr || ''

  const placeOrderAPI = async (deliveryAddress) => {
    try {
      setPlacing(true)
      const orderData = {
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          purchaseMode: item.purchaseMode
        })),
        deliveryAddress,
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

    const trimmedAddress = validateAddress()
    if (!trimmedAddress) {
      toast.error('Please enter a delivery address')
      return
    }

    if (items.length === 0) {
      toast.error('Your cart is empty')
      return
    }

    if (getFinalTotal() < MIN_ORDER_AMOUNT) {
      toast.error(minimumOrderMessage)
      return
    }

    if (paymentMethod === 'Online') {
      setAddress(trimmedAddress)
      setShowQRModal(true)
      return
    }

    setAddress(trimmedAddress)
    await placeOrderAPI(trimmedAddress)
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
        <h1 className="page-title">Your Cart ({items.filter(i => !i.isFreeItem).length} {items.filter(i => !i.isFreeItem).length === 1 ? 'item' : 'items'})</h1>

        <div className="cart-layout">
          {/* Cart Items */}
          <div className="cart-items-section">
            <div className="cart-items">
              {items.map((item) => (
                <div key={item.cartItemId || `${item.productId}-${item.purchaseMode || 'full_box'}`} className={`cart-item${item.isFreeItem ? ' cart-item-free' : ''}`}>
                  <div className="cart-item-image-wrapper">
                    <img
                      src={item.image || '/images/placeholder-drink.svg'}
                      alt={item.name}
                      className="cart-item-image"
                      onError={(e) => { e.target.src = '/images/placeholder-drink.svg' }}
                    />
                    {item.isFreeItem && (
                      <span className="cart-free-badge">FREE</span>
                    )}
                  </div>

                  <div className="cart-item-details">
                    <h3 className="cart-item-name">{item.name}</h3>
                    {item.isFreeItem ? (
                      <>
                        <p className="cart-item-price" style={{ color: '#22c55e', fontWeight: 700 }}>
                          FREE
                        </p>
                        <p className="cart-item-meta" style={{ color: '#f97316', fontSize: 12 }}>
                          {item.offerLabel || 'Free with offer'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="cart-item-price">
                          {'\u20B9'}{(item.price || 0).toFixed(2)} {getCartItemUnitPriceLabel(item)}
                        </p>
                        <p className="cart-item-meta">{getCartItemSummary(item)}</p>
                      </>
                    )}

                    {!item.isFreeItem && (
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
                    )}
                  </div>

                  <div className="cart-item-total">
                    <span style={item.isFreeItem ? { color: '#22c55e', fontWeight: 700 } : {}}>
                      {item.isFreeItem ? 'FREE' : `\u20B9${((item.price || 0) * item.quantity).toFixed(2)}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Summary Sidebar */}
          <div className="order-summary">
            <h2 className="summary-title">Order Summary</h2>

            {items.map((item) => (
              <div key={item.cartItemId || `${item.productId}-${item.purchaseMode}`} className="summary-item-row">
                <span className="summary-item-name">{item.name}</span>
                <span className={item.isFreeItem ? 'free-delivery' : ''}>
                  {item.isFreeItem ? 'FREE' : `${'₹'}${((item.price || 0) * item.quantity).toFixed(2)}`}
                </span>
              </div>
            ))}

            <div className="summary-row">
              <span>Subtotal ({items.filter(i => !i.isFreeItem).length} items)</span>
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

            {isBelowMinimumOrder && (
              <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(226, 55, 68, 0.08)', color: '#ef4444', fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
                {minimumOrderMessage}
              </div>
            )}

            {/* Delivery Address */}
            <div className="form-group" style={{ marginTop: 20 }}>
              <label className="form-label">Delivery Address</label>

              {!editingAddress && address ? (
                <div className="address-card">
                  <p className="address-card-text">{address}</p>
                  <button
                    className="address-edit-btn"
                    onClick={() => {
                      setEditingAddress(true)
                      setAddressError('')
                    }}
                    title="Edit address"
                  >
                    <FiEdit2 />
                  </button>
                </div>
              ) : (
                <div className="address-edit-wrapper">
                  <textarea
                    className={`form-textarea ${addressError ? 'input-error' : ''}`}
                    placeholder="Enter your full delivery address..."
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    rows={3}
                    aria-invalid={Boolean(addressError)}
                  />
                  {addressError && <span className="field-error">{addressError}</span>}
                  {savedAddress && (
                    <button
                      className="address-save-btn"
                      onClick={handleAddressDone}
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
              className="btn btn-outline btn-lg btn-block cart-secondary-cta"
              type="button"
              onClick={() => navigate('/products')}
            >
              <FiShoppingBag /> Add More Products
            </button>

            <button
              className="btn btn-primary btn-lg btn-block cart-primary-cta"
              onClick={handlePlaceOrder}
              disabled={placing || isBelowMinimumOrder}
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
            onClick={async () => {
              const trimmedAddress = validateAddress()
              if (!trimmedAddress) {
                toast.error('Please enter a delivery address')
                setShowQRModal(false)
                return
              }
              if (getFinalTotal() < MIN_ORDER_AMOUNT) {
                toast.error(minimumOrderMessage)
                setShowQRModal(false)
                return
              }
              setAddress(trimmedAddress)
              await placeOrderAPI(trimmedAddress)
            }}
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
