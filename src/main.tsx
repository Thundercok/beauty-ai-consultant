import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "Đã xảy ra lỗi ngoài ý muốn.",
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F8] p-6">
          <div className="max-w-md w-full bg-white rounded-3xl border border-zinc-200 p-6 text-center space-y-3 shadow-xs">
            <h1 className="text-lg font-bold text-zinc-900">Không thể hiển thị giao diện</h1>
            <p className="text-xs text-zinc-600 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold cursor-pointer"
            >
              Tải lại ứng dụng
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
