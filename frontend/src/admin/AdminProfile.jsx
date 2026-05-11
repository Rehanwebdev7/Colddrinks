import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import toast from 'react-hot-toast'
import { FaUserCog, FaLock, FaSave, FaEye, FaEyeSlash, FaCheckCircle, FaTimesCircle } from 'react-icons/fa'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'

const AdminProfile = () => {
  const { user, updateProfile } = useAuth()
  const { darkMode } = useTheme()
  const c = getColors(darkMode)

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || ''
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showPwd, setShowPwd] = useState({ current: false, next: false, confirm: false })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  // Password validation rules
  const pwdChecks = useMemo(() => {
    const np = passwordForm.newPassword
    return {
      hasLength: np.length >= 6,
      hasMix: /[a-zA-Z]/.test(np) && /\d/.test(np),
      notSameAsCurrent: np.length > 0 && np !== passwordForm.currentPassword,
      matchesConfirm: np.length > 0 && np === passwordForm.confirmPassword,
    }
  }, [passwordForm])

  const pwdValid = passwordForm.currentPassword.length > 0
    && pwdChecks.hasLength
    && pwdChecks.matchesConfirm
    && pwdChecks.notSameAsCurrent

  const handleProfileSave = async () => {
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      toast.error('Name and email are required')
      return
    }
    try {
      setSavingProfile(true)
      await updateProfile({
        name: profileForm.name,
        email: profileForm.email,
        phone: profileForm.phone
      })
      const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}')
      const updated = { ...adminUser, name: profileForm.name, email: profileForm.email, phone: profileForm.phone }
      localStorage.setItem('adminUser', JSON.stringify(updated))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordSave = async () => {
    if (!pwdValid) {
      toast.error('Please fix the password requirements highlighted below')
      return
    }
    try {
      setSavingPassword(true)
      await API.put('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      })
      toast.success('Password changed successfully')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setShowPwd({ current: false, next: false, confirm: false })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password')
    } finally {
      setSavingPassword(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    background: c.inputBg,
    color: c.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  }

  const pwdInputStyle = { ...inputStyle, paddingRight: '42px' }

  const labelStyle = {
    display: 'block',
    color: c.textSecondary,
    fontSize: '13px',
    fontWeight: '500',
    marginBottom: '6px'
  }

  const cardStyle = {
    background: c.surface,
    borderRadius: '14px',
    padding: '20px',
    border: `1px solid ${c.border}`,
    height: '100%',
    boxSizing: 'border-box',
  }

  const eyeBtnStyle = {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: c.textSecondary,
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
  }

  const checkItem = (ok, label) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: ok ? '#22c55e' : c.textSecondary }}>
      {ok ? <FaCheckCircle /> : <FaTimesCircle style={{ opacity: 0.5 }} />} {label}
    </div>
  )

  return (
    <AdminLayout>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: c.text, margin: '0 0 18px 0' }}>
          <FaUserCog style={{ marginRight: '10px', color: '#0ea5e9' }} />
          Admin Profile
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', alignItems: 'stretch' }}>
          {/* Profile Information */}
          <div style={cardStyle}>
            <h3 style={{ color: c.text, fontSize: '15px', fontWeight: '600', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaUserCog style={{ color: '#0ea5e9' }} /> Profile Information
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Full Name</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm(p => ({ ...p, name: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Email Address</label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm(p => ({ ...p, email: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Phone Number</label>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <button
                onClick={handleProfileSave}
                disabled={savingProfile}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-end',
                  background: '#0ea5e9', border: 'none', borderRadius: '8px',
                  padding: '10px 22px', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                  opacity: savingProfile ? 0.7 : 1,
                }}
              >
                <FaSave /> {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>

          {/* Change Password */}
          <div style={cardStyle}>
            <h3 style={{ color: c.text, fontSize: '15px', fontWeight: '600', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaLock style={{ color: '#e23744' }} /> Change Password
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Current Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPwd.current ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))}
                    style={pwdInputStyle}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPwd(p => ({ ...p, current: !p.current }))} style={eyeBtnStyle} aria-label="Toggle current password visibility">
                    {showPwd.current ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPwd.next ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                    style={pwdInputStyle}
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPwd(p => ({ ...p, next: !p.next }))} style={eyeBtnStyle} aria-label="Toggle new password visibility">
                    {showPwd.next ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Confirm New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPwd.confirm ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    style={pwdInputStyle}
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPwd(p => ({ ...p, confirm: !p.confirm }))} style={eyeBtnStyle} aria-label="Toggle confirm password visibility">
                    {showPwd.confirm ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              {/* Inline validation checklist (only after user starts typing new password) */}
              {passwordForm.newPassword.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '8px' }}>
                  {checkItem(pwdChecks.hasLength, 'At least 6 characters')}
                  {checkItem(pwdChecks.hasMix, 'Mix of letters and numbers (recommended)')}
                  {checkItem(pwdChecks.notSameAsCurrent, 'Different from current password')}
                  {checkItem(pwdChecks.matchesConfirm, 'New & confirm match')}
                </div>
              )}

              <button
                onClick={handlePasswordSave}
                disabled={savingPassword || !pwdValid}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-end',
                  background: pwdValid ? '#e23744' : c.border,
                  border: 'none', borderRadius: '8px',
                  padding: '10px 22px',
                  color: pwdValid ? '#fff' : c.textSecondary,
                  fontSize: '14px', fontWeight: '600',
                  cursor: pwdValid ? 'pointer' : 'not-allowed',
                  opacity: savingPassword ? 0.7 : 1,
                }}
              >
                <FaLock /> {savingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

export default AdminProfile
