"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/app/lib/cn";
import { type ModalSize } from "@/app/lib/design-tokens";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  titleExtra?: ReactNode;
  description?: string;
  icon?: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

const sizeMap: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[95vw] h-[95vh]",
};

export default function Modal({
  isOpen, onClose, title, titleExtra, description, icon,
  size = "md", closeOnBackdrop = true, closeOnEsc = true,
  showCloseButton = true, footer, children, className
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        className={cn(
          "bg-white rounded-2xl border border-slate-200/80 shadow-2xl w-full",
          "max-h-[90vh] flex flex-col overflow-hidden",
          "animate-in fade-in zoom-in-95 duration-200",
          sizeMap[size],
          className
        )}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100 shrink-0">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {icon && (
                <div className="p-2 bg-primary-50 text-primary-600 rounded-lg shrink-0">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {title && (
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 id="modal-title" className="text-lg font-bold text-slate-800 truncate">
                      {title}
                    </h2>
                    {titleExtra}
                  </div>
                )}
                {description && (
                  <p className="text-xs text-slate-500 mt-1">{description}</p>
                )}
              </div>
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
