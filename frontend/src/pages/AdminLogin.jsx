import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { getBrandLogo } from '../utils/brandAssets'
import toast from 'react-hot-toast'
import { FiLock, FiEye, FiEyeOff, FiShield, FiPhone, FiMail, FiArrowRight } from 'react-icons/fi'
import { ImSpinner8 } from 'react-icons/im'

const AdminLogin = () => {
  const navigate = useNavigate()
  const { login, user, isAuthenticated } = useAuth()
  const { settings } = useSettings()
  const pageRef = useRef(null)
  const [formData, setFormData] = useState(() => ({
    identifier: localStorage.getItem('admin_remembered_identifier') || '',
    password: '',
  }))
  const [rememberMe, setRememberMe] = useState(Boolean(localStorage.getItem('admin_remembered_identifier')))
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  useLayoutEffect(() => {
    if (!pageRef.current) return undefined
    const root = pageRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const ctx = gsap.context(() => {
      const reveal = () => {
        gsap.set(['.cinematic-login-character', '.cinematic-login-bag', '.cinematic-login-card'], { clearProps: 'all' })
        gsap.set('.cinematic-login-card', { autoAlpha: 1 })
        gsap.set('.cinematic-login-field', { autoAlpha: 1, y: 0 })
      }

      if (reduceMotion) {
        reveal()
        return
      }

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: reveal })
      tl.set('.cinematic-login-card', { autoAlpha: 0, y: 100, scale: 0.94 })
        .set('.cinematic-login-character', { x: -240, autoAlpha: 0 })
        .set('.cinematic-login-bag', { autoAlpha: 0, y: 20, scale: 0.7 })
        .set('.cinematic-login-lid', { rotation: 0, transformOrigin: 'left bottom' })
        .set('.cinematic-login-light', { autoAlpha: 0, scale: 0.3 })
        .set('.cinematic-login-field', { autoAlpha: 0, y: 24 })
        .to('.cinematic-login-character', { duration: 2.2, x: 0, autoAlpha: 1, ease: 'power2.out' })
        .to('.cinematic-login-character', { duration: 0.25, y: -5, yoyo: true, repeat: 1, ease: 'sine.inOut' }, '-=0.05')
        .to('.cinematic-login-bag', { duration: 0.45, autoAlpha: 1, y: 0, scale: 1, ease: 'back.out(1.6)' }, '+=0.08')
        .to('.cinematic-login-bag', { duration: 0.18, y: -10, yoyo: true, repeat: 1, ease: 'power2.out' })
        .to('.cinematic-login-lid', { duration: 0.65, rotation: -105, ease: 'power2.inOut' })
        .to('.cinematic-login-light', { duration: 0.55, autoAlpha: 0.95, scale: 1, ease: 'power2.out' }, '-=0.35')
        .to('.cinematic-login-card', { duration: 0.85, autoAlpha: 1, y: 0, scale: 1, ease: 'back.out(1.15)' }, '-=0.12')
        .to('.cinematic-login-field', { duration: 0.42, autoAlpha: 1, y: 0, stagger: 0.12, ease: 'power3.out' }, '-=0.28')
        .to('.cinematic-login-character-art', { duration: 0.55, rotation: -2, transformOrigin: '75% 45%', ease: 'power2.out' }, '-=0.15')

      gsap.to('.cinematic-login-character-art', { y: -3, duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 5.7 })
      gsap.to('.cinematic-login-glow', { opacity: 0.55, scale: 1.1, duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 4.8 })
    }, root)
    return () => ctx.revert()
  }, [])

  if (isAuthenticated && user?.role === 'admin') {
    navigate('/admin', { replace: true })
    return null
  }

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.identifier.trim() || !formData.password.trim()) {
      toast.error('Please fill in all fields')
      return
    }
    try {
      setLoading(true)
      if (rememberMe) localStorage.setItem('admin_remembered_identifier', formData.identifier.trim())
      else localStorage.removeItem('admin_remembered_identifier')
      const result = await login(formData.identifier, formData.password, true)
      if (result.success && result.user?.role === 'admin') {
        window.location.href = '/admin'
      } else if (result.success) {
        toast.error('You are not authorized as admin')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    } catch (err) {
      console.error('Admin login error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="cinematic-login-page" ref={pageRef}>
      <div className="cinematic-login-stars" aria-hidden="true" />
      <div className="cinematic-login-shell">
        <section className="cinematic-login-stage" aria-hidden="true">
          <div className="cinematic-login-orbit cinematic-login-orbit-one" />
          <div className="cinematic-login-orbit cinematic-login-orbit-two" />
          <div className="cinematic-login-glow" />
          <div className="cinematic-login-character">
            <div className="cinematic-login-character-shadow" />
            <img className="cinematic-login-character-art" src="/login/businessman-3d.png" alt="" />
          </div>
          <div className="cinematic-login-bag">
            <div className="cinematic-login-light" />
            <div className="cinematic-login-lid"><span /></div>
            <div className="cinematic-login-bag-body"><span className="cinematic-login-bag-lock" /></div>
          </div>
          <p className="cinematic-login-caption">Secure access to your command center</p>
        </section>

        <section className="cinematic-login-card" aria-label="Admin login">
          <div className="cinematic-login-card-head cinematic-login-field">
            <div className="cinematic-login-logo-wrap"><img src={getBrandLogo(settings)} alt="" /></div>
            <div><span className="cinematic-login-eyebrow"><FiShield /> Private workspace</span><h1>Welcome back</h1><p>Sign in to your admin control panel.</p></div>
          </div>
          <form onSubmit={handleSubmit} className="cinematic-login-form">
            <label className="cinematic-login-field"><span>Email or mobile number</span><div className="cinematic-login-input"><FiMail /><input type="text" name="identifier" placeholder="admin@example.com" value={formData.identifier} onChange={handleChange} autoComplete="username" /></div></label>
            <label className="cinematic-login-field"><span>Password</span><div className="cinematic-login-input"><FiLock /><input type={showPassword ? 'text' : 'password'} name="password" placeholder="Enter your password" value={formData.password} onChange={handleChange} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <FiEyeOff /> : <FiEye />}</button></div></label>
            <div className="cinematic-login-options cinematic-login-field"><label><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> <span>Remember me</span></label><Link to="/forgot-password?mode=admin">Forgot password?</Link></div>
            <button className="cinematic-login-submit cinematic-login-field" type="submit" disabled={loading}>{loading ? <><ImSpinner8 className="cinematic-login-spinner" /> Signing in…</> : <>Enter dashboard <FiArrowRight /></>}</button>
          </form>
          <a href="/" className="cinematic-login-back">← Back to website</a>
        </section>
      </div>
    </main>
  )
}

export default AdminLogin
