import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import API from '../config/api'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import toast from 'react-hot-toast'
import {
  FiUser, FiMail, FiPhone, FiMapPin, FiEdit2, FiSave, FiX,
  FiPackage, FiCalendar, FiCamera
} from 'react-icons/fi'
import { ImSpinner8 } from 'react-icons/im'
import ImageCropModal from '../components/ImageCropModal'

const Profile = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading, updateProfile } = useAuth()
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [showCrop, setShowCrop] = useState(false)
  const [profileData, setProfileData] = useState({
    name: '', email: '', phone: '', address: '', avatar: ''
  })
  const [stats, setStats] = useState({ totalOrders: 0 })

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/login')
  }, [authLoading, isAuthenticated, navigate])

  const formatAddress = (addr) => {
    if (!addr) return ''
    if (typeof addr === 'string') return addr
    const parts = [addr.label, addr.street, addr.city, addr.state, addr.pincode].filter(Boolean)
    return parts.join(', ')
  }

  const getUserAddress = () => {
    return formatAddress(user?.addresses?.[0]) || formatAddress(user?.address) || ''
  }

  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: getUserAddress(),
        avatar: user.avatar || ''
      })
      fetchStats()
    }
  }, [user])

  const fetchStats = async () => {
    try {
      const response = await API.get('/orders')
      const data = response.data
      const orders = Array.isArray(data) ? data : data?.orders || []
      setStats({ totalOrders: orders.length })
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  const handleChange = (e) => {
    setProfileData({ ...profileData, [e.target.name]: e.target.value })
  }

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setCropSrc(reader.result)
      setShowCrop(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCropDone = (croppedDataUrl) => {
    setProfileData((prev) => ({ ...prev, avatar: croppedDataUrl }))
    toast.success('Profile image selected')
  }

  const handleAvatarRemove = () => {
    setProfileData((prev) => ({ ...prev, avatar: '' }))
    toast.success('Profile image removed')
  }

  const handleSave = async () => {
    if (!profileData.name.trim()) {
      toast.error('Name is required')
      return
    }
    try {
      setSaving(true)
      const result = await updateProfile(profileData)
      if (result.success) setIsEditing(false)
    } catch (err) {
      console.error('Profile update error:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setProfileData({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      address: getUserAddress(),
      avatar: user.avatar || ''
    })
    setIsEditing(false)
  }

  const formatMemberSince = () => {
    if (!user?.createdAt) return 'N/A'
    return new Date(user.createdAt).toLocaleDateString('en-IN', {
      month: 'long', year: 'numeric'
    })
  }

  if (authLoading) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="loader-container page-min-height">
          <ImSpinner8 className="spinner" />
        </div>
        <Footer />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="page-wrapper">
      <Navbar />

      <div className="container section-padding">
        <h1 className="page-title">My Profile</h1>

        {/* Profile Info Card */}
        <div className="profile-card">
          <div className="profile-header">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar">
                {profileData.avatar ? (
                  <img src={profileData.avatar} alt={user.name || 'User'} className="profile-avatar-image" />
                ) : (
                  user.name?.charAt(0)?.toUpperCase() || 'U'
                )}
              </div>
              {isEditing && (
                <>
                  <div className="profile-avatar-actions">
                    <button
                      type="button"
                      className="profile-avatar-upload"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FiCamera /> Upload Photo
                    </button>
                    <button
                      type="button"
                      className="profile-avatar-upload"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <FiCamera /> Use Camera
                    </button>
                    {profileData.avatar && (
                      <button
                        type="button"
                        className="profile-avatar-upload profile-avatar-remove"
                        onClick={handleAvatarRemove}
                      >
                        <FiX /> Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleAvatarSelect}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleAvatarSelect}
                  />
                </>
              )}
            </div>
            <div className="profile-header-info">
              <h2>{user.name}</h2>
              <p className="member-since">
                <FiCalendar className="inline-icon" />
                Royal member since {formatMemberSince()}
              </p>
            </div>
            {!isEditing ? (
              <button className="btn btn-outline btn-sm" onClick={() => setIsEditing(true)}>
                <FiEdit2 /> Edit
              </button>
            ) : (
              <div className="profile-edit-actions">
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                  {saving ? <ImSpinner8 className="spinner-sm" /> : <FiSave />} Save
                </button>
                <button className="btn btn-outline btn-sm" onClick={handleCancelEdit}>
                  <FiX /> Cancel
                </button>
              </div>
            )}
          </div>

          <div className="profile-details">
            <div className="profile-field">
              <label className="profile-field-label"><FiUser className="inline-icon" /> Name</label>
              {isEditing ? (
                <input type="text" name="name" value={profileData.name} onChange={handleChange} className="form-input" />
              ) : (
                <p className="profile-field-value">{user.name}</p>
              )}
            </div>

            <div className="profile-field">
              <label className="profile-field-label"><FiMail className="inline-icon" /> Email</label>
              {isEditing ? (
                <input type="email" name="email" value={profileData.email} onChange={handleChange} className="form-input" />
              ) : (
                <p className="profile-field-value">{user.email}</p>
              )}
            </div>

            <div className="profile-field">
              <label className="profile-field-label"><FiPhone className="inline-icon" /> Phone</label>
              {isEditing ? (
                <input type="tel" name="phone" value={profileData.phone} onChange={handleChange} className="form-input" />
              ) : (
                <p className="profile-field-value">{user.phone || 'Not provided'}</p>
              )}
            </div>

            <div className="profile-field">
              <label className="profile-field-label"><FiMapPin className="inline-icon" /> Address</label>
              {isEditing ? (
                <textarea name="address" value={profileData.address} onChange={handleChange} className="form-textarea" rows={2} />
              ) : (
                <p className="profile-field-value">{getUserAddress() || 'Not provided'}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats Card - Full Width */}
        <div className="profile-stats-card" style={{ marginTop: 24, cursor: 'pointer' }} onClick={() => navigate('/orders')}>
          <div className="stat-item">
            <FiPackage className="stat-icon" />
            <div>
              <p className="stat-value">{stats.totalOrders}</p>
              <p className="stat-label">Total Orders</p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
      <ImageCropModal isOpen={showCrop} onClose={() => setShowCrop(false)} imageSrc={cropSrc} onCropDone={handleCropDone} aspect={1} />
    </div>
  )
}

export default Profile
