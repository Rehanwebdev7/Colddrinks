import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import API from '../config/api'
import toast from 'react-hot-toast'
import { FiMail, FiArrowLeft } from 'react-icons/fi'
import { ImSpinner8 } from 'react-icons/im'

const ForgotPassword = () => {
  const [searchParams] = useSearchParams()
  const isAdmin = searchParams.get('mode') === 'admin'
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const loginPath = isAdmin ? '/admin/login' : '/login'
  const title = isAdmin ? 'Admin Password Reset' : 'Forgot Password'

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!email.trim()) {
      toast.error('Please enter your registered email')
      return
    }

    try {
      setLoading(true)
      await API.post('/auth/forgot-password', { email: email.trim() })
      toast.success('If the email exists, the reset link has been sent.')
      setSubmitted(true)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Link to={loginPath} className="password-toggle" style={{ position: 'static' }} aria-label="Back">
              <FiArrowLeft />
            </Link>
            <div>
              <h2 className="auth-title" style={{ marginBottom: '6px' }}>{title}</h2>
              <p className="auth-subtitle" style={{ marginBottom: 0 }}>
                {submitted
                  ? 'Check your inbox for the password reset link.'
                  : 'Enter your registered email and we will send you a reset link.'}
              </p>
            </div>
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-with-icon">
                  <FiMail className="input-icon" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-input"
                    placeholder="Enter your registered email"
                    autoComplete="email"
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
                {loading ? (
                  <>
                    <ImSpinner8 className="spinner-sm" /> Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>
          ) : (
            <div className="auth-form">
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'rgba(14, 165, 233, 0.08)',
                  border: '1px solid rgba(14, 165, 233, 0.2)',
                  color: 'var(--text-secondary)'
                }}
              >
                If an account exists for <strong>{email}</strong>, the reset link has been sent.
              </div>

              <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={() => setSubmitted(false)}>
                Try Another Email
              </button>
            </div>
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

export default ForgotPassword
