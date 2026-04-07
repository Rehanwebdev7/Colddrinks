import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { FiLock, FiEye, FiEyeOff, FiShield, FiPhone } from 'react-icons/fi'
import { ImSpinner8 } from 'react-icons/im'

const AdminLogin = () => {
  const navigate = useNavigate()
  const { login, user, isAuthenticated } = useAuth()

  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  if (isAuthenticated && user?.role === 'admin') {
    navigate('/admin', { replace: true })
    return null
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.identifier.trim() || !formData.password.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    try {
      setLoading(true)
      const result = await login(formData.identifier, formData.password, true)
      if (result.success) {
        if (result.user?.role === 'admin') {
          window.location.href = '/admin'
          return
        }

        toast.error('You are not authorized as admin')
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.href = '/admin/login'
      }
    } catch (err) {
      console.error('Admin login error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.brand}>
          <div style={styles.shieldIcon}>
            <FiShield />
          </div>
          <h1 style={styles.brandName}>Royal Admin</h1>
          <p style={styles.brandSub}>Admin Control Panel</p>
        </div>

        <div style={styles.card}>
          <h2 style={styles.title}>Admin Login</h2>
          <p style={styles.subtitle}>Enter admin credentials to continue</p>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email or Mobile Number</label>
              <div style={styles.inputWrapper}>
                <FiPhone style={styles.inputIcon} />
                <input
                  type="text"
                  name="identifier"
                  placeholder="Email or mobile number"
                  value={formData.identifier}
                  onChange={handleChange}
                  style={styles.input}
                  autoComplete="tel email"
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Password</label>
              <div style={styles.inputWrapper}>
                <FiLock style={styles.inputIcon} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Admin password"
                  value={formData.password}
                  onChange={handleChange}
                  style={styles.input}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  style={styles.eyeBtn}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'right', marginTop: '-8px' }}>
              <Link to="/forgot-password?mode=admin" style={styles.forgotLink}>
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              style={{
                ...styles.submitBtn,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <ImSpinner8 style={styles.spinnerIcon} /> Logging in...
                </>
              ) : (
                'Login to Admin Panel'
              )}
            </button>
          </form>
        </div>

        <p style={styles.backLink}>
          <a href="/" style={styles.link}>Back to Website</a>
        </p>
      </div>

      <style>{`
        @keyframes adminSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: "'Inter', 'Poppins', sans-serif",
  },
  container: {
    width: '100%',
    maxWidth: '420px',
  },
  brand: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  shieldIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    color: '#fff',
    marginBottom: '16px',
    boxShadow: '0 8px 24px rgba(14, 165, 233, 0.3)',
  },
  brandName: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#f1f5f9',
    margin: '0 0 4px 0',
  },
  brandSub: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0,
  },
  card: {
    background: '#1e293b',
    borderRadius: '16px',
    border: '1px solid #334155',
    padding: '32px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#f1f5f9',
    margin: '0 0 6px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    margin: '0 0 24px 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#94a3b8',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '14px',
    color: '#475569',
    fontSize: '16px',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '12px 14px 12px 42px',
    border: '1px solid #334155',
    borderRadius: '10px',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  eyeBtn: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '8px',
    boxShadow: '0 4px 16px rgba(14, 165, 233, 0.3)',
    transition: 'all 0.2s',
  },
  spinnerIcon: {
    animation: 'adminSpin 0.8s linear infinite',
    fontSize: '16px',
  },
  forgotLink: {
    color: '#0ea5e9',
    fontSize: '13px',
    cursor: 'pointer',
    padding: 0,
    fontWeight: '500',
    transition: 'color 0.2s',
    textDecoration: 'none',
  },
  backLink: {
    textAlign: 'center',
    marginTop: '20px',
    fontSize: '13px',
  },
  link: {
    color: '#64748b',
    textDecoration: 'none',
    transition: 'color 0.2s',
  },
}

export default AdminLogin
