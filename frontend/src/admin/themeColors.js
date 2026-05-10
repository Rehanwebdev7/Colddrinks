export const getColors = (dark, brand = {}) => {
  const accent = brand.accent || '#0ea5e9'
  const primary = brand.primary || '#e23744'
  const primaryDark = brand.primaryDark || '#c92e3b'
  const primaryLight = brand.primaryLight || '#fce4e6'

  return {
    bg: dark ? '#0f172a' : '#f8fafc',
    surface: dark ? '#1e293b' : '#ffffff',
    border: dark ? '#334155' : '#e2e8f0',
    text: dark ? '#f1f5f9' : '#1e293b',
    textSecondary: dark ? '#94a3b8' : '#64748b',
    inputBg: dark ? '#0f172a' : '#f1f5f9',
    topBar: dark ? '#1e293b' : '#ffffff',
    sidebar: dark ? 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    sidebarBorder: dark ? '#334155' : '#e2e8f0',
    navActive: hexToRgba(accent, dark ? 0.18 : 0.12),
    card: dark ? '#1e293b' : '#ffffff',
    hover: dark ? '#334155' : '#e2e8f0',
    danger: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
    accent,
    accentGlow: hexToRgba(accent, 0.18),
    accentSoft: hexToRgba(accent, 0.10),
    primary,
    primaryDark,
    primaryLight,
    primaryGlow: hexToRgba(primary, 0.18),
    modalBg: dark ? '#1e293b' : '#ffffff',
    tableBg: dark ? '#1e293b' : '#ffffff',
    tableHeaderBg: dark ? '#0f172a' : '#f1f5f9',
    spinnerBorder: dark ? '#334155' : '#e2e8f0',
    fontFamily: brand.font || 'Inter',
  }
}

// Robust hex/rgb to rgba converter (used for accent/primary glow tints)
function hexToRgba(color, alpha = 1) {
  if (!color) return `rgba(14,165,233,${alpha})`
  const c = String(color).trim()
  // already rgba/rgb -> just return as-is when alpha matches; otherwise rebuild
  if (c.startsWith('rgb')) {
    const nums = c.match(/[\d.]+/g)
    if (!nums || nums.length < 3) return c
    return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`
  }
  let hex = c.replace('#', '')
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('')
  if (hex.length !== 6) return `rgba(14,165,233,${alpha})`
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
