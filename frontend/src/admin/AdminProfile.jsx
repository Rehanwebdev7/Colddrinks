import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import toast from 'react-hot-toast'
import { FaUserCog, FaLock, FaSave } from 'react-icons/fa'
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
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

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
      // Also update adminUser in localStorage
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
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast.error('Please fill in all password fields')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
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
    padding: '24px',
    border: `1px solid ${c.border}`,
    marginBottom: '20px'
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: c.text, margin: '0 0 24px 0' }}>
          <FaUserCog style={{ marginRight: '10px', color: '#0ea5e9' }} />
          Admin Profile
        </h1>

        {/* Profile Info */}
        <div style={cardStyle}>
          <h3 style={{ color: c.text, fontSize: '16px', fontWeight: '600', margin: '0 0 16px 0' }}>
            Profile Information
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                padding: '10px 24px', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
              }}
            >
              <FaSave /> {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div style={cardStyle}>
          <h3 style={{ color: c.text, fontSize: '16px', fontWeight: '600', margin: '0 0 16px 0' }}>
            <FaLock style={{ marginRight: '8px' }} />
            Change Password
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Current Password</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>New Password</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Confirm New Password</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <button
              onClick={handlePasswordSave}
              disabled={savingPassword}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-end',
                background: '#e23744', border: 'none', borderRadius: '8px',
                padding: '10px 24px', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
              }}
            >
              <FaLock /> {savingPassword ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

export default AdminProfile
