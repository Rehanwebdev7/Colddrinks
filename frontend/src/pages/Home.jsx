import { useState, useEffect } from 'react'
import API from '../config/api'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import ProductCard from '../components/ProductCard'
import HeroSlider from '../components/HeroSlider'
import BackToTop from '../components/BackToTop'
import { FiSearch } from 'react-icons/fi'
import { MdLocalDrink } from 'react-icons/md'
import { Link } from 'react-router-dom'

const defaultCategories = [
  { label: 'All', value: 'all' },
  { label: 'Soft Drinks', value: 'Soft Drinks' },
  { label: 'Energy Drinks', value: 'Energy Drinks' },
  { label: 'Juices', value: 'Juices' },
  { label: 'Water', value: 'Water' },
]

// Skeleton Card Component
const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="skeleton skeleton-image" />
    <div className="skeleton-body">
      <div className="skeleton skeleton-line w-75" />
      <div className="skeleton skeleton-line w-50" />
      <div className="skeleton skeleton-line w-40" style={{ height: '20px' }} />
      <div className="skeleton skeleton-line w-30" />
      <div className="skeleton skeleton-btn" />
    </div>
  </div>
)

const Home = () => {
  const [products, setProducts] = useState([])
  const [filteredProducts, setFilteredProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeFlavor, setActiveFlavor] = useState('all')
  const [activeVolume, setActiveVolume] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [sliders, setSliders] = useState([])
  const [categories, setCategories] = useState(defaultCategories)
  const [recentlyViewed, setRecentlyViewed] = useState([])

  useEffect(() => {
    fetchProducts()
    fetchSliders()
    fetchCategories()
  }, [])

  // Recently viewed: rebuild from live products list so stale localStorage entries
  // (products that were deleted from DB) are dropped, and live details (price,
  // image, name) are refreshed from current DB record.
  useEffect(() => {
    if (loading || error) return
    if (!Array.isArray(products) || products.length === 0) {
      // Products list is genuinely empty — clear recently viewed too
      setRecentlyViewed([])
      try { localStorage.setItem('recentlyViewed', JSON.stringify([])) } catch {}
      return
    }
    try {
      const stored = JSON.parse(localStorage.getItem('recentlyViewed') || '[]')
      if (!Array.isArray(stored)) {
        setRecentlyViewed([])
        return
      }
      const refreshed = stored
        .map(rv => {
          const rvId = String(rv.id ?? '')
          const rvName = String(rv.name || '').trim().toLowerCase()
          const live = products.find(p => {
            const pid = String(p._id ?? p.id ?? '')
            const pname = String(p.name || '').trim().toLowerCase()
            return (rvId && pid && rvId === pid) || (rvName && pname && rvName === pname)
          })
          if (!live) return null
          return {
            id: live._id || live.id,
            name: live.name,
            image: live.image,
            price: live.price ?? live.pricePerBox,
            category: live.category,
          }
        })
        .filter(Boolean)
        .slice(0, 8)
      setRecentlyViewed(refreshed)
      try { localStorage.setItem('recentlyViewed', JSON.stringify(refreshed)) } catch {}
    } catch {
      setRecentlyViewed([])
    }
  }, [products, loading, error])

  const fetchCategories = async () => {
    try {
      const response = await API.get('/categories')
      const data = Array.isArray(response.data) ? response.data : []
      const active = data.filter(c => c.status === 'active')
      if (active.length > 0) {
        setCategories([
          { label: 'All', value: 'all' },
          ...active.map(c => ({ label: c.name, value: c.name }))
        ])
      }
    } catch {
      // Keep defaults
    }
  }

  const fetchSliders = async () => {
    try {
      const response = await API.get('/sliders')
      const data = response.data
      setSliders(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch sliders:', err)
    }
  }

  useEffect(() => {
    filterProducts()
  }, [activeCategory, activeFlavor, activeVolume, searchQuery, products])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await API.get('/products')
      const rawData = response.data.products || response.data || []
      const data = Array.isArray(rawData) ? rawData.map((p) => ({
        ...p,
        _id: p._id || p.id,
        price: p.price ?? p.pricePerBox,
        stock: p.stock ?? p.stockQuantity ?? 0,
        numReviews: p.numReviews ?? p.totalReviews ?? 0,
      })) : []
      setProducts(data)
      setFilteredProducts(data)

    } catch (err) {
      console.error('Failed to fetch products:', err)
      setError('Failed to load products. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const filterProducts = () => {
    let filtered = [...products]

    if (activeCategory !== 'all') {
      filtered = filtered.filter(
        (p) => p.category?.toLowerCase() === activeCategory.toLowerCase()
      )
    }

    if (activeFlavor !== 'all') {
      const target = activeFlavor.toLowerCase()
      filtered = filtered.filter(p =>
        (Array.isArray(p.availableFlavors) && p.availableFlavors.some(f => String(f).toLowerCase() === target)) ||
        String(p.flavor || '').toLowerCase() === target
      )
    }

    if (activeVolume !== 'all') {
      const v = Number(activeVolume)
      filtered = filtered.filter(p =>
        (Array.isArray(p.availableVolumes) && p.availableVolumes.includes(v)) ||
        Number(p.volume) === v
      )
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.category?.toLowerCase().includes(query) ||
          String(p.brand || '').toLowerCase().includes(query) ||
          (Array.isArray(p.availableFlavors) && p.availableFlavors.some(f => String(f).toLowerCase().includes(query)))
      )
    }

    setFilteredProducts(filtered)
  }

  // Derive available flavor + volume pills from CURRENT product set (post-category filter)
  const visibleAfterCategory = activeCategory === 'all'
    ? products
    : products.filter(p => p.category?.toLowerCase() === activeCategory.toLowerCase())

  const flavorOptions = (() => {
    const set = new Set()
    for (const p of visibleAfterCategory) {
      if (Array.isArray(p.availableFlavors)) {
        for (const f of p.availableFlavors) if (f) set.add(String(f))
      } else if (p.flavor) {
        set.add(String(p.flavor))
      }
    }
    return Array.from(set).sort()
  })()

  const volumeOptions = (() => {
    const set = new Set()
    for (const p of visibleAfterCategory) {
      if (Array.isArray(p.availableVolumes)) {
        for (const v of p.availableVolumes) if (v != null) set.add(Number(v))
      } else if (p.volume != null) {
        set.add(Number(p.volume))
      }
    }
    return Array.from(set).filter(Boolean).sort((a, b) => a - b)
  })()

  const clearFilters = () => {
    setActiveCategory('all')
    setActiveFlavor('all')
    setActiveVolume('all')
    setSearchQuery('')
  }

  const hasActiveFilters = activeCategory !== 'all' || activeFlavor !== 'all' || activeVolume !== 'all' || searchQuery.trim()
  const isMobileSearchMode = isSearchFocused || searchQuery.trim().length > 0

  return (
    <div className={`page-wrapper${isMobileSearchMode ? ' mobile-search-mode' : ''}`}>
      <Navbar />

      {/* Hero / Slider */}
      <div className="home-hero-shell">
        {sliders.length > 0 ? (
          <HeroSlider slides={sliders} />
        ) : (
          <section className="hero-banner">
            <div className="hero-overlay" />
            <div className="hero-content">
              <h1 className="hero-title">Royal <span>Cold Drinks</span></h1>
              <p className="hero-subtitle">
                Premium beverages at wholesale prices — delivered fast to your door.
              </p>
              <div className="hero-stats">
                <div className="hero-stat">
                  <span className="hero-stat-value">500+</span>
                  <span className="hero-stat-label">Products</span>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-value">10K+</span>
                  <span className="hero-stat-label">Customers</span>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-value">24hr</span>
                  <span className="hero-stat-label">Delivery</span>
                </div>
              </div>
              <a href="#products" className="btn btn-hero">Shop Now</a>
            </div>
          </section>
        )}
      </div>

      {/* Products */}
      <section className="container section-padding" id="products">
        <h2 className="section-title center hide-mobile">Our <span>Drinks</span></h2>

        {/* Search */}
        <div className={`search-bar-wrapper center-search home-search-wrapper${isMobileSearchMode ? ' active' : ''}`}>
          <form className="search-bar" onSubmit={(e) => e.preventDefault()}>
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search drinks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => {
                window.setTimeout(() => setIsSearchFocused(false), 120)
              }}
              className="search-input"
            />
          </form>
        </div>

        {/* Category Pills */}
        <div className={`category-tabs${isMobileSearchMode ? ' search-mode-hidden' : ''}`}>
          {categories.map((cat) => (
            <button
              key={cat.value}
              className={`category-tab ${activeCategory === cat.value ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Smart Filter Bar — flavor + size (variants-aware, mobile-friendly) */}
        {(flavorOptions.length > 0 || volumeOptions.length > 0) && !isMobileSearchMode && (
          <div className="smart-filter-bar">
            {flavorOptions.length > 0 && (
              <div className="smart-filter-row">
                <span className="smart-filter-label">Flavor</span>
                <div className="smart-filter-chips">
                  <button
                    className={`smart-filter-chip smart-filter-chip-all${activeFlavor === 'all' ? ' active' : ''}`}
                    onClick={() => setActiveFlavor('all')}
                  >
                    All
                  </button>
                  {flavorOptions.map(f => (
                    <button
                      key={f}
                      className={`smart-filter-chip${activeFlavor === f ? ' active' : ''}`}
                      onClick={() => setActiveFlavor(activeFlavor === f ? 'all' : f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                {activeFlavor !== 'all' && (
                  <button className="smart-filter-clear" onClick={() => setActiveFlavor('all')}>
                    Clear
                  </button>
                )}
              </div>
            )}
            {volumeOptions.length > 0 && (
              <div className="smart-filter-row">
                <span className="smart-filter-label">Size</span>
                <div className="smart-filter-chips">
                  <button
                    className={`smart-filter-chip smart-filter-chip-all${activeVolume === 'all' ? ' active' : ''}`}
                    onClick={() => setActiveVolume('all')}
                  >
                    All
                  </button>
                  {volumeOptions.map(v => {
                    const unit = (visibleAfterCategory.find(p =>
                      Array.isArray(p.availableVolumes) ? p.availableVolumes.includes(v) : Number(p.volume) === v
                    )?.volumeUnit) || 'ml'
                    return (
                      <button
                        key={v}
                        className={`smart-filter-chip${String(activeVolume) === String(v) ? ' active' : ''}`}
                        onClick={() => setActiveVolume(String(activeVolume) === String(v) ? 'all' : v)}
                      >
                        {v}{unit}
                      </button>
                    )
                  })}
                </div>
                {activeVolume !== 'all' && (
                  <button className="smart-filter-clear" onClick={() => setActiveVolume('all')}>
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filter Info */}
        {hasActiveFilters && (
          <div className="flex-between mb-lg mt-md hide-mobile">
            <p className="text-muted mb-sm">
              {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''} found
              {activeCategory !== 'all' && ` in "${activeCategory}"`}
              {searchQuery.trim() && ` for "${searchQuery}"`}
            </p>
            <button className="btn btn-sm" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        )}

        {isMobileSearchMode && (
          <div className="mobile-search-summary">
            <span className="mobile-search-summary-text">
              {searchQuery.trim()
                ? `${filteredProducts.length} result${filteredProducts.length !== 1 ? 's' : ''} for "${searchQuery.trim()}"`
                : 'Type to search drinks'}
            </span>
            {(searchQuery.trim() || activeCategory !== 'all') && (
              <button className="mobile-search-clear" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>
        )}

        {/* Section Header - Products */}
        <div className="section-header-mobile">
          <h3 className="section-header-title">
            {activeCategory === 'all' ? 'All Drinks' : activeCategory}
          </h3>
          {filteredProducts.length > 0 && (
            <span className="section-header-count">{filteredProducts.length} items</span>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="product-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="error-container">
            <h2>Something went wrong</h2>
            <p className="error-text">{error}</p>
            <button className="btn btn-primary" onClick={fetchProducts}>Try Again</button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state-illustration" viewBox="0 0 140 140" fill="none">
              <circle cx="70" cy="70" r="65" fill="#FEE2E2" />
              <rect x="45" y="35" width="50" height="65" rx="8" fill="#FECACA" stroke="#E23744" strokeWidth="2"/>
              <circle cx="70" cy="50" r="8" fill="#FCA5A5"/>
              <path d="M55 72h30M55 82h20" stroke="#E23744" strokeWidth="2" strokeLinecap="round"/>
              <path d="M70 105l-4-6h8l-4 6z" fill="#E23744"/>
            </svg>
            <h3 className="empty-state-title">No drinks found</h3>
            <p className="empty-state-text">Try a different keyword or category.</p>
            <button className="btn btn-primary mt-md" onClick={clearFilters}>
              Browse All
            </button>
          </div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <ProductCard key={product._id || product.id} product={product} />
            ))}
          </div>
        )}

        {/* Recently Viewed */}
        {!loading && recentlyViewed.length > 0 && !isMobileSearchMode && (
          <div className="recently-viewed-section">
            <h2 className="section-title recently-viewed-title">Recently <span>Viewed</span></h2>
            <div className="recently-viewed-scroll">
              {recentlyViewed.map((item) => (
                <div key={item.id} className="product-card recently-viewed-card" style={{ flexShrink: 0 }}>
                  <Link to={`/product/${item.id}`} className="product-card-link">
                    <div className="product-card-image-wrapper">
                      <img src={item.image || '/images/placeholder-drink.svg'} alt={item.name} className="product-card-image" />
                    </div>
                    <div className="product-card-body">
                      <h3 className="product-card-name">{item.name}</h3>
                      <div className="product-card-price">
                        &#8377;{item.price}<span className="per-box">/box</span>
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <Footer />
      <BackToTop />
    </div>
  )
}

export default Home
