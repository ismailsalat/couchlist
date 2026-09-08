'use client';

export function ActionToast({ message, kind = 'success' }: { message: string; kind?: 'success' | 'error' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`action-toast ${kind === 'error' ? 'action-toast-error' : 'action-toast-success'}`}
    >
      <span aria-hidden="true" className="text-base">{kind === 'error' ? '!' : '✓'}</span>
      <span>{message}</span>
    </div>
  );
}
