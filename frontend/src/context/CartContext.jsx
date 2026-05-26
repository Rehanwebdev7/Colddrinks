import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
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

const GUEST_CART_KEY = 'guestCart'
const LEGACY_CART_KEY = 'cart'
const CUSTOMER_CART_KEY_PREFIX = 'customerCart:'

const readStoredItems = (key) => {
  if (typeof window === 'undefined') return []

  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeStoredItems = (key, value) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

const getCustomerCartKey = (userId) => `${CUSTOMER_CART_KEY_PREFIX}${userId}`

const normalizeCartItem = (item) => ({
  ...item,
  cartItemId: item?.cartItemId
    || getCartItemId(item?.productId, item?.purchaseMode || getDefaultPurchaseMode(item), item?.variantId),
})

const normalizeCartItems = (value) => (
  Array.isArray(value) ? value.map(normalizeCartItem) : []
)

const getGuestStoredCart = (includeLegacyFallback = false) => {
  const guestItems = readStoredItems(GUEST_CART_KEY)
  if (guestItems.length > 0) return normalizeCartItems(guestItems)
  return includeLegacyFallback ? normalizeCartItems(readStoredItems(LEGACY_CART_KEY)) : []
}

const getStoredCustomerCart = (userId) => {
  if (!userId) return []
  return normalizeCartItems(readStoredItems(getCustomerCartKey(userId)))
}

const stripGeneratedItems = (value) => (
  normalizeCartItems(value).filter((item) => !item?.isFreeItem)
)

const clampQuantity = (item, quantity) => {
  if ((item?.purchaseMode || 'full_box') === 'half_box') return 1
  const parsedQuantity = Number.parseInt(quantity, 10)
  const safeQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1
  const maxQuantity = Number(item?.maxQuantity || item?.stock || 999)
  return maxQuantity > 0 ? Math.min(safeQuantity, maxQuantity) : safeQuantity
}

const buildQuantityAwareItem = (item, quantity) => {
  const nextQuantity = clampQuantity(item, quantity)
  return {
    ...normalizeCartItem(item),
    quantity: nextQuantity,
    boxEquivalent: Math.round((nextQuantity * getUnitBoxEquivalent(item, item?.purchaseMode || 'full_box')) * 100) / 100,
  }
}

const mergeRegularItems = (serverItems, guestItems) => {
  const merged = new Map()

  for (const item of stripGeneratedItems(serverItems)) {
    merged.set(item.cartItemId, buildQuantityAwareItem(item, item.quantity))
  }

  for (const item of stripGeneratedItems(guestItems)) {
    const normalizedItem = normalizeCartItem(item)
    const existing = merged.get(normalizedItem.cartItemId)

    if (!existing) {
      merged.set(normalizedItem.cartItemId, buildQuantityAwareItem(normalizedItem, normalizedItem.quantity))
      continue
    }

    const mergedQuantity = existing.purchaseMode === 'half_box'
      ? 1
      : clampQuantity(existing, Number(existing.quantity || 0) + Number(normalizedItem.quantity || 0))

    merged.set(normalizedItem.cartItemId, buildQuantityAwareItem({ ...existing, ...normalizedItem }, mergedQuantity))
  }

  return Array.from(merged.values())
}

const reconcileCustomerCartItems = (serverItems, storedItems) => {
  const normalizedServerItems = stripGeneratedItems(serverItems)
  const normalizedStoredItems = stripGeneratedItems(storedItems)

  if (normalizedServerItems.length === 0) return normalizedStoredItems
  if (normalizedStoredItems.length === 0) return normalizedServerItems

  const merged = new Map()

  for (const item of normalizedServerItems) {
    const normalizedItem = normalizeCartItem(item)
    merged.set(normalizedItem.cartItemId, buildQuantityAwareItem(normalizedItem, normalizedItem.quantity))
  }

  for (const item of normalizedStoredItems) {
    const normalizedItem = normalizeCartItem(item)
    const existing = merged.get(normalizedItem.cartItemId)

    if (!existing) {
      merged.set(normalizedItem.cartItemId, buildQuantityAwareItem(normalizedItem, normalizedItem.quantity))
      continue
    }

    const preferredPurchaseMode = existing.purchaseMode || normalizedItem.purchaseMode || 'full_box'
    const mergedQuantity = preferredPurchaseMode === 'half_box'
      ? 1
      : Math.max(Number(existing.quantity || 0), Number(normalizedItem.quantity || 0), 1)

    merged.set(
      normalizedItem.cartItemId,
      buildQuantityAwareItem(
        {
          ...normalizedItem,
          ...existing,
          offer: existing.offer || normalizedItem.offer || null,
          purchaseMode: preferredPurchaseMode,
        },
        mergedQuantity
      )
    )
  }

  return Array.from(merged.values())
}

const serializeRegularItems = (value) => JSON.stringify(
  stripGeneratedItems(value).map((item) => ({
    cartItemId: item.cartItemId,
    productId: item.productId,
    variantId: item.variantId || null,
    flavor: item.flavor ?? null,
    volume: item.volume ?? null,
    volumeUnit: item.volumeUnit ?? null,
    quantity: item.quantity,
    purchaseMode: item.purchaseMode || 'full_box',
    price: item.price,
    pricePerBox: item.pricePerBox,
    boxQuantity: item.boxQuantity,
    stock: item.stock,
    maxQuantity: item.maxQuantity,
    deliveryCharge: item.deliveryCharge,
    offer: item.offer || null,
  }))
)

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [bootstrapped, setBootstrapped] = useState(false)
  const { isAuthenticated, user, loading: authLoading } = useAuth()
  const { settings } = useSettings()
  const gstRate = (settings?.gstPercent != null ? settings.gstPercent : 0) / 100
  const hydratedUserRef = useRef(null)
  const hydrationPromiseRef = useRef(null)

  // Boot with guest cart so cart badge and guest cart stay visible before auth resolves.
  useEffect(() => {
    const guestItems = getGuestStoredCart(true)
    const hasCustomerSession = typeof window !== 'undefined' && Boolean(localStorage.getItem('token') && localStorage.getItem('user'))
    if (!hasCustomerSession && readStoredItems(GUEST_CART_KEY).length === 0 && guestItems.length > 0) {
      writeStoredItems(GUEST_CART_KEY, guestItems)
    }
    setItems(guestItems)
    setBootstrapped(true)
  }, [])

  const offerKey = items
    .filter((i) => !i.isFreeItem)
    .map((i) => `${i.productId}:${i.quantity}:${i.offer?.enabled}:${i.offer?.buyQty}:${i.offer?.freeQty}:${i.offer?.freeProductId}:${i.offer?.label || ''}`)
    .join('|')
  useEffect(() => {
    setItems((prev) => {
      const regularItems = prev.filter((i) => !i.isFreeItem)
      const freeItems = []

      for (const item of regularItems) {
        const buyQty = Number(item.offer?.buyQty || 1)
        if (item.offer?.enabled && item.offer.freeProductId && buyQty > 0 && item.quantity >= buyQty) {
          const qualifiedSets = Math.floor(Number(item.quantity || 0) / buyQty)
          const freeQty = qualifiedSets * Number(item.offer.freeQty || 1)
          if (freeQty < 1) continue
          const freeId = `free_${item.productId}_${item.offer.freeProductId}`
          const isSameProduct = item.offer.freeProductId === item.productId
          freeItems.push({
            cartItemId: freeId,
            productId: item.offer.freeProductId,
            name: isSameProduct ? `${item.name} (FREE)` : `FREE with ${item.name}`,
            image: item.image,
            category: item.category || '',
            quantity: freeQty,
            purchaseMode: 'full_box',
            price: 0,
            pricePerBox: 0,
            boxQuantity: item.boxQuantity || 24,
            boxEquivalent: freeQty,
            stock: 999,
            maxQuantity: freeQty,
            deliveryCharge: 0,
            isFreeItem: true,
            offerFromProductId: item.productId,
            offerLabel: item.offer.label || 'Free with offer',
          })
        }
      }

      const existingFreeSignature = prev
        .filter((i) => i.isFreeItem)
        .map((i) => `${i.cartItemId}:${i.quantity}:${i.offerLabel || ''}`)
        .sort()
        .join('|')
      const newFreeSignature = freeItems
        .map((i) => `${i.cartItemId}:${i.quantity}:${i.offerLabel || ''}`)
        .sort()
        .join('|')
      if (existingFreeSignature === newFreeSignature) return prev

      return [...regularItems, ...freeItems]
    })
  }, [offerKey])

  const syncCartToBackend = useCallback(async (updatedItems) => {
    if (!isAuthenticated) return
    try {
      await API.post('/cart/sync', { items: stripGeneratedItems(updatedItems) })
    } catch (error) {
      console.error('Failed to sync cart:', error)
    }
  }, [isAuthenticated])

  const hydrateCustomerCart = useCallback(async (targetUserId = user?.id, options = {}) => {
    if (!targetUserId) return []

    if (hydrationPromiseRef.current?.userId === targetUserId) {
      return hydrationPromiseRef.current.promise
    }

    const { mergeGuest = true } = options

    const promise = (async () => {
      try {
        setLoading(true)
        const response = await API.get('/cart')
        const serverItems = normalizeCartItems(response.data.items)
        const storedCustomerItems = getStoredCustomerCart(targetUserId)
        const guestItems = mergeGuest ? getGuestStoredCart() : []
        const hydratedCustomerItems = reconcileCustomerCartItems(serverItems, storedCustomerItems)
        const mergedItems = guestItems.length > 0
          ? mergeRegularItems(hydratedCustomerItems, guestItems)
          : hydratedCustomerItems

        if (serializeRegularItems(serverItems) !== serializeRegularItems(mergedItems)) {
          await API.post('/cart/sync', { items: mergedItems })
        }

        const finalItems = normalizeCartItems(mergedItems)
        writeStoredItems(getCustomerCartKey(targetUserId), finalItems)
        writeStoredItems(LEGACY_CART_KEY, finalItems)
        localStorage.removeItem(GUEST_CART_KEY)
        setItems(finalItems)
        hydratedUserRef.current = targetUserId
        return finalItems
      } catch (error) {
        console.error('Failed to hydrate customer cart:', error)
        const fallbackItems = getStoredCustomerCart(targetUserId)
        if (fallbackItems.length > 0) {
          setItems(fallbackItems)
          hydratedUserRef.current = targetUserId
        }
        return fallbackItems
      } finally {
        setLoading(false)
      }
    })()

    hydrationPromiseRef.current = { userId: targetUserId, promise }
    return promise.finally(() => {
      if (hydrationPromiseRef.current?.promise === promise) {
        hydrationPromiseRef.current = null
      }
    })
  }, [user?.id])

  useEffect(() => {
    if (!bootstrapped || authLoading) return

    if (!isAuthenticated || !user?.id) {
      hydratedUserRef.current = null
      setItems(getGuestStoredCart())
      return
    }

    const storedCustomerItems = getStoredCustomerCart(user.id)
    if (storedCustomerItems.length > 0) {
      setItems(storedCustomerItems)
    }

    hydrateCustomerCart(user.id)
  }, [authLoading, bootstrapped, hydrateCustomerCart, isAuthenticated, user?.id])

  useEffect(() => {
    if (!bootstrapped || authLoading) return

    const normalizedItems = normalizeCartItems(items)

    if (isAuthenticated && user?.id) {
      if (hydratedUserRef.current !== user.id) return
      writeStoredItems(getCustomerCartKey(user.id), normalizedItems)
      writeStoredItems(LEGACY_CART_KEY, normalizedItems)
      return
    }

    writeStoredItems(GUEST_CART_KEY, normalizedItems)
    writeStoredItems(LEGACY_CART_KEY, normalizedItems)
  }, [authLoading, bootstrapped, isAuthenticated, items, user?.id])

  const fetchCart = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      const guestItems = getGuestStoredCart()
      setItems(guestItems)
      return guestItems
    }

    return hydrateCustomerCart(user.id, { mergeGuest: false })
  }, [hydrateCustomerCart, isAuthenticated, user?.id])

  const updateItemQuantity = (item, quantity) => {
    const nextQuantity = clampQuantity(item, quantity)
    return {
      ...item,
      quantity: nextQuantity,
      boxEquivalent: Math.round((nextQuantity * getUnitBoxEquivalent(item, item.purchaseMode)) * 100) / 100,
    }
  }

  const addToCart = useCallback((product, quantity = 1, purchaseMode, variantId = null) => {
    setItems((prevItems) => {
      const regularItems = prevItems.filter((item) => !item.isFreeItem)
      const pid = product._id || product.id

      // Resolve variant + mode (variant has its own piece/half_box flags)
      const variant = variantId && product?.hasVariants
        ? (product.variants || []).find(v => v.variantId === variantId)
        : null
      const stockable = variant || product
      const mode = purchaseMode || getDefaultPurchaseMode(stockable)

      const cartItemId = getCartItemId(pid, mode, variantId)
      const existingIndex = regularItems.findIndex((item) => item.cartItemId === cartItemId)
      const normalizedQuantity = mode === 'half_box' ? 1 : quantity
      const newItem = buildCartItem(product, normalizedQuantity, mode, variantId)
      let updatedItems

      if (existingIndex > -1) {
        if (mode === 'half_box') {
          updatedItems = regularItems
        } else {
          updatedItems = regularItems.map((item, index) => (
            index === existingIndex
              ? updateItemQuantity(item, Number(item.quantity || 0) + normalizedQuantity)
              : item
          ))
        }
      } else {
        updatedItems = [...regularItems, newItem]
      }

      syncCartToBackend(updatedItems)
      return updatedItems
    })
  }, [syncCartToBackend])

  const removeFromCart = useCallback((cartItemId) => {
    setItems((prevItems) => {
      const item = prevItems.find((i) => i.cartItemId === cartItemId)
      const updatedItems = prevItems.filter((i) => !i.isFreeItem && i.cartItemId !== cartItemId)
      syncCartToBackend(updatedItems)
      if (item) {
        toast.success(`${item.name} removed from cart`)
      }
      return updatedItems
    })
  }, [syncCartToBackend])

  const updateQuantity = useCallback((cartItemId, quantity) => {
    if (quantity < 1) return

    setItems((prevItems) => {
      const updatedItems = prevItems
        .filter((item) => !item.isFreeItem)
        .map((item) => (
          item.cartItemId === cartItemId
            ? updateItemQuantity(item, quantity)
            : item
        ))

      syncCartToBackend(updatedItems)
      return updatedItems
    })
  }, [syncCartToBackend])

  const clearCart = useCallback(() => {
    if (!isAuthenticated || !user?.id) {
      setItems([])
      localStorage.removeItem(GUEST_CART_KEY)
      localStorage.removeItem(LEGACY_CART_KEY)
      return
    }

    setItems([])
    writeStoredItems(getCustomerCartKey(user.id), [])
    writeStoredItems(LEGACY_CART_KEY, [])
    if (isAuthenticated) {
      API.delete('/cart').catch((err) =>
        console.error('Failed to clear cart on server:', err)
      )
    }
  }, [isAuthenticated, user?.id])

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
    return items.filter((i) => !i.isFreeItem).reduce((count, item) => count + item.quantity, 0)
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
    fetchCart,
    hydrateCustomerCart
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
