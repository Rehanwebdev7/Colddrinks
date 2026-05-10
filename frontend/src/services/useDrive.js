/**
 * Silent Drive hook — backend handles uploads transparently via the
 * service-account / OAuth refresh token credentials in
 * backend/drive-credentials.json. The frontend never makes auth decisions.
 *
 * Hook signature is preserved (driveReady, needsSetup, driveLoading,
 * setupDrive, isReady) so existing imports keep working without changes.
 * Everything is a no-op that reports "ready".
 *
 * If a backend upload fails, the actual error surfaces through the
 * uploadImage() promise rejection — UI shows that real error rather
 * than a misleading "Drive not connected" message.
 */

const useDrive = () => ({
  driveReady: true,
  needsSetup: false,
  driveLoading: false,
  setupDrive: async () => true,
  isReady: () => true,
});

export default useDrive;
