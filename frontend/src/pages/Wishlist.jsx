import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import API from '../config/api'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { FiHeart, FiShoppingCart, FiTrash2 } from 'react-icons/fi'
import toast from 'react-hot-toast'

const Wishlist = () => {
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const { addToCart } = useCart()
  const [wishlist, setWishlist] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/login')
  }, [authLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (isAuthenticated) fetchWishlist()
  }, [isAuthenticated])

  const fetchWishlist = async () => {
    try {
      setLoading(true)
      const response = await API.get('/wishlist')
      setWishlist(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      console.error('Failed to fetch wishlist:', err)
    } finally {
      setLoading(false)
    }
  }

  const removeFromWishlist = async (productId) => {
    try {
      await API.post('/wishlist/toggle', { productId })
      setWishlist(prev => prev.filter(item => item.productId !== productId))
      toast.success('Removed from wishlist')
    } catch (err) {
      toast.error('Failed to remove from wishlist')
    }
  }

  const handleAddToCart = (item) => {
    addToCart({
      _id: item.productId,
      id: item.productId,
      name: item.productName,
      image: item.productImage,
      price: item.productPrice,
      pricePerBox: item.productPrice,
      stock: item.productStock || 99,
      stockQuantity: item.productStock || 99
    }, 1)
    toast.success(`${item.productName} added to cart!`)
  }

  // Show loading skeleton using shimmer divs
  // Show empty state with heart icon SVG illustration when no items
  // Show grid of wishlist items with image, name, price, remove button, add to cart button
  // Each item links to /product/:productId

  return (
    <div className="page-wrapper">
      <Navbar />
      <div className="container section-padding">
        <h1 className="page-title">My Wishlist ({wishlist.length})</h1>

        {loading ? (
          <div className="loader-container">
            <div className="spinner"></div>
            <p>Loading wishlist...</p>
          </div>
        ) : wishlist.length === 0 ? (
          <div className="empty-state">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none" style={{margin: '0 auto 16px'}}>
              <circle cx="60" cy="60" r="56" fill="#FEE2E2" />
              <path d="M60 85C60 85 30 65 30 48C30 38 38 30 48 30C54 30 58 34 60 37C62 34 66 30 72 30C82 30 90 38 90 48C90 65 60 85 60 85Z" fill="#FECACA" stroke="#E23744" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h3 className="empty-state-title">Your wishlist is empty</h3>
            <p className="empty-state-text">Save your favorite drinks here for easy access later.</p>
            <Link to="/products" className="btn btn-primary">Browse Products</Link>
          </div>
        ) : (
          <div className="product-grid">
            {wishlist.map(item => (
              <div key={item.productId} className="product-card">
                <Link to={`/product/${item.productId}`} className="product-card-link">
                  <div className="product-card-image-wrapper">
                    <img src={item.productImage || '/images/placeholder-drink.svg'} alt={item.productName} className="product-card-image" />
                  </div>
                  <div className="product-card-body">
                    <h3 className="product-card-name">{item.productName}</h3>
                    <div className="product-card-price">
                      ₹{item.productPrice}<span className="per-box">/box</span>
                    </div>
                  </div>
                </Link>
                <div className="product-card-actions" style={{display:'flex', gap:'8px'}}>
                  <button onClick={() => handleAddToCart(item)} className="btn btn-primary" style={{flex:1, fontSize:'12px', padding:'8px 12px'}}>
                    <FiShoppingCart /> Add to Cart
                  </button>
                  <button onClick={() => removeFromWishlist(item.productId)} className="btn-icon btn-danger" title="Remove">
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default Wishlist
