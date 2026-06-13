import { useState, useEffect } from 'react'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import toast from 'react-hot-toast'
import { FaPalette, FaSave, FaUpload, FaQrcode, FaFacebook, FaInstagram, FaTwitter, FaYoutube } from 'react-icons/fa'
import { useSettings } from '../context/SettingsContext'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'
import ImageCropModal from '../components/ImageCropModal'
import { uploadImage, getImageUrl } from '../services/googleDrive'

const fontOptions = ['Inter', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Nunito', 'Raleway']

// Mirror of SettingsContext.shade — used for live admin preview without
// importing internal helper. Positive percent lightens, negative darkens.
const shadeHex = (hex, percent) => {
  if (!hex || typeof hex !== 'string') return hex
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return hex
  const factor = percent / 100
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
  const adjust = (c) => percent < 0 ? clamp(c * (1 + factor)) : clamp(c + (255 - c) * factor)
  const toHex = (n) => n.toString(16).padStart(2, '0')
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`
}

const ThemeConfig = () => {
  const { settings, refreshSettings } = useSettings()
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [cropModal, setCropModal] = useState({ open: false, src: null, target: null, aspect: undefined, file: null })
  const [uploadingTarget, setUploadingTarget] = useState(null) // which field is mid-upload to Cloudinary
  const [lightboxSrc, setLightboxSrc] = useState(null) // full-screen preview

  useEffect(() => {
    setForm(settings)
  }, [settings])

  const handleChange = (path, value) => {
    setForm(prev => {
      const keys = path.split('.')
      const updated = { ...prev }
      let obj = updated
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...obj[keys[i]] }
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return updated
    })
  }

  const handleFileSelect = (file, targetField, aspect) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select a valid image'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be less than 5MB'); return }
    const reader = new FileReader()
    reader.onloadend = () => setCropModal({ open: true, src: reader.result, target: targetField, aspect, file })
    reader.onerror = () => toast.error('Failed to read image')
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await API.put('/settings', form)
      refreshSettings()
      toast.success('Theme settings saved!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', border: `1px solid ${c.border}`,
    borderRadius: '8px', background: c.inputBg, color: c.text,
    fontSize: '13px', outline: 'none', boxSizing: 'border-box'
  }
  const labelStyle = { display: 'block', color: c.textSecondary, fontSize: '12px', fontWeight: '500', marginBottom: '5px' }
  const sectionStyle = {
    background: c.surface, borderRadius: '12px', padding: '16px',
    border: `1px solid ${c.border}`
  }
  const sectionTitle = { color: c.text, fontSize: '14px', fontWeight: '600', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }
  const twoCol = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px', marginBottom: '14px' }

  // Subtle checker pattern so dark AND light logos remain visible against the preview chrome.
  // Uses CSS conic-gradient — works on transparent PNGs too.
  const checkerBg = `
    linear-gradient(45deg, rgba(148,163,184,0.18) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(148,163,184,0.18) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.18) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.18) 75%),
    #f8fafc
  `

  // Asset uploader with loader + click-to-zoom.
  // shape: 'rect' = wide logo card | 'square' = compact favicon card
  const AssetUploader = ({ value, onChange, field, label, helpText, aspect, shape = 'rect' }) => {
    const isUploading = uploadingTarget === field
    const previewHeight = shape === 'square' ? '120px' : '140px'
    return (
      <div>
        <label style={labelStyle}>{label}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: `1px solid ${c.border}`, borderRadius: '10px', background: c.inputBg }}>
          {/* Big preview area */}
          <div
            onClick={() => value && !isUploading && setLightboxSrc(value)}
            title={value && !isUploading ? 'Click to enlarge' : ''}
            style={{
              position: 'relative',
              width: '100%',
              height: previewHeight,
              borderRadius: '10px',
              background: checkerBg,
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px, 0 0',
              border: `1px solid ${c.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              cursor: value && !isUploading ? 'zoom-in' : 'default',
              transition: 'border-color 0.15s',
            }}
          >
            {isUploading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#475569' }}>
                <div style={{
                  width: '36px', height: '36px',
                  border: '3px solid rgba(14,165,233,0.2)',
                  borderTopColor: '#0ea5e9',
                  borderRadius: '50%',
                  animation: 'theme-spin 0.9s linear infinite',
                }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#0e4166' }}>Uploading...</span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>4-5 seconds usually</span>
              </div>
            ) : value ? (
              <>
                <img
                  src={value}
                  alt={label}
                  referrerPolicy="no-referrer"
                  style={{
                    maxWidth: '92%',
                    maxHeight: '92%',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))',
                  }}
                />
                <span style={{
                  position: 'absolute', bottom: '6px', right: '8px',
                  fontSize: '10px', fontWeight: 600,
                  color: '#fff',
                  background: 'rgba(15,23,42,0.65)',
                  padding: '3px 8px', borderRadius: '999px',
                  pointerEvents: 'none',
                  letterSpacing: '0.3px',
                }}>
                  click to enlarge
                </span>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#64748b' }}>
                <FaUpload style={{ fontSize: '22px' }} />
                <span style={{ fontSize: '12px', fontWeight: 500 }}>No {label.toLowerCase()} yet</span>
              </div>
            )}
          </div>

          {/* Action row — Choose + Remove side-by-side */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="file"
              accept="image/*"
              id={`upload-${field}`}
              style={{ display: 'none' }}
              onChange={(e) => { handleFileSelect(e.target.files[0], field, aspect); e.target.value = '' }}
              disabled={isUploading}
            />
            <label
              htmlFor={`upload-${field}`}
              style={{
                flex: 1,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: isUploading ? c.border : '#0ea5e9',
                color: '#fff',
                borderRadius: '8px', padding: '8px 12px',
                fontSize: '12px', fontWeight: 600,
                cursor: isUploading ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: isUploading ? 0.6 : 1,
                transition: 'background 0.15s, opacity 0.15s',
              }}
            >
              <FaUpload style={{ fontSize: '11px' }} />
              {isUploading ? 'Uploading...' : value ? 'Replace' : 'Choose Image'}
            </label>
            {value && !isUploading && (
              <button
                type="button"
                onClick={() => { onChange(''); toast('Image removed — click Save All to apply'); }}
                style={{
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.35)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  color: '#ef4444',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            )}
          </div>

          {helpText && <p style={{ margin: 0, fontSize: '11px', color: c.textSecondary }}>{helpText}</p>}
        </div>

        <input
          type="text"
          value={value && !String(value).startsWith('data:') ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, marginTop: '8px', fontSize: '12px' }}
          placeholder="Or paste image URL"
          disabled={isUploading}
        />
      </div>
    )
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: c.text, margin: 0 }}>
              <FaPalette style={{ marginRight: '8px', color: '#e23744' }} /> Theme Config
            </h1>
            <p style={{ fontSize: '12px', color: c.textSecondary, margin: '4px 0 0' }}>
              Brand identity, colors, favicon, fonts — yahaan ek jagah se manage karo.
            </p>
          </div>
          <button onClick={handleSave} disabled={saving} style={{
            display: 'flex', alignItems: 'center', gap: '8px', background: '#e23744',
            border: 'none', borderRadius: '10px', padding: '9px 20px', color: '#fff',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer'
          }}>
            <FaSave /> {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>

        {/* Row 1: Identity (siteName/tagline) + Brand Assets (logo + favicon) */}
        <div style={twoCol}>
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Identity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Site Name <span style={{ color: c.textSecondary, fontWeight: 400 }}>(browser tab + footer)</span></label>
                <input type="text" value={form.siteName || ''} onChange={(e) => handleChange('siteName', e.target.value)} style={inputStyle} placeholder="e.g. AG Cold Drinks" />
              </div>
              <div>
                <label style={labelStyle}>Tagline <span style={{ color: c.textSecondary, fontWeight: 400 }}>(appears after dash in tab title)</span></label>
                <input type="text" value={form.siteTagline || ''} onChange={(e) => handleChange('siteTagline', e.target.value)} style={inputStyle} placeholder="e.g. Premium Beverages" />
              </div>
              <div style={{ padding: '8px 10px', background: c.inputBg, border: `1px dashed ${c.border}`, borderRadius: '8px', fontSize: '11px', color: c.textSecondary }}>
                Preview tab title → <strong style={{ color: c.text }}>
                  {[form.siteName, form.siteTagline].filter(Boolean).join(' - ') || 'Site Name - Tagline'}
                </strong>
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Brand Assets</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
              <AssetUploader
                value={form.logo}
                onChange={(v) => handleChange('logo', v)}
                field="logo"
                label="Logo"
                helpText="Sidebar + customer header me dikhega"
                aspect={undefined}
                shape="rect"
              />
              <AssetUploader
                value={form.favicon}
                onChange={(v) => handleChange('favicon', v)}
                field="favicon"
                label="Favicon"
                helpText="Browser tab icon + collapsed sidebar"
                aspect={1}
                shape="square"
              />
            </div>
          </div>
        </div>

        {/* Payment QR Code — 2-column: uploader left | fields right */}
        <div style={{ ...sectionStyle, marginTop: '14px' }}>
          <h3 style={sectionTitle}><FaQrcode style={{ color: '#e23744' }} />Payment QR Code</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 240px) 1fr', gap: '16px', alignItems: 'start' }}>
            {/* Left: QR uploader */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '12px', border: `1px dashed ${c.border}`, borderRadius: '10px', background: c.inputBg }}>
              <div style={{ width: '140px', height: '140px', borderRadius: '8px', background: c.surface, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {form.paymentQr ? (
                  <img src={form.paymentQr} alt="QR Code preview" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <FaQrcode style={{ fontSize: '36px', color: c.textSecondary }} />
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                id="qr-upload"
                style={{ display: 'none' }}
                onChange={(e) => { handleFileSelect(e.target.files[0], 'paymentQr', 1); e.target.value = '' }}
              />
              <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                <label htmlFor="qr-upload" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: c.border, borderRadius: '6px', padding: '6px 8px', color: c.text, fontSize: '11px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <FaUpload style={{ fontSize: '10px' }} /> Choose
                </label>
                {form.paymentQr && (
                  <button type="button" onClick={() => { handleChange('paymentQr', ''); toast('Image removed — click Save All to apply'); }} style={{ flex: 1, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '6px 8px', color: '#ef4444', fontSize: '11px', cursor: 'pointer' }}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Right: UPI fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>UPI ID</label>
                  <input
                    type="text"
                    value={form.upiId || ''}
                    onChange={(e) => handleChange('upiId', e.target.value)}
                    style={inputStyle}
                    placeholder="example@upi"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Payee Name</label>
                  <input
                    type="text"
                    value={form.upiPayeeName || ''}
                    onChange={(e) => handleChange('upiPayeeName', e.target.value)}
                    style={inputStyle}
                    placeholder="NOOR COLDINKS"
                  />
                </div>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '12px', color: c.textSecondary }}>Or QR image URL</label>
                <input
                  type="text"
                  value={form.paymentQr && !form.paymentQr.startsWith('data:') ? form.paymentQr : ''}
                  onChange={(e) => handleChange('paymentQr', e.target.value)}
                  style={inputStyle}
                  placeholder="https://example.com/qr-code.png"
                />
              </div>
              <p style={{ color: c.textSecondary, fontSize: '11px', margin: 0 }}>
                Mobile app redirect isi UPI ID se hoga, order total auto-filled rahega.
              </p>
            </div>
          </div>
        </div>

        {/* Row 3: Colors + Font — Primary + Accent only; Dark/Light auto-derived */}
        <div style={{ ...twoCol, marginTop: '14px' }}>
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Brand Colors</h3>
            <p style={{ margin: '0 0 12px', fontSize: '11px', color: c.textSecondary }}>
              Pick Primary & Accent — gradient shades auto-derive for a consistent look.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {[
                { label: 'Primary', path: 'colors.primary' },
                { label: 'Accent', path: 'colors.accent' },
              ].map(({ label, path }) => {
                const keys = path.split('.')
                const value = keys.reduce((obj, k) => obj?.[k], form) || '#000000'
                const handlePrimaryChange = (val) => {
                  handleChange(path, val)
                  if (path === 'colors.primary') {
                    // Auto-derive dark/light so saved data stays in sync
                    handleChange('colors.primaryDark', shadeHex(val, -22))
                    handleChange('colors.primaryLight', shadeHex(val, 18))
                  }
                }
                return (
                  <div key={path}>
                    <label style={labelStyle}>{label}</label>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => handlePrimaryChange(e.target.value)}
                        style={{ width: '36px', height: '32px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: 0 }}
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => handlePrimaryChange(e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Derived swatch preview row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', padding: '8px 10px', background: c.inputBg, border: `1px dashed ${c.border}`, borderRadius: '8px' }}>
              <span style={{ fontSize: '11px', color: c.textSecondary, marginRight: '2px' }}>Derived:</span>
              {(() => {
                const p = form.colors?.primary || '#E23744'
                const pd = shadeHex(p, -22)
                const pl = shadeHex(p, 18)
                return (
                  <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: c.textSecondary }}>
                      <span style={{ width: 14, height: 14, borderRadius: '4px', background: pl, border: `1px solid ${c.border}` }} />
                      Light {pl}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: c.textSecondary }}>
                      <span style={{ width: 14, height: 14, borderRadius: '4px', background: pd, border: `1px solid ${c.border}` }} />
                      Dark {pd}
                    </span>
                  </>
                )
              })()}
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Typography</h3>
            <label style={labelStyle}>Font Family</label>
            <select value={form.font || 'Inter'} onChange={(e) => handleChange('font', e.target.value)} style={inputStyle}>
              {fontOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <p style={{ margin: '8px 0 0', fontSize: '11px', color: c.textSecondary }}>
              Google Fonts se dynamically load hota hai. Save ke baad pure site pe apply.
            </p>
          </div>
        </div>

        {/* Live Preview — exactly mirrors customer-site gradient generation */}
        <div style={{ ...sectionStyle, marginTop: '14px' }}>
          <h3 style={sectionTitle}>Live Preview</h3>
          {(() => {
            const primary = form.colors?.primary || '#E23744'
            const accent = form.colors?.accent || '#0ea5e9'
            const pd = shadeHex(primary, -22)
            const pl = shadeHex(primary, 18)
            const gradient = `linear-gradient(135deg, ${pl} 0%, ${primary} 50%, ${pd} 100%)`
            const glow = `0 6px 22px ${primary}59`
            return (
              <>
                <div style={{
                  padding: '20px',
                  borderRadius: '14px',
                  background: gradient,
                  border: `1px solid ${c.border}`,
                  fontFamily: `'${form.font || 'Inter'}', sans-serif`,
                  color: '#fff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                    <div>
                      <div style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: `${accent}22`,
                        color: accent,
                        fontSize: '11px',
                        fontWeight: '600',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        marginBottom: '8px',
                      }}>
                        Preview Tag
                      </div>
                      <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: '700', color: '#fff', letterSpacing: '-0.01em' }}>
                        {form.siteName || 'Your Brand'}
                      </h2>
                      <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: '13px' }}>
                        {form.siteTagline || 'Your tagline appears here in the chosen font.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => e.preventDefault()}
                      style={{
                        background: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px 22px',
                        color: primary,
                        fontSize: '14px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        fontFamily: `'${form.font || 'Inter'}', sans-serif`,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                      }}
                    >
                      Sample Button
                    </button>
                  </div>
                </div>
                {/* Solid-gradient CTA preview — matches customer Add to Cart */}
                <div style={{ marginTop: '12px', padding: '12px', background: c.inputBg, border: `1px dashed ${c.border}`, borderRadius: '10px' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '11px', color: c.textSecondary }}>Customer button preview:</p>
                  <button
                    type="button"
                    onClick={(e) => e.preventDefault()}
                    style={{
                      width: '100%',
                      background: gradient,
                      border: 'none',
                      borderRadius: '10px',
                      padding: '12px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      boxShadow: glow,
                    }}
                  >
                    Add to Cart
                  </button>
                </div>
              </>
            )
          })()}
          <p style={{ color: c.textSecondary, fontSize: '12px', margin: '10px 0 0' }}>
            Changes here update preview immediately. Click <strong style={{ color: c.text }}>Save All</strong> to apply across the entire site.
          </p>
        </div>

        {/* Row 4: Contact + Social */}
        <div style={{ ...twoCol, marginTop: '14px' }}>
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Contact Info</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Address</label>
                <input type="text" value={form.contact?.address || ''} onChange={(e) => handleChange('contact.address', e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input type="text" value={form.contact?.phone || ''} onChange={(e) => handleChange('contact.phone', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="text" value={form.contact?.email || ''} onChange={(e) => handleChange('contact.email', e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Social Links</h3>
            <p style={{ margin: '0 0 10px', fontSize: '11px', color: c.textSecondary }}>
              Toggle off to hide a platform from the customer footer.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { key: 'facebook', Icon: FaFacebook, tone: '#1877f2' },
                { key: 'instagram', Icon: FaInstagram, tone: '#e4405f' },
                { key: 'twitter', Icon: FaTwitter, tone: '#1da1f2' },
                { key: 'youtube', Icon: FaYoutube, tone: '#ff0000' },
              ].map(({ key, Icon, tone }) => {
                const enabled = form.socialEnabled?.[key] !== false
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '8px',
                      background: enabled ? `${tone}1f` : c.inputBg,
                      border: `1px solid ${enabled ? tone : c.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: enabled ? tone : c.textSecondary, fontSize: '15px',
                      flexShrink: 0, transition: 'all 0.15s',
                    }}>
                      <Icon />
                    </div>
                    <input
                      type="text"
                      value={form.social?.[key] || ''}
                      onChange={(e) => handleChange(`social.${key}`, e.target.value)}
                      style={{ ...inputStyle, flex: 1, opacity: enabled ? 1 : 0.5 }}
                      placeholder={`https://${key}.com/your-handle`}
                      disabled={!enabled}
                    />
                    {/* Toggle switch */}
                    <button
                      type="button"
                      onClick={() => handleChange(`socialEnabled.${key}`, !enabled)}
                      title={enabled ? 'Disable' : 'Enable'}
                      style={{
                        width: '38px', height: '22px', borderRadius: '11px',
                        background: enabled ? '#22c55e' : c.border,
                        border: 'none', cursor: 'pointer',
                        position: 'relative', flexShrink: 0,
                        transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: '2px',
                        left: enabled ? '18px' : '2px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Row 5: About + Policies */}
        <div style={{ ...twoCol, marginTop: '14px' }}>
          <div style={sectionStyle}>
            <h3 style={sectionTitle}>About</h3>
            <textarea value={form.about || ''} onChange={(e) => handleChange('about', e.target.value)}
              style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }} />
          </div>

          <div style={sectionStyle}>
            <h3 style={sectionTitle}>Policies</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Privacy Policy</label>
                <textarea value={form.policies?.privacy || ''} onChange={(e) => handleChange('policies.privacy', e.target.value)}
                  style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} placeholder="Privacy policy text..." />
              </div>
              <div>
                <label style={labelStyle}>Terms of Service</label>
                <textarea value={form.policies?.terms || ''} onChange={(e) => handleChange('policies.terms', e.target.value)}
                  style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} placeholder="Terms of service text..." />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ImageCropModal
        isOpen={cropModal.open}
        imageSrc={cropModal.src}
        aspect={cropModal.aspect}
        onClose={() => setCropModal({ open: false, src: null, target: null, aspect: undefined, file: null })}
        onCropDone={async (croppedImage) => {
          const target = cropModal.target
          if (!target) return
          const oldValue = form[target]
          const folderName = target === 'logo'
            ? 'logos'
            : target === 'favicon'
            ? 'favicons'
            : 'payment-qr'
          // Show optimistic preview immediately (data URL) so user sees something
          // while Drive upload runs in background. Then swap to permanent Drive URL.
          handleChange(target, croppedImage)
          setUploadingTarget(target)
          setCropModal({ open: false, src: null, target: null, aspect: undefined, file: null })
          try {
            const blob = await fetch(croppedImage).then(r => r.blob())
            const fileName = `${target}_${Date.now()}.jpg`
            const fileId = await uploadImage(blob, folderName, fileName)
            handleChange(target, getImageUrl(fileId))
            toast.success(`${target.charAt(0).toUpperCase() + target.slice(1)} uploaded`)
          } catch (err) {
            toast.error('Drive upload failed: ' + (err.message || 'unknown'))
            handleChange(target, oldValue)
          } finally {
            setUploadingTarget(null)
          }
        }}
      />

      {/* Full-screen image lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '40px',
            cursor: 'zoom-out',
            backdropFilter: 'blur(4px)',
          }}
        >
          <img
            src={lightboxSrc}
            alt="Preview"
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.06)',
              padding: '16px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              cursor: 'default',
            }}
          />
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            style={{
              position: 'absolute', top: '24px', right: '24px',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#fff',
              borderRadius: '50%',
              width: '40px', height: '40px',
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Close preview"
          >
            ×
          </button>
        </div>
      )}

      {/* Spinner keyframe — single registration for the page */}
      <style>{`
        @keyframes theme-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </AdminLayout>
  )
}

export default ThemeConfig
