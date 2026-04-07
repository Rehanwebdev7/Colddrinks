import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { MdLocalDrink } from 'react-icons/md'
import { FiPhone, FiLock, FiEye, FiEyeOff } from 'react-icons/fi'
import { ImSpinner8 } from 'react-icons/im'

const Login = () => {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

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
      const result = await login(formData.identifier, formData.password, false)
      if (result.success) {
        navigate('/')
      }
    } catch (err) {
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
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
          <h2 className="auth-title">Welcome Back</h2>
          <p className="auth-subtitle">Login to your account</p>

          <form onSubmit={handleSubmit} className="auth-form">
            {/* Identifier (Phone or Email) */}
            <div className="form-group">
              <label className="form-label">Mobile Number / Email</label>
              <div className="input-with-icon">
                <FiPhone className="input-icon" />
                <input
                  type="text"
                  name="identifier"
                  placeholder="Enter mobile number or email"
                  value={formData.identifier}
                  onChange={handleChange}
                  className="form-input"
                  autoComplete="tel email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="input-with-icon">
                <FiLock className="input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
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

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary btn-lg btn-block"
              disabled={loading}
            >
              {loading ? (
                <>
                  <ImSpinner8 className="spinner-sm" /> Logging in...
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>

          <p className="auth-switch" style={{ marginTop: '14px', marginBottom: 0 }}>
            <Link to="/forgot-password" className="auth-link">
              Forgot Password?
            </Link>
          </p>

          {/* Register Link */}
          <p className="auth-switch">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="auth-link">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
