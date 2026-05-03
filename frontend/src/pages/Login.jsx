import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import toast from 'react-hot-toast'
import { MdLocalDrink } from 'react-icons/md'
import { FiPhone, FiLock, FiEye, FiEyeOff, FiArrowLeft, FiCheck } from 'react-icons/fi'
import { ImSpinner8 } from 'react-icons/im'

const maskPhone = (phone) => {
  if (!phone || phone.length < 6) return phone
  return phone.slice(0, 2) + 'XXXX' + phone.slice(-4)
}

const Login = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { checkPhone, login, register } = useAuth()
  const { hydrateCustomerCart } = useCart()

  const [step, setStep] = useState('phone') // 'phone' | 'login' | 'register'
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  const phoneRef = useRef(null)
  const passwordRef = useRef(null)

  useEffect(() => {
    if (step === 'phone' && phoneRef.current) phoneRef.current.focus()
    if ((step === 'login' || step === 'register') && passwordRef.current) passwordRef.current.focus()
  }, [step])

  const getPostLoginPath = () => {
    const returnTo = location.state?.returnTo
    if (typeof returnTo !== 'string') return '/'
    if (!returnTo.startsWith('/') || returnTo.startsWith('/admin') || returnTo === '/login') return '/'
    return returnTo
  }

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
      if (result.exists) {
        setStep('login')
      } else {
        setStep('register')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!password.trim()) {
      toast.error('Please enter your password')
      return
    }
    try {
      setLoading(true)
      const result = await login(phone.replace(/\D/g, ''), password, false)
      if (result.success) {
        await hydrateCustomerCart(result.user?.id)
        navigate(getPostLoginPath(), { replace: true })
      }
    } catch (err) {
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!password.trim()) {
      toast.error('Please set a password')
      return
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    try {
      setLoading(true)
      const result = await register({
        phone: phone.replace(/\D/g, ''),
        password,
      })
      if (result.success) {
        await hydrateCustomerCart(result.user?.id)
        navigate(getPostLoginPath(), { replace: true })
      }
    } catch (err) {
      console.error('Register error:', err)
    } finally {
      setLoading(false)
    }
  }

  const goBack = () => {
    setStep('phone')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirm(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* Brand */}
        <div className="auth-brand">
          <MdLocalDrink className="auth-brand-icon" />
          <h1 className="auth-brand-name">Royal</h1>
        </div>

        <div className="auth-card">

          {/* ────── STEP: PHONE ────── */}
          {step === 'phone' && (
            <>
              <h2 className="auth-title">Login or Register</h2>
              <p className="auth-subtitle">Enter your mobile number to continue</p>

              <form onSubmit={handlePhoneSubmit} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Mobile Number</label>
                  <div className="input-with-icon">
                    <FiPhone className="input-icon" />
                    <input
                      ref={phoneRef}
                      type="tel"
                      inputMode="numeric"
                      placeholder="Enter 10-digit mobile number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                      className="form-input"
                      autoComplete="tel"
                      style={{ fontSize: 18, letterSpacing: 1.5 }}
                    />
                  </div>
                  {phone.length > 0 && phone.length < 10 && (
                    <p style={{ color: '#f97316', fontSize: 12, marginTop: 6 }}>{10 - phone.length} digits remaining</p>
                  )}
                  {phone.length === 10 && (
                    <p style={{ color: '#22c55e', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}><FiCheck /> Valid number</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg btn-block"
                  disabled={loading || phone.replace(/\D/g, '').length !== 10}
                >
                  {loading ? (
                    <><ImSpinner8 className="spinner-sm" /> Checking...</>
                  ) : (
                    'Continue'
                  )}
                </button>
              </form>
            </>
          )}

          {/* ────── STEP: LOGIN ────── */}
          {step === 'login' && (
            <>
              <button onClick={goBack} className="smart-auth-back">
                <FiArrowLeft /> Change number
              </button>

              <h2 className="auth-title">Welcome Back!</h2>
              <p className="auth-subtitle">
                <FiPhone style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {maskPhone(phone)}
              </p>

              <form onSubmit={handleLogin} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="input-with-icon">
                    <FiLock className="input-icon" />
                    <input
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="form-input"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg btn-block"
                  disabled={loading}
                >
                  {loading ? (
                    <><ImSpinner8 className="spinner-sm" /> Logging in...</>
                  ) : (
                    'Login'
                  )}
                </button>
              </form>

              <p className="auth-switch" style={{ marginTop: 14, marginBottom: 0 }}>
                <Link to="/forgot-password" className="auth-link">
                  Forgot Password?
                </Link>
              </p>
            </>
          )}

          {/* ────── STEP: REGISTER ────── */}
          {step === 'register' && (
            <>
              <button onClick={goBack} className="smart-auth-back">
                <FiArrowLeft /> Change number
              </button>

              <h2 className="auth-title">New Here!</h2>
              <p className="auth-subtitle">
                <FiPhone style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {maskPhone(phone)} — Set a password to get started
              </p>

              <form onSubmit={handleRegister} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Set Password</label>
                  <div className="input-with-icon">
                    <FiLock className="input-icon" />
                    <input
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="form-input"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
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
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowConfirm(!showConfirm)}
                    >
                      {showConfirm ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>Passwords do not match</p>
                  )}
                  {confirmPassword && password === confirmPassword && password.length >= 6 && (
                    <p style={{ color: '#22c55e', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}><FiCheck /> Passwords match</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg btn-block"
                  disabled={loading}
                >
                  {loading ? (
                    <><ImSpinner8 className="spinner-sm" /> Creating account...</>
                  ) : (
                    'Create Account & Login'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Login
