import React, { useEffect, useState } from 'react';

const subtitles = ['今天也在认真变强吗？', '一切安好～', '今天的第一束光，分你一点。'];

export function OpeningGreeting() {
  const [visible, setVisible] = useState(true);
  const [subtitle] = useState(() => subtitles[Math.floor(Math.random() * subtitles.length)]);
  useEffect(() => {
    const dismiss = () => setVisible(false);
    const timer = window.setTimeout(dismiss, 1050);
    window.addEventListener('pointerdown', dismiss, { capture: true, once: true });
    window.addEventListener('keydown', dismiss, { capture: true, once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', dismiss, true);
    };
  }, []);
  return visible && <div className="opening-greeting" aria-hidden>
    <strong>Alpha Pulse 一定会更大更强</strong><small>{subtitle}</small>
    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <i key={i} style={{ '--angle': i * 45 + 'deg' }} />)}
  </div>;
}
