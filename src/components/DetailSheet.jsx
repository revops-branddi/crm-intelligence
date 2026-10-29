import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function DetailSheet({ title, subtitle, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="briefing-sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <header className="sheet-heading">
        <div>
          <span className="eyebrow">BRIEFING 360</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="sheet-close" onClick={onClose} aria-label="Fechar painel" autoFocus>
          <X size={20} />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
