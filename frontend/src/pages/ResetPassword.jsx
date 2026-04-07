import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import API from '../config/api'
import toast from 'react-hot-toast'
import { FiLock, FiEye, FiEyeOff } from 'react-icons/fi'
import { ImSpinner8 } from 'react-icons/im'

const ResetPassword = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [accountRole, setAccountRole] = useState('customer')
  const [email, setEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  })

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setTokenError('Reset link is missing or invalid.')
        setLoading(false)
        return
      }

      try {
        const response = await API.get(`/auth/forgot-password/verify?token=${encodeURIComponent(token)}`)
        setEmail(response.data?.email || '')
        setAccountRole(response.data?.role || 'customer')
      } catch (err) {
        setTokenError(err.response?.data?.message || 'This reset link is invalid or expired.')
      } finally {
        setLoading(false)
      }
    }

    verifyToken()
  }, [token])

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.newPassword.trim()) {
      toast.error('Please enter a new password')
      return
    }
    if (formData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    try {
      setSubmitting(true)
      const response = await API.post('/auth/reset-password', {
        token,
        newPassword: formData.newPassword
      })
      const nextRole = response.data?.role || accountRole
      const nextPath = nextRole === 'admin' ? '/admin/login' : '/login'
      toast.success('Password reset successfully!')
      navigate(nextPath, { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset password')
    } finally {
      setSubmitting(false)
    }
  }

  const loginPath = accountRole === 'admin' ? '/admin/login' : '/login'

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Set New Password</h2>
          <p className="auth-subtitle">
            {loading
              ? 'Verifying your reset link...'
              : tokenError
                ? tokenError
                : `Create a new password for ${email}`}
          </p>

          {loading ? (
            <div className="btn btn-secondary btn-lg btn-block" style={{ pointerEvents: 'none' }}>
              <ImSpinner8 className="spinner-sm" /> Verifying...
            </div>
          ) : tokenError ? (
            <p className="auth-switch">
              <Link to="/forgot-password" className="auth-link">
                Request a new reset link
              </Link>
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label className="form-label">New Password</label>
                <div className="input-with-icon">
                  <FiLock className="input-icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="newPassword"
                    placeholder="Enter new password"
                    value={formData.newPassword}
                    onChange={handleChange}
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
                    type={showPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    placeholder="Confirm new password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="form-input"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
                {submitting ? (
                  <>
                    <ImSpinner8 className="spinner-sm" /> Resetting...
                  </>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}

          <p className="auth-switch">
            <Link to={loginPath} className="auth-link">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ResetPassword
