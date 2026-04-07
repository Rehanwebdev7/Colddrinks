import { useState, useRef, useCallback } from 'react'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { FaTimes, FaCheck, FaCrop } from 'react-icons/fa'

function getCroppedImg(image, crop) {
  const canvas = document.createElement('canvas')
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height
  canvas.width = crop.width * scaleX
  canvas.height = crop.height * scaleY
  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    crop.width * scaleX,
    crop.height * scaleY
  )
  return canvas.toDataURL('image/jpeg', 0.9)
}

const ImageCropModal = ({ isOpen, onClose, imageSrc, onCropDone, aspect }) => {
  const [crop, setCrop] = useState({ unit: '%', width: 80, height: 80, x: 10, y: 10 })
  const [completedCrop, setCompletedCrop] = useState(null)
  const imgRef = useRef(null)

  const onImageLoad = useCallback((e) => {
    imgRef.current = e.currentTarget
    const { width, height } = e.currentTarget
    const cropSize = Math.min(width, height) * 0.8
    const x = (width - cropSize) / 2
    const y = (height - cropSize) / 2
    const newCrop = { unit: 'px', width: cropSize, height: aspect ? cropSize / aspect : cropSize, x, y }
    setCrop(newCrop)
    setCompletedCrop(newCrop)
  }, [aspect])

  const handleCrop = () => {
    if (!imgRef.current || !completedCrop) return
    const croppedDataUrl = getCroppedImg(imgRef.current, completedCrop)
    onCropDone(croppedDataUrl)
    onClose()
  }

  const handleSkip = () => {
    onCropDone(imageSrc)
    onClose()
  }

  if (!isOpen || !imageSrc) return null

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={styles.title}><FaCrop style={{ marginRight: '8px' }} />Crop Image</h3>
          <button onClick={onClose} style={styles.closeBtn}><FaTimes /></button>
        </div>
        <div style={styles.body}>
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspect}
          >
            <img
              src={imageSrc}
              alt="Crop preview"
              onLoad={onImageLoad}
              style={{ maxWidth: '100%', maxHeight: '60vh' }}
            />
          </ReactCrop>
        </div>
        <div style={styles.footer}>
          <button onClick={handleSkip} style={styles.skipBtn}>
            Skip Crop
          </button>
          <button onClick={handleCrop} style={styles.cropBtn}>
            <FaCheck style={{ marginRight: '6px' }} /> Apply Crop
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 3000, padding: '20px',
  },
  modal: {
    background: '#1e1e1e', borderRadius: '16px', width: '100%',
    maxWidth: '600px', maxHeight: '90vh', overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid #333',
  },
  title: { color: '#fff', fontSize: '16px', fontWeight: '600', margin: 0 },
  closeBtn: {
    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px', color: '#ef4444', fontSize: '14px', cursor: 'pointer',
    padding: '8px', display: 'flex', alignItems: 'center',
  },
  body: {
    padding: '16px', overflowY: 'auto', flex: 1,
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    background: '#111',
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: '10px',
    padding: '16px 20px', borderTop: '1px solid #333',
  },
  skipBtn: {
    background: 'transparent', border: '1px solid #555', borderRadius: '10px',
    padding: '10px 20px', color: '#aaa', fontSize: '14px', cursor: 'pointer',
  },
  cropBtn: {
    background: '#e23744', border: 'none', borderRadius: '10px',
    padding: '10px 24px', color: '#fff', fontSize: '14px', fontWeight: '600',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
}

export default ImageCropModal
