import { useState, useEffect } from 'react'
import API from '../config/api'
import AdminLayout from '../components/AdminLayout'
import toast from 'react-hot-toast'
import { FaPalette, FaSave, FaUpload, FaQrcode } from 'react-icons/fa'
import { useSettings } from '../context/SettingsContext'
import { useTheme } from '../context/ThemeContext'
import { getColors } from './themeColors'
import ImageCropModal from '../components/ImageCropModal'
import { uploadImage, getImageUrl } from '../services/googleDrive'

const fontOptions = ['Inter', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Nunito', 'Raleway']

const ThemeConfig = () => {
  const { settings, refreshSettings } = useSettings()
  const { darkMode } = useTheme()
  const c = getColors(darkMode)
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [cropModal, setCropModal] = useState({ open: false, src: null, target: null, aspect: undefined, file: null })

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
    width: '100%', padding: '10px 14px', border: `1px solid ${c.border}`,
    borderRadius: '8px', background: c.inputBg, color: c.text,
    fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  }
  const labelStyle = { display: 'block', color: c.textSecondary, fontSize: '13px', fontWeight: '500', marginBottom: '6px' }
  const sectionStyle = {
    background: c.surface, borderRadius: '14px', padding: '20px',
    border: `1px solid ${c.border}`, marginBottom: '16px'
  }
  const sectionTitle = { color: c.text, fontSize: '16px', fontWeight: '600', margin: '0 0 14px 0' }

  return (
    <AdminLayout>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: c.text, margin: 0 }}>
            <FaPalette style={{ marginRight: '10px', color: '#e23744' }} /> Theme Config
          </h1>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={handleSave} disabled={saving} style={{
              display: 'flex', alignItems: 'center', gap: '8px', background: '#e23744',
              border: 'none', borderRadius: '10px', padding: '10px 24px', color: '#fff',
              fontSize: '14px', fontWeight: '600', cursor: 'pointer'
            }}>
              <FaSave /> {saving ? 'Saving...' : 'Save All'}
            </button>
          </div>
        </div>

        {/* General */}
        <div style={sectionStyle}>
          <h3 style={sectionTitle}>General</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Site Name</label>
              <input type="text" value={form.siteName || ''} onChange={(e) => handleChange('siteName', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Tagline</label>
              <input type="text" value={form.siteTagline || ''} onChange={(e) => handleChange('siteTagline', e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Logo Upload */}
          <div style={{ marginTop: '16px' }}>
            <label style={labelStyle}>Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px', border: `1px dashed ${c.border}`, borderRadius: '10px', background: c.inputBg }}>
              {form.logo ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <img src={form.logo} alt="Logo preview" referrerPolicy="no-referrer" style={{ maxHeight: '60px', maxWidth: '160px', objectFit: 'contain', borderRadius: '8px', border: `1px solid ${c.border}` }} />
                  <button type="button" onClick={() => handleChange('logo', '')} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '4px 12px', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>
                    Remove
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px 16px' }}>
                  <FaUpload style={{ fontSize: '20px', color: c.textSecondary }} />
                  <span style={{ color: c.textSecondary, fontSize: '12px' }}>Upload logo</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                id="logo-upload"
                style={{ display: 'none' }}
                onChange={(e) => { handleFileSelect(e.target.files[0], 'logo'); e.target.value = '' }}
              />
              <label htmlFor="logo-upload" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: c.border, border: `1px solid ${c.textSecondary}`, borderRadius: '8px', padding: '8px 14px', color: c.text, fontSize: '13px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <FaUpload /> Choose File
              </label>
            </div>
            <div style={{ marginTop: '8px' }}>
              <label style={{ ...labelStyle, fontSize: '12px', color: c.textSecondary }}>Or enter logo URL</label>
              <input
                type="text"
                value={form.logo && !form.logo.startsWith('data:') ? form.logo : ''}
                onChange={(e) => handleChange('logo', e.target.value)}
                style={{ ...inputStyle, marginTop: '4px' }}
                placeholder="https://example.com/logo.png"
              />
            </div>
          </div>
        </div>

        {/* Payment QR Code */}
        <div style={sectionStyle}>
          <h3 style={sectionTitle}><FaQrcode style={{ marginRight: '8px', color: '#e23744', verticalAlign: 'middle' }} />Payment QR Code</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px', border: `1px dashed ${c.border}`, borderRadius: '10px', background: c.inputBg }}>
            {form.paymentQr ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <img src={form.paymentQr} alt="QR Code preview" referrerPolicy="no-referrer" style={{ maxHeight: '160px', maxWidth: '160px', objectFit: 'contain', borderRadius: '8px', border: `1px solid ${c.border}` }} />
                <button type="button" onClick={() => handleChange('paymentQr', '')} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '4px 12px', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>
                  Remove
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px 16px' }}>
                <FaQrcode style={{ fontSize: '32px', color: c.textSecondary }} />
                <span style={{ color: c.textSecondary, fontSize: '12px' }}>Upload QR Code</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              id="qr-upload"
              style={{ display: 'none' }}
              onChange={(e) => { handleFileSelect(e.target.files[0], 'paymentQr', 1); e.target.value = '' }}
            />
            <label htmlFor="qr-upload" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: c.border, border: `1px solid ${c.textSecondary}`, borderRadius: '8px', padding: '8px 14px', color: c.text, fontSize: '13px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <FaUpload /> Choose File
            </label>
          </div>
          <div style={{ marginTop: '8px' }}>
            <label style={{ ...labelStyle, fontSize: '12px', color: c.textSecondary }}>Or enter QR code image URL</label>
            <input
              type="text"
              value={form.paymentQr && !form.paymentQr.startsWith('data:') ? form.paymentQr : ''}
              onChange={(e) => handleChange('paymentQr', e.target.value)}
              style={{ ...inputStyle, marginTop: '4px' }}
              placeholder="https://example.com/qr-code.png"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px' }}>
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
          <p style={{ color: c.textSecondary, fontSize: '12px', margin: '10px 0 0' }}>
            Mobile users ke liye app redirect isi UPI ID se hoga, aur order total ka exact amount auto-filled rahega.
          </p>
        </div>

        {/* Colors */}
        <div style={sectionStyle}>
          <h3 style={sectionTitle}>Colors</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {[
              { label: 'Primary', path: 'colors.primary' },
              { label: 'Primary Dark', path: 'colors.primaryDark' },
              { label: 'Primary Light', path: 'colors.primaryLight' },
              { label: 'Accent', path: 'colors.accent' }
            ].map(({ label, path }) => {
              const keys = path.split('.')
              const value = keys.reduce((obj, k) => obj?.[k], form) || '#000000'
              return (
                <div key={path}>
                  <label style={labelStyle}>{label}</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input type="color" value={value} onChange={(e) => handleChange(path, e.target.value)}
                      style={{ width: '40px', height: '36px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: 0 }} />
                    <input type="text" value={value} onChange={(e) => handleChange(path, e.target.value)}
                      style={{ ...inputStyle, flex: 1 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Font */}
        <div style={sectionStyle}>
          <h3 style={sectionTitle}>Font</h3>
          <select value={form.font || 'Inter'} onChange={(e) => handleChange('font', e.target.value)} style={inputStyle}>
            {fontOptions.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {/* Live Preview — reflects current form state in real time */}
        <div style={sectionStyle}>
          <h3 style={sectionTitle}>Live Preview</h3>
          <div style={{
            padding: '20px',
            borderRadius: '14px',
            background: `linear-gradient(135deg, ${form.colors?.primaryLight || '#fce4e6'} 0%, ${c.surface} 60%)`,
            border: `1px solid ${c.border}`,
            fontFamily: `'${form.font || 'Inter'}', sans-serif`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: form.colors?.accent ? `${form.colors.accent}22` : 'rgba(14,165,233,0.13)',
                  color: form.colors?.accent || '#0ea5e9',
                  fontSize: '11px',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}>
                  Preview Tag
                </div>
                <h2 style={{
                  margin: '0 0 6px 0',
                  fontSize: '22px',
                  fontWeight: '700',
                  color: c.text,
                  letterSpacing: '-0.01em',
                }}>
                  {form.siteName || 'Your Brand'}
                </h2>
                <p style={{ margin: 0, color: c.textSecondary, fontSize: '13px' }}>
                  {form.siteTagline || 'Your tagline appears here in the chosen font.'}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => e.preventDefault()}
                style={{
                  background: form.colors?.primary || '#e23744',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 22px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: `'${form.font || 'Inter'}', sans-serif`,
                  boxShadow: form.colors?.primary
                    ? `0 4px 14px ${form.colors.primary}55`
                    : '0 4px 14px rgba(226,55,68,0.35)',
                }}
              >
                Sample Button
              </button>
            </div>
            <div style={{
              display: 'flex',
              gap: '8px',
              marginTop: '16px',
              flexWrap: 'wrap',
            }}>
              {[
                { label: 'Primary', value: form.colors?.primary || '#e23744' },
                { label: 'Primary Dark', value: form.colors?.primaryDark || '#c92e3b' },
                { label: 'Primary Light', value: form.colors?.primaryLight || '#fce4e6' },
                { label: 'Accent', value: form.colors?.accent || '#0ea5e9' },
              ].map((s) => (
                <div key={s.label} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  fontSize: '12px',
                  color: c.textSecondary,
                  fontWeight: '500',
                }}>
                  <span style={{
                    width: '14px', height: '14px',
                    borderRadius: '4px',
                    background: s.value,
                    border: `1px solid ${c.border}`,
                  }} />
                  {s.label}
                </div>
              ))}
            </div>
          </div>
          <p style={{ color: c.textSecondary, fontSize: '12px', margin: '10px 0 0' }}>
            Changes here update preview immediately. Click <strong style={{ color: c.text }}>Save All</strong> to apply across the entire site.
          </p>
        </div>

        {/* Contact */}
        <div style={sectionStyle}>
          <h3 style={sectionTitle}>Contact Info</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Address</label>
              <input type="text" value={form.contact?.address || ''} onChange={(e) => handleChange('contact.address', e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
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

        {/* About */}
        <div style={sectionStyle}>
          <h3 style={sectionTitle}>About</h3>
          <textarea value={form.about || ''} onChange={(e) => handleChange('about', e.target.value)}
            style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }} />
        </div>

        {/* Policies */}
        <div style={sectionStyle}>
          <h3 style={sectionTitle}>Policies</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Privacy Policy</label>
              <textarea value={form.policies?.privacy || ''} onChange={(e) => handleChange('policies.privacy', e.target.value)}
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} placeholder="Enter privacy policy text..." />
            </div>
            <div>
              <label style={labelStyle}>Terms of Service</label>
              <textarea value={form.policies?.terms || ''} onChange={(e) => handleChange('policies.terms', e.target.value)}
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} placeholder="Enter terms of service text..." />
            </div>
          </div>
        </div>

        {/* Social Links */}
        <div style={sectionStyle}>
          <h3 style={sectionTitle}>Social Links</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {['facebook', 'instagram', 'twitter', 'youtube'].map(platform => (
              <div key={platform}>
                <label style={labelStyle}>{platform.charAt(0).toUpperCase() + platform.slice(1)}</label>
                <input type="text" value={form.social?.[platform] || ''} onChange={(e) => handleChange(`social.${platform}`, e.target.value)}
                  style={inputStyle} placeholder={`https://${platform}.com/...`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <ImageCropModal
        isOpen={cropModal.open}
        imageSrc={cropModal.src}
        aspect={cropModal.aspect}
        onClose={() => setCropModal({ open: false, src: null, target: null, aspect: undefined, file: null })}
        onCropDone={async (croppedImage) => {
          if (!cropModal.target) return
          try {
            const folderName = cropModal.target === 'logo' ? 'logos' : 'payment-qr'
            const blob = await fetch(croppedImage).then(r => r.blob())
            const fileName = `${cropModal.target}_${Date.now()}.jpg`
            const fileId = await uploadImage(blob, folderName, fileName)
            handleChange(cropModal.target, getImageUrl(fileId))
            toast.success('Image uploaded to Drive')
          } catch (err) {
            toast.error('Drive upload failed: ' + (err.message || 'unknown'))
          }
        }}
      />
    </AdminLayout>
  )
}

export default ThemeConfig
