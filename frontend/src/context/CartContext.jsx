import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import API from '../config/api'
import { useAuth } from './AuthContext'
import { useSettings } from './SettingsContext'
import toast from 'react-hot-toast'
import {
  buildCartItem,
  getCartItemId,
  getDefaultPurchaseMode,
  getUnitBoxEquivalent,
} from '../utils/purchase'

const CartContext = createContext(null)

const DEFAULT_TAX_RATE = 0.18

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const { isAuthenticated } = useAuth()
  const { settings } = useSettings()
  const gstRate = (settings?.gstPercent != null ? settings.gstPercent : 0) / 100

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('cart')
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart)
        setItems(Array.isArray(parsed) ? parsed : [])
      } catch {
        setItems([])
      }
    }
  }, [])

  // Sync with backend when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchCart()
    }
  }, [isAuthenticated])

  // Save to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items))
  }, [items])

  const fetchCart = async () => {
    try {
      setLoading(true)
      const response = await API.get('/cart')
      const nextItems = Array.isArray(response.data.items) ? response.data.items : []
      setItems(nextItems.map((item) => ({
          ...item,
          cartItemId: item.cartItemId || getCartItemId(item.productId, item.purchaseMode || getDefaultPurchaseMode(item)),
        })))
    } catch (error) {
      console.error('Failed to fetch cart:', error)
    } finally {
      setLoading(false)
    }
  }

  const syncCartToBackend = async (updatedItems) => {
    if (!isAuthenticated) return
    try {
      await API.post('/cart/sync', { items: updatedItems })
    } catch (error) {
      console.error('Failed to sync cart:', error)
    }
  }

  const addToCart = useCallback((product, quantity = 1, purchaseMode = getDefaultPurchaseMode(product)) => {
    setItems((prevItems) => {
      const pid = product._id || product.id
      const cartItemId = getCartItemId(pid, purchaseMode)
      const existingIndex = prevItems.findIndex((item) => item.cartItemId === cartItemId)
      const normalizedQuantity = purchaseMode === 'half_box' ? 1 : quantity
      const newItem = buildCartItem(product, normalizedQuantity, purchaseMode)

      let updatedItems

      if (existingIndex > -1) {
        if (purchaseMode === 'half_box') {
          updatedItems = prevItems
        } else {
          updatedItems = prevItems.map((item, index) =>
            index === existingIndex
              ? {
                  ...item,
                  quantity: Math.min(item.quantity + normalizedQuantity, item.maxQuantity || newItem.maxQuantity || 999),
                  boxEquivalent: Math.round((
                    Math.min(item.quantity + normalizedQuantity, item.maxQuantity || newItem.maxQuantity || 999) *
                    getUnitBoxEquivalent(item, item.purchaseMode)
                  ) * 100) / 100,
                }
              : item
          )
        }
      } else {
        updatedItems = [...prevItems, newItem]
      }

      syncCartToBackend(updatedItems)
      return updatedItems
    })
  }, [isAuthenticated])

  const removeFromCart = useCallback((cartItemId) => {
    setItems((prevItems) => {
      const item = prevItems.find((i) => i.cartItemId === cartItemId)
      const updatedItems = prevItems.filter((i) => i.cartItemId !== cartItemId)
      syncCartToBackend(updatedItems)
      if (item) {
        toast.success(`${item.name} removed from cart`)
      }
      return updatedItems
    })
  }, [isAuthenticated])

  const updateQuantity = useCallback((cartItemId, quantity) => {
    if (quantity < 1) return

    setItems((prevItems) => {
      const updatedItems = prevItems.map((item) =>
        item.cartItemId === cartItemId
          ? {
              ...item,
              quantity: Math.min(quantity, item.maxQuantity || item.stock || 99),
              boxEquivalent: Math.round((
                Math.min(quantity, item.maxQuantity || item.stock || 99) *
                getUnitBoxEquivalent(item, item.purchaseMode)
              ) * 100) / 100,
            }
          : item
      )
      syncCartToBackend(updatedItems)
      return updatedItems
    })
  }, [isAuthenticated])

  const clearCart = useCallback(() => {
    setItems([])
    localStorage.removeItem('cart')
    if (isAuthenticated) {
      API.delete('/cart').catch((err) =>
        console.error('Failed to clear cart on server:', err)
      )
    }
  }, [isAuthenticated])

  const getSubtotal = useCallback(() => {
    return items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
  }, [items])

  const getDeliveryCharge = useCallback(() => {
    return items.reduce((sum, item) => {
      return sum + (item.deliveryCharge ? item.deliveryCharge * (item.boxEquivalent || item.quantity || 0) : 0)
    }, 0)
  }, [items])

  const getTax = useCallback(() => {
    return getSubtotal() * gstRate
  }, [items, getSubtotal, gstRate])

  const getGstPercent = useCallback(() => {
    return settings?.gstPercent != null ? settings.gstPercent : 0
  }, [settings])

  const getTotal = useCallback(() => {
    return getSubtotal() + getDeliveryCharge()
  }, [getSubtotal, getDeliveryCharge])

  const getItemCount = useCallback(() => {
    return items.reduce((count, item) => count + item.quantity, 0)
  }, [items])

  const value = {
    items,
    loading,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getSubtotal,
    getTax,
    getTotal,
    getDeliveryCharge,
    getItemCount,
    getGstPercent,
    fetchCart
  }

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}

export default CartContext
