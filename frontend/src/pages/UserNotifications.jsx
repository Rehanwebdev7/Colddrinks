import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../config/api'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { FiPackage, FiDollarSign, FiBell, FiCheck } from 'react-icons/fi'
import { ImSpinner8 } from 'react-icons/im'
import toast from 'react-hot-toast'

const UserNotifications = () => {
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/login')
  }, [authLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (isAuthenticated) fetchNotifications()
  }, [isAuthenticated])

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const response = await API.get('/notifications')
      const data = Array.isArray(response.data) ? response.data : response.data?.data || []
      data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      setNotifications(data)
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notifId) => {
    try {
      await API.put(`/notifications/${notifId}/read`)
      setNotifications(prev =>
        prev.map(n => n.id === notifId ? { ...n, isRead: true } : n)
      )
    } catch (err) {
      toast.error('Failed to mark as read')
    }
  }

  const markAllRead = async () => {
    try {
      await API.put('/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      toast.success('All notifications marked as read')
    } catch (err) {
      toast.error('Failed to mark all as read')
    }
  }

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  const getIcon = (type) => {
    switch (type) {
      case 'order': return <FiPackage />
      case 'payment': return <FiDollarSign />
      default: return <FiBell />
    }
  }

  const getIconClass = (type) => {
    switch (type) {
      case 'order': return 'type-order'
      case 'payment': return 'type-payment'
      default: return ''
    }
  }

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications

  const unreadCount = notifications.filter(n => !n.isRead).length

  if (authLoading) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="loader-container page-min-height"><ImSpinner8 className="spinner" /></div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <Navbar />
      <div className="container section-padding notifications-page">
        <div className="notifications-header">
          <h1 className="page-title" style={{ marginBottom: 0 }}>Notifications</h1>
          {unreadCount > 0 && (
            <button className="btn btn-sm btn-outline" onClick={markAllRead}>
              <FiCheck /> Mark All as Read
            </button>
          )}
        </div>

        <div className="filter-tabs" style={{ marginBottom: '24px' }}>
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({notifications.length})
          </button>
          <button
            className={`filter-tab ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {loading ? (
          <div className="loader-container">
            <ImSpinner8 className="spinner" />
            <p>Loading notifications...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state-illustration" viewBox="0 0 140 140" fill="none">
              <circle cx="70" cy="70" r="65" fill="#FEE2E2" />
              <path d="M70 40v0c-14 0-25 11-25 25v15l-5 8h60l-5-8V65c0-14-11-25-25-25z" fill="#FECACA" stroke="#E23744" strokeWidth="2"/>
              <circle cx="70" cy="95" r="6" fill="#E23744"/>
              <path d="M60 40c0 0 4-8 10-8s10 8 10 8" stroke="#FCA5A5" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <h3 className="empty-state-title">No notifications</h3>
            <p className="empty-state-text">
              {filter === 'unread' ? 'All caught up!' : "You don't have any notifications yet."}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map(notif => (
              <div
                key={notif.id}
                className={`notification-card ${!notif.isRead ? 'unread' : ''}`}
              >
                <div className={`notification-card-icon ${getIconClass(notif.type)}`}>
                  {getIcon(notif.type)}
                </div>
                <div className="notification-card-body">
                  <p className="notification-card-title">{notif.title}</p>
                  <p className="notification-card-message">{notif.message}</p>
                  <span className="notification-card-time">{timeAgo(notif.createdAt)}</span>
                </div>
                {!notif.isRead && (
                  <div className="notification-card-actions">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => markAsRead(notif.id)}
                      title="Mark as read"
                    >
                      <FiCheck />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default UserNotifications
