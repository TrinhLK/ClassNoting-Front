"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { toast as sonnerToast } from "sonner";
import { AlertTriangle, Info } from "lucide-react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "info";
}

interface GlobalUIContextType {
  toast: {
    success: (msg: string) => unknown;
    error: (msg: string) => unknown;
    info: (msg: string) => unknown;
    warning: (msg: string) => unknown;
    loading: (msg: string) => unknown;
    dismiss: (id: string) => unknown;
    promise: <T>(promise: Promise<T>, msgs: { loading: string; success: string; error: string }) => unknown;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const GlobalUIContext = createContext<GlobalUIContextType | undefined>(undefined);

export const useGlobalUI = () => {
  const context = useContext(GlobalUIContext);
  if (!context) throw new Error("useGlobalUI must be used within GlobalUIProvider");
  return context;
};

export default function GlobalUIProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const toast = {
    success: (msg: string) => sonnerToast.success(msg),
    error: (msg: string) => sonnerToast.error(msg),
    info: (msg: string) => sonnerToast.info(msg),
    warning: (msg: string) => sonnerToast.warning(msg),
    loading: (msg: string) => sonnerToast.loading(msg),
    dismiss: (id: string) => sonnerToast.dismiss(id),
    promise: <T,>(promise: Promise<T>, msgs: { loading: string; success: string; error: string }) =>
      sonnerToast.promise(promise, msgs),
  };

  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        options: { title: "Xác nhận", confirmText: "Đồng ý", cancelText: "Hủy", type: "info", ...options },
        resolve,
      });
    });
  };

  const handleConfirm = (result: boolean) => {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  };

  return (
    <GlobalUIContext.Provider value={{ toast, confirm }}>
      {children}

      <Modal
        isOpen={!!confirmState}
        onClose={() => handleConfirm(false)}
        title={confirmState?.options.title}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleConfirm(false)}>
              {confirmState?.options.cancelText}
            </Button>
            <Button
              variant={confirmState?.options.type === "danger" ? "danger" : "primary"}
              onClick={() => handleConfirm(true)}
            >
              {confirmState?.options.confirmText}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 leading-relaxed">{confirmState?.options.message}</p>
      </Modal>
    </GlobalUIContext.Provider>
  );
}
