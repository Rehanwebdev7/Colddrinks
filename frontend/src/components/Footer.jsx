import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaFacebook, FaInstagram, FaTwitter, FaYoutube, FaPhone, FaEnvelope, FaMapMarkerAlt } from 'react-icons/fa'
import { useSettings } from '../context/SettingsContext'
import './Footer.css'

const Footer = () => {
  const { settings } = useSettings()
  const contact = settings?.contact || {}
  const social = settings?.social || {}
  const [showBrandLogo, setShowBrandLogo] = useState(Boolean(settings?.logo))

  useEffect(() => {
    setShowBrandLogo(Boolean(settings?.logo))
  }, [settings?.logo])

  return (
    <footer className="footer">
      <div className="footer__container">
        <div className="footer__grid">

          {/* Brand + About */}
          <div className="footer__col">
            <div className="footer__brand-logo">
              {settings?.logo && showBrandLogo ? (
                <img
                  src={settings.logo}
                  alt={settings?.siteName || 'Royal'}
                  className="footer__brand-img"
                  referrerPolicy="no-referrer"
                  onError={() => setShowBrandLogo(false)}
                />
              ) : (
                <span className="footer__brand-icon">🧊</span>
              )}
              <span className="footer__brand-name">{settings?.siteName || 'Royal'}</span>
            </div>
            <p className="footer__about">{settings?.about || 'Your one-stop shop for refreshing cold drinks delivered to your doorstep.'}</p>
          </div>

          {/* Quick Links */}
          <div className="footer__col">
            <h4 className="footer__title">Quick Links</h4>
            <div className="footer__links">
              <Link to="/">Home</Link>
              <Link to="/products">Products</Link>
              <Link to="/cart">Cart</Link>
              <Link to="/orders">Orders</Link>
              <Link to="/profile">Profile</Link>
            </div>
          </div>

          {/* Contact */}
          <div className="footer__col">
            <h4 className="footer__title">Contact</h4>
            <div className="footer__contact">
              <p><FaMapMarkerAlt /> {contact.address || '123 Cool Street, Beverage City'}</p>
              <p><FaPhone /> {contact.phone || '+91 98765 43210'}</p>
              <p><FaEnvelope /> {contact.email || 'support@royal.com'}</p>
            </div>
          </div>

          {/* Social */}
          <div className="footer__col">
            <h4 className="footer__title">Follow Us</h4>
            <div className="footer__social">
              <a href={social.facebook || '#'} target="_blank" rel="noopener noreferrer"><FaFacebook /></a>
              <a href={social.instagram || '#'} target="_blank" rel="noopener noreferrer"><FaInstagram /></a>
              <a href={social.twitter || '#'} target="_blank" rel="noopener noreferrer"><FaTwitter /></a>
              <a href={social.youtube || '#'} target="_blank" rel="noopener noreferrer"><FaYoutube /></a>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Bar */}
      <div className="footer__bottom">
        <span>✨ Designed & Developed by Rehan & Parvez</span>
        <span>
          <Link to="/privacy">Privacy</Link> | <Link to="/terms">Terms</Link>
        </span>
      </div>
    </footer>
  )
}

export default Footer
