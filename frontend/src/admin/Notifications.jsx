import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import {
  FaBell, FaShoppingCart, FaMoneyBillWave, FaExclamationTriangle,
  FaInfoCircle, FaPaperPlane, FaCheck, FaCheckDouble, FaFilter,
  FaEnvelope, FaEnvelopeOpen
} from 'react-icons/fa'
import ImageCropModal from '../components/ImageCropModal'

const notificationTypes = [
  { value: 'order', label: 'Order Update', icon: <FaShoppingCart />, color: '#0ea5e9' },
  { value: 'payment', label: 'Payment', icon: <FaMoneyBillWave />, color: '#22c55e' },
  { value: 'stock', label: 'Stock Alert', icon: <FaExclamationTriangle />, color: '#f59e0b' },
  { value: 'general', label: 'General', icon: <FaInfoCircle />, color: '#8b5cf6' }
]

const getNotificationIcon = (type) => {
  const found = notificationTypes.find(t => t.value === type)
  return found ? { icon: found.icon, color: found.color } : { icon: <FaBell />, color: '#94a3b8' }
}

const Notifications = () => {
  const { user } = useAuth()
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const [notifications, setNotifications] = useState([])
  const [filteredNotifications, setFilteredNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, unread, order, payment, stock, general
  const [showSendModal, setShowSendModal] = useState(false)
  const [users, setUsers] = useState([])
  const [sendForm, setSendForm] = useState({
    type: 'general',
    target: 'all',
    userId: '',
    title: '',
    message: '',
    image: ''
  })
  const [sending, setSending] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [cropSrc, setCropSrc] = useState(null)
  const [showCrop, setShowCrop] = useState(false)

  useEffect(() => {
    fetchNotifications()
    fetchUsers()
  }, [])

  useEffect(() => {
    applyFilter()
  }, [notifications, filter])

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const response = await API.get('/notifications')
      const data = response.data.notifications || response.data || []
      data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      setNotifications(data)
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
      toast.error('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await API.get('/users')
      const data = response.data.users || response.data || []
      setUsers(data.filter(u => u.role !== 'admin'))
    } catch {
      setUsers([])
    }
  }

  const applyFilter = () => {
    let filtered = [...notifications]

    if (filter === 'unread') {
      filtered = filtered.filter(n => !n.isRead && !n.read)
    } else if (filter !== 'all') {
      filtered = filtered.filter(n => n.type === filter)
    }

    setFilteredNotifications(filtered)
  }

  const markAsRead = async (notificationId) => {
    try {
      await API.put(`/notifications/${notificationId}/read`)
      setNotifications(prev =>
        prev.map(n => n._id === notificationId ? { ...n, isRead: true, read: true } : n)
      )
    } catch (error) {
      toast.error('Failed to mark as read')
    }
  }

  const markAllAsRead = async () => {
    try {
      await API.put('/notifications/read-all')
      setNotifications(prev =>
        prev.map(n => ({ ...n, isRead: true, read: true }))
      )
      toast.success('All notifications marked as read')
    } catch (error) {
      toast.error('Failed to mark all as read')
    }
  }

  const handleSendFormChange = (e) => {
    const { name, value } = e.target
    setSendForm(prev => ({ ...prev, [name]: value }))
  }

  const handleNotifImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select a valid image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image size must be less than 5MB'); return }
    const reader = new FileReader()
    reader.onloadend = () => {
      setCropSrc(reader.result)
      setShowCrop(true)
    }
    reader.onerror = () => toast.error('Failed to read image file')
    reader.readAsDataURL(file)
  }

  const handleCropDone = (croppedDataUrl) => {
    setSendForm(prev => ({ ...prev, image: croppedDataUrl }))
  }

  const filteredUsers = userSearch
    ? users.filter(u =>
        (u.name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.phone || '').includes(userSearch) ||
        (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
      )
    : users

  const handleSend = async () => {
    if (!sendForm.title.trim() || !sendForm.message.trim()) {
      toast.error('Title and message are required')
      return
    }

    try {
      setSending(true)
      const payload = {
        type: sendForm.type,
        title: sendForm.title,
        message: sendForm.message,
        image: sendForm.image || ''
      }

      if (sendForm.target === 'all') {
        payload.sendToAll = true
      } else {
        payload.targetUserId = sendForm.userId
      }

      await API.post('/notifications/send', payload)
      toast.success('Notification sent successfully')
      setShowSendModal(false)
      setSendForm({ type: 'general', target: 'all', userId: '', title: '', message: '', image: '' })
      fetchNotifications()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send notification')
    } finally {
      setSending(false)
    }
  }

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(date).toLocaleDateString('en-IN')
  }

  const unreadCount = notifications.filter(n => !n.isRead && !n.read).length

  const styles = getStyles(c)

  if (loading) {
    return (
      <AdminLayout>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading notifications...</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div style={styles.page}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Notifications</h1>
            {unreadCount > 0 && (
              <p style={styles.subtitle}>{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
            )}
          </div>
          <div style={styles.headerActions}>
            {unreadCount > 0 && (
              <button style={styles.markAllBtn} onClick={markAllAsRead}>
                <FaCheckDouble /> Mark All Read
              </button>
            )}
            <button style={styles.sendBtn} onClick={() => setShowSendModal(true)}>
              <FaPaperPlane /> Send Notification
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={styles.filterBar}>
          {['all', 'unread', 'order', 'payment', 'stock', 'general'].map(f => (
            <button
              key={f}
              style={{
                ...styles.filterBtn,
                ...(filter === f ? styles.activeFilterBtn : {})
              }}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' :
               f === 'unread' ? `Unread (${unreadCount})` :
               f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Notification Feed */}
        <div style={styles.feedCard}>
          {filteredNotifications.length === 0 ? (
            <div style={styles.emptyState}>
              <FaBell style={{ fontSize: '40px', color: c.border, marginBottom: '12px' }} />
              <p style={styles.emptyText}>No notifications</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => {
              const isRead = notification.isRead || notification.read
              const { icon, color } = getNotificationIcon(notification.type)

              return (
                <div
                  key={notification._id}
                  style={{
                    ...styles.notificationItem,
                    background: isRead ? c.surface : 'rgba(14, 165, 233, 0.05)',
                    borderLeft: isRead ? '3px solid transparent' : `3px solid ${color}`
                  }}
                  onClick={() => !isRead && markAsRead(notification._id)}
                >
                  <div style={{ ...styles.notifIcon, background: `${color}20`, color }}>
                    {icon}
                  </div>
                  <div style={styles.notifContent}>
                    <div style={styles.notifHeader}>
                      <h4 style={{
                        ...styles.notifTitle,
                        fontWeight: isRead ? '400' : '600'
                      }}>
                        {notification.title}
                      </h4>
                      <span style={styles.notifTime}>{timeAgo(notification.createdAt)}</span>
                    </div>
                    <p style={styles.notifMessage}>{notification.message}</p>
                    {notification.image && (
                      <img
                        src={notification.image}
                        alt=""
                        style={{ marginTop: '8px', maxWidth: '200px', maxHeight: '120px', borderRadius: '8px', objectFit: 'cover', border: `1px solid ${c.border}` }}
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    )}
                  </div>
                  <div style={styles.notifStatus}>
                    {isRead ? (
                      <FaEnvelopeOpen style={{ color: c.textSecondary, fontSize: '14px' }} />
                    ) : (
                      <FaEnvelope style={{ color: '#0ea5e9', fontSize: '14px' }} />
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Send Notification Modal */}
        {showSendModal && (
          <Modal onClose={() => setShowSendModal(false)}>
            <div style={styles.modalContent}>
              <h2 style={styles.modalTitle}>Send Notification</h2>

              <div style={styles.formGroup}>
                <label style={styles.label}>Type</label>
                <select
                  name="type"
                  value={sendForm.type}
                  onChange={handleSendFormChange}
                  style={styles.input}
                >
                  {notificationTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Target</label>
                <select
                  name="target"
                  value={sendForm.target}
                  onChange={handleSendFormChange}
                  style={styles.input}
                >
                  <option value="all">All Users</option>
                  <option value="specific">Specific User</option>
                </select>
              </div>

              {sendForm.target === 'specific' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Search & Select User</label>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    style={styles.input}
                    placeholder="Search by name, phone, or email..."
                  />
                  {sendForm.userId && (
                    <div style={{ marginTop: '6px', padding: '6px 10px', background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: '6px', color: '#0ea5e9', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Selected: {users.find(u => u._id === sendForm.userId)?.name || 'User'}</span>
                      <button type="button" onClick={() => setSendForm(prev => ({ ...prev, userId: '' }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Clear</button>
                    </div>
                  )}
                  <div style={{ maxHeight: '160px', overflowY: 'auto', marginTop: '6px', borderRadius: '8px', border: filteredUsers.length > 0 && userSearch ? `1px solid ${c.border}` : 'none' }}>
                    {userSearch && filteredUsers.map(u => (
                      <div
                        key={u._id}
                        onClick={() => { setSendForm(prev => ({ ...prev, userId: u._id })); setUserSearch('') }}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${c.border}`, fontSize: '13px', color: sendForm.userId === u._id ? '#0ea5e9' : c.text, background: sendForm.userId === u._id ? 'rgba(14,165,233,0.05)' : 'transparent' }}
                      >
                        <div style={{ fontWeight: '500' }}>{u.name || 'N/A'}</div>
                        <div style={{ fontSize: '11px', color: c.textSecondary }}>{u.phone || ''} {u.email ? `· ${u.email}` : ''}</div>
                      </div>
                    ))}
                    {userSearch && filteredUsers.length === 0 && (
                      <div style={{ padding: '12px', textAlign: 'center', color: c.textSecondary, fontSize: '13px' }}>No users found</div>
                    )}
                  </div>
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Title</label>
                <input
                  type="text"
                  name="title"
                  value={sendForm.title}
                  onChange={handleSendFormChange}
                  style={styles.input}
                  placeholder="Notification title"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Message</label>
                <textarea
                  name="message"
                  value={sendForm.message}
                  onChange={handleSendFormChange}
                  style={{ ...styles.input, minHeight: '100px', resize: 'vertical' }}
                  placeholder="Notification message..."
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Image <span style={{ color: c.textSecondary, fontSize: '11px' }}>(optional)</span></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', border: `1px dashed ${c.border}`, borderRadius: '8px', background: c.bg }}>
                  {sendForm.image ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <img src={sendForm.image} alt="Preview" style={{ maxWidth: '80px', maxHeight: '60px', borderRadius: '6px', objectFit: 'cover', border: `1px solid ${c.border}` }} onError={(e) => { e.target.style.display = 'none' }} />
                      <button type="button" onClick={() => setSendForm(prev => ({ ...prev, image: '' }))} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px', padding: '2px 8px', color: '#ef4444', fontSize: '11px', cursor: 'pointer' }}>Remove</button>
                    </div>
                  ) : (
                    <span style={{ color: c.textSecondary, fontSize: '12px' }}>No image</span>
                  )}
                  <input type="file" accept="image/*" onChange={handleNotifImageUpload} style={{ display: 'none' }} id="notif-image-upload" />
                  <label htmlFor="notif-image-upload" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: c.border, border: `1px solid ${c.textSecondary}`, borderRadius: '6px', padding: '6px 12px', color: c.text, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Upload</label>
                </div>
                <div style={{ marginTop: '6px' }}>
                  <label style={{ display: 'block', color: c.textSecondary, fontSize: '11px', marginBottom: '4px' }}>Or enter image URL</label>
                  <input
                    type="text"
                    name="image"
                    value={sendForm.image && !sendForm.image.startsWith('data:') ? sendForm.image : ''}
                    onChange={handleSendFormChange}
                    style={styles.input}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button style={styles.cancelBtn} onClick={() => setShowSendModal(false)}>Cancel</button>
                <button style={styles.submitBtn} onClick={handleSend} disabled={sending}>
                  {sending ? 'Sending...' : 'Send Notification'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
      <ImageCropModal isOpen={showCrop} onClose={() => setShowCrop(false)} imageSrc={cropSrc} onCropDone={handleCropDone} />
    </AdminLayout>
  )
}

const getStyles = (c) => ({
  page: {
    padding: '24px',
    maxWidth: '1000px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: c.text,
    margin: 0
  },
  subtitle: {
    color: c.textSecondary,
    fontSize: '14px',
    marginTop: '4px'
  },
  headerActions: {
    display: 'flex',
    gap: '10px'
  },
  markAllBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(14, 165, 233, 0.1)',
    border: '1px solid rgba(14, 165, 233, 0.3)',
    borderRadius: '8px',
    padding: '8px 16px',
    color: '#0ea5e9',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  sendBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  filterBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  filterBtn: {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: '20px',
    padding: '8px 16px',
    color: c.textSecondary,
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s'
  },
  activeFilterBtn: {
    background: 'rgba(14, 165, 233, 0.1)',
    borderColor: '#0ea5e9',
    color: '#0ea5e9'
  },
  feedCard: {
    background: c.surface,
    borderRadius: '12px',
    border: `1px solid ${c.border}`,
    overflow: 'hidden'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px'
  },
  emptyText: {
    color: c.textSecondary,
    fontSize: '14px'
  },
  notificationItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    padding: '16px 20px',
    borderBottom: `1px solid ${c.border}`,
    cursor: 'pointer',
    transition: 'background 0.15s'
  },
  notifIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    flexShrink: 0
  },
  notifContent: {
    flex: 1,
    minWidth: 0
  },
  notifHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '4px'
  },
  notifTitle: {
    color: c.text,
    fontSize: '14px',
    margin: 0
  },
  notifTime: {
    color: c.textSecondary,
    fontSize: '12px',
    flexShrink: 0
  },
  notifMessage: {
    color: c.textSecondary,
    fontSize: '13px',
    margin: 0,
    lineHeight: '1.4'
  },
  notifStatus: {
    flexShrink: 0,
    paddingTop: '4px'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: '16px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: `3px solid ${c.border}`,
    borderTop: '3px solid #0ea5e9',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingText: {
    color: c.textSecondary,
    fontSize: '14px'
  },
  modalContent: {
    padding: '24px',
    maxWidth: '500px',
    width: '100%'
  },
  modalTitle: {
    color: c.text,
    fontSize: '20px',
    fontWeight: '700',
    margin: '0 0 20px 0'
  },
  formGroup: {
    marginBottom: '16px'
  },
  label: {
    display: 'block',
    color: c.textSecondary,
    fontSize: '13px',
    fontWeight: '500',
    marginBottom: '6px'
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    border: `1px solid ${c.border}`,
    borderRadius: '8px',
    background: c.inputBg,
    color: c.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: `1px solid ${c.border}`
  },
  cancelBtn: {
    background: c.border,
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    color: c.text,
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  }
})

export default Notifications
