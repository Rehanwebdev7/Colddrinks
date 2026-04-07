import React, { useState, useEffect } from 'react';
import { FiArrowUp } from 'react-icons/fi';

const BackToTop = () => {
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 400);
    };

    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);

    // Check initial scroll position
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const buttonStyle = {
    position: 'fixed',
    bottom: isMobile ? '80px' : '24px',
    right: '24px',
    zIndex: 900,
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: 'none',
    background: 'var(--primary-gradient)',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
    transition: 'opacity 0.3s ease, transform 0.3s ease, box-shadow 0.2s ease',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(20px)',
    pointerEvents: visible ? 'auto' : 'none',
  };

  const hoverHandlers = {
    onMouseEnter: (e) => {
      e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.25)';
      e.currentTarget.style.transform = 'translateY(-2px)';
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.18)';
      e.currentTarget.style.transform = visible ? 'translateY(0)' : 'translateY(20px)';
    },
  };

  return (
    <button
      onClick={scrollToTop}
      style={buttonStyle}
      aria-label="Back to top"
      title="Back to top"
      {...hoverHandlers}
    >
      <FiArrowUp size={22} strokeWidth={2.5} />
    </button>
  );
};

export default BackToTop;
