import React, { useEffect } from 'react';
import { AlertTriangle, HelpCircle, Info, X } from 'lucide-react';

export interface CustomDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'confirm' | 'alert';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({
  isOpen,
  title,
  message,
  type,
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  const isWarning = title.toLowerCase().includes('delete') || 
                    title.toLowerCase().includes('remove') || 
                    title.toLowerCase().includes('decline') ||
                    title.toLowerCase().includes('clear');

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 999999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'rgba(7, 5, 15, 0.75)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: 'rgba(28, 25, 45, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 24px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(139, 92, 246, 0.08)',
        padding: '24px',
        position: 'relative',
        color: 'white',
      }}>
        {/* Close Button */}
        <button 
          onClick={onCancel}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
        >
          <X size={18} />
        </button>

        {/* Icon & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isWarning 
              ? 'rgba(239, 68, 68, 0.12)' 
              : type === 'confirm' 
                ? 'rgba(139, 92, 246, 0.12)' 
                : 'rgba(6, 182, 212, 0.12)',
            color: isWarning 
              ? '#ef4444' 
              : type === 'confirm' 
                ? '#a855f7' 
                : '#06b6d4'
          }}>
            {isWarning ? (
              <AlertTriangle size={22} />
            ) : type === 'confirm' ? (
              <HelpCircle size={22} />
            ) : (
              <Info size={22} />
            )}
          </div>
          <h3 style={{
            margin: 0,
            fontSize: '1.2rem',
            fontWeight: 600,
            color: 'white',
            letterSpacing: '-0.3px'
          }}>
            {title}
          </h3>
        </div>

        {/* Message */}
        <div style={{
          fontSize: '0.92rem',
          lineHeight: 1.5,
          color: 'rgba(255, 255, 255, 0.75)',
          marginBottom: '28px',
          whiteSpace: 'pre-line'
        }}>
          {message}
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
        }}>
          {type === 'confirm' && (
            <button
              onClick={onCancel}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'transparent',
                color: 'white',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 22px',
              borderRadius: '12px',
              border: 'none',
              background: isWarning 
                ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              color: 'white',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: isWarning 
                ? '0 4px 12px rgba(239, 68, 68, 0.2)' 
                : '0 4px 12px rgba(139, 92, 246, 0.2)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = isWarning 
                ? '0 6px 16px rgba(239, 68, 68, 0.3)' 
                : '0 6px 16px rgba(139, 92, 246, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = isWarning 
                ? '0 4px 12px rgba(239, 68, 68, 0.2)' 
                : '0 4px 12px rgba(139, 92, 246, 0.2)';
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
