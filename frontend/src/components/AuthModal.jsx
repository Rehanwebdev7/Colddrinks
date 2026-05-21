import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useAuthModal } from '../context/AuthModalContext'
import { useSettings } from '../context/SettingsContext'
import toast from 'react-hot-toast'
import API from '../config/api'
import { MdLocalDrink } from 'react-icons/md'
import { FiPhone, FiLock, FiEye, FiEyeOff, FiArrowLeft, FiCheck, FiUser, FiX, FiMail } from 'react-icons/fi'
import { ImSpinner8 } from 'react-icons/im'

const maskPhone = (p) => (p && p.length >= 6 ? p.slice(0, 2) + 'XXXX' + p.slice(-4) : p)

const AuthModal = () => {
  const { isOpen, view, closeAuth, switchView } = useAuthModal()
  const { checkPhone, login, register } = useAuth()
  const { hydrateCustomerCart } = useCart()
  const { settings } = useSettings()

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)

  const phoneRef = useRef(null)
  const nameRef = useRef(null)
  const passwordRef = useRef(null)
  const emailRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => {
      if (view === 'phone') phoneRef.current?.focus()
      else if (view === 'login') passwordRef.current?.focus()
      else if (view === 'register') nameRef.current?.focus()
      else if (view === 'forgot') emailRef.current?.focus()
    }, 250)
    return () => clearTimeout(t)
  }, [isOpen, view])

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setPhone('')
        setName('')
        setPassword('')
        setConfirmPassword('')
        setShowPassword(false)
        setShowConfirm(false)
        setForgotEmail('')
        setForgotSent(false)
      }, 300)
    }
  }, [isOpen])

  if (!isOpen) return null

  const brandName = settings?.siteName || 'Royal'
  const brandLogo = settings?.logo || settings?.favicon || ''

  const handlePhoneSubmit = async (e) => {
    e.preventDefault()
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      toast.error('Please enter a valid 10-digit mobile number')
      return
    }
    try {
      setLoading(true)
      const result = await checkPhone(digits)
      switchView(result.exists ? 'login' : 'register')
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!password.trim()) { toast.error('Please enter your password'); return }
    try {
      setLoading(true)
      const result = await login(phone.replace(/\D/g, ''), password, false)
      if (result.success) {
        await hydrateCustomerCart(result.user?.id)
        closeAuth()
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Please enter your name'); return }
    if (!password.trim() || password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return }
    try {
      setLoading(true)
      const result = await register({ phone: phone.replace(/\D/g, ''), name: name.trim(), password })
      if (result.success) {
        await hydrateCustomerCart(result.user?.id)
        closeAuth()
      }
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    if (!forgotEmail.trim()) { toast.error('Please enter your email'); return }
    try {
      setLoading(true)
      await API.post('/auth/forgot-password', { email: forgotEmail.trim() })
      setForgotSent(true)
      toast.success('Check your email for the reset link')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  const goBackToPhone = () => {
    switchView('phone')
    setName('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="auth-modal-overlay" onClick={closeAuth} role="dialog" aria-modal="true">
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={closeAuth} aria-label="Close">
          <FiX />
        </button>

        <div className="auth-modal-brand">
          {brandLogo ? (
            <img
              src={brandLogo}
              alt={brandName}
              className="auth-modal-brand-logo"
              referrerPolicy="no-referrer"
            />
          ) : (
            <>
              <div className="auth-modal-brand-icon"><MdLocalDrink /></div>
              <span className="auth-modal-brand-name">{brandName}</span>
            </>
          )}
        </div>

        {/* PHONE STEP */}
        {view === 'phone' && (
          <>
            <h2 className="auth-modal-title">Welcome 👋</h2>
            <p className="auth-modal-subtitle">Enter your mobile to login or sign up</p>
            <form onSubmit={handlePhoneSubmit} className="auth-modal-form">
              <div className="form-group">
                <div className="input-with-icon">
                  <FiPhone className="input-icon" />
                  <input
                    ref={phoneRef}
                    type="tel"
                    inputMode="numeric"
                    placeholder="10-digit mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                    className="form-input"
                    autoComplete="tel"
                    style={{ fontSize: 17, letterSpacing: 1.4 }}
                  />
                  {phone.length === 10 && (
                    <span className="input-check"><FiCheck /></span>
                  )}
                </div>
                {phone.length > 0 && phone.length < 10 && (
                  <p className="auth-hint warn">{10 - phone.length} digits remaining</p>
                )}
              </div>
              <button type="submit" className="cart-primary-cta" disabled={loading || phone.replace(/\D/g, '').length !== 10}>
                {loading ? <><ImSpinner8 className="spinner-sm" /> Checking…</> : 'Continue'}
              </button>
              <p className="auth-modal-foot">
                By continuing, you agree to our <a href="#">Terms</a> & <a href="#">Privacy</a>.
              </p>
            </form>
          </>
        )}

        {/* LOGIN STEP */}
        {view === 'login' && (
          <>
            <button onClick={goBackToPhone} className="auth-modal-back">
              <FiArrowLeft /> Change number
            </button>
            <h2 className="auth-modal-title">Welcome back!</h2>
            <p className="auth-modal-subtitle">
              <FiPhone style={{ marginRight: 4, verticalAlign: '-2px' }} />
              {maskPhone(phone)}
            </p>
            <form onSubmit={handleLogin} className="auth-modal-form">
              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-with-icon">
                  <FiLock className="input-icon" />
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-input"
                    autoComplete="current-password"
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </div>
              <button type="submit" className="cart-primary-cta" disabled={loading}>
                {loading ? <><ImSpinner8 className="spinner-sm" /> Logging in…</> : 'Login'}
              </button>
              <button
                type="button"
                onClick={() => switchView('forgot')}
                className="auth-modal-link-btn"
              >
                Forgot password?
              </button>
            </form>
          </>
        )}

        {/* REGISTER STEP */}
        {view === 'register' && (
          <>
            <button onClick={goBackToPhone} className="auth-modal-back">
              <FiArrowLeft /> Change number
            </button>
            <h2 className="auth-modal-title">Welcome to {brandName}!</h2>
            <p className="auth-modal-subtitle">
              <FiPhone style={{ marginRight: 4, verticalAlign: '-2px' }} />
              {maskPhone(phone)} — Set up your account
            </p>
            <form onSubmit={handleRegister} className="auth-modal-form">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <div className="input-with-icon">
                  <FiUser className="input-icon" />
                  <input
                    ref={nameRef}
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-input"
                    autoComplete="name"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Set Password</label>
                <div className="input-with-icon">
                  <FiLock className="input-icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-input"
                    autoComplete="new-password"
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <div className="input-with-icon">
                  <FiLock className="input-icon" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="form-input"
                    autoComplete="new-password"
                  />
                  <button type="button" className="password-toggle" onClick={() => setShowConfirm(!showConfirm)}>
                    {showConfirm ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="auth-hint error">Passwords do not match</p>
                )}
                {confirmPassword && password === confirmPassword && password.length >= 6 && (
                  <p className="auth-hint success"><FiCheck /> Passwords match</p>
                )}
              </div>
              <button type="submit" className="cart-primary-cta" disabled={loading}>
                {loading ? <><ImSpinner8 className="spinner-sm" /> Creating…</> : 'Create Account'}
              </button>
            </form>
          </>
        )}

        {/* FORGOT PASSWORD */}
        {view === 'forgot' && (
          <>
            <button onClick={() => switchView('login')} className="auth-modal-back">
              <FiArrowLeft /> Back to login
            </button>
            <h2 className="auth-modal-title">Forgot password?</h2>
            <p className="auth-modal-subtitle">We'll email you a reset link</p>
            {forgotSent ? (
              <div className="auth-forgot-success">
                <div className="auth-forgot-success-icon"><FiCheck /></div>
                <h3>Check your inbox</h3>
                <p>If <b>{forgotEmail}</b> is registered with us, you'll receive a reset link in a moment.</p>
                <button type="button" onClick={closeAuth} className="cart-primary-cta">Got it</button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="auth-modal-form">
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <div className="input-with-icon">
                    <FiMail className="input-icon" />
                    <input
                      ref={emailRef}
                      type="email"
                      placeholder="you@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="form-input"
                      autoComplete="email"
                    />
                  </div>
                </div>
                <button type="submit" className="cart-primary-cta" disabled={loading}>
                  {loading ? <><ImSpinner8 className="spinner-sm" /> Sending…</> : 'Send reset link'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default AuthModal
