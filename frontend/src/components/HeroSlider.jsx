import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'

const HeroSlider = ({ slides }) => {
  const navigate = useNavigate()
  const [current, setCurrent] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  const handleSlideClick = (slide) => {
    if (!slide.link) return
    if (slide.link.startsWith('http')) {
      window.open(slide.link, '_blank')
    } else {
      navigate(slide.link)
    }
  }

  const goTo = useCallback((index) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setCurrent(index)
    setTimeout(() => setIsTransitioning(false), 600)
  }, [isTransitioning])

  const next = useCallback(() => {
    goTo((current + 1) % slides.length)
  }, [current, slides.length, goTo])

  const prev = useCallback(() => {
    goTo((current - 1 + slides.length) % slides.length)
  }, [current, slides.length, goTo])

  // Touch/swipe support
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX.current
    if (Math.abs(diff) > 50) {
      if (diff > 0) next()
      else prev()
    }
  }

  // Auto-slide every 4 seconds
  useEffect(() => {
    if (slides.length <= 1) return
    const timer = setInterval(next, 4000)
    return () => clearInterval(timer)
  }, [next, slides.length])

  // Preload next slide image
  useEffect(() => {
    if (slides.length <= 1) return
    const nextIndex = (current + 1) % slides.length
    const img = new Image()
    img.src = slides[nextIndex]?.image
  }, [current, slides])

  if (!slides || slides.length === 0) return null

  return (
    <div
      className="hero-slider"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="hero-slider-track">
        {slides.map((slide, index) => (
          <div
            key={slide.id || index}
            className={`hero-slide ${index === current ? 'active' : ''}`}
            onClick={() => handleSlideClick(slide)}
            style={{ cursor: slide.link ? 'pointer' : 'default' }}
          >
            <img
              src={slide.image}
              alt={slide.title || `Slide ${index + 1}`}
              className="hero-slide-image"
              referrerPolicy="no-referrer"
            />
            {(slide.title || slide.subtitle) && (
              <div className="hero-slide-content">
                {slide.title && <h2 className="hero-slide-title">{slide.title}</h2>}
                {slide.subtitle && <p className="hero-slide-subtitle">{slide.subtitle}</p>}
              </div>
            )}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <button className="hero-slider-btn hero-slider-prev" onClick={prev}>
            <FiChevronLeft />
          </button>
          <button className="hero-slider-btn hero-slider-next" onClick={next}>
            <FiChevronRight />
          </button>
          <div className="hero-slider-dots">
            {slides.map((_, index) => (
              <button
                key={index}
                className={`hero-slider-dot ${index === current ? 'active' : ''}`}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default HeroSlider
