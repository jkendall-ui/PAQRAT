import Button from '@atlaskit/button/new';

export function OfflineFallback() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center"
      data-testid="offline-fallback"
    >
      <span className="text-4xl" aria-hidden="true">📡</span>
      <h1 className="text-2xl font-semibold text-gray-900">You're Offline</h1>
      <p className="text-base text-gray-600 max-w-md">
        This page isn't available offline. Connect to the internet to access it,
        or go back to continue your cached study session.
      </p>
      <Button appearance="primary" onClick={() => window.history.back()}>
        Go Back
      </Button>
    </div>
  );
}
