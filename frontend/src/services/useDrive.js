import { useState, useEffect, useRef } from 'react';
import {
  initGoogleAuth,
  authorizeAndGetRefreshToken,
  silentAuth,
  isReady,
} from './googleDrive';
import { getDriveToken, saveDriveToken } from './firestore';

/**
 * Hook to manage Google Drive authentication state.
 * Stores refresh token in Firestore (settings/app).
 */
const useDrive = () => {
  const [driveReady, setDriveReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [driveLoading, setDriveLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      try {
        const refreshToken = await getDriveToken();

        if (refreshToken) {
          await silentAuth(refreshToken);
          setDriveReady(true);
        } else {
          await initGoogleAuth();
          setNeedsSetup(true);
        }
      } catch (err) {
        console.warn('Drive init failed:', err.message);
        setNeedsSetup(true);
        try { await initGoogleAuth(); } catch {}
      } finally {
        setDriveLoading(false);
      }
    };
    init();
  }, []);

  const setupDrive = async () => {
    try {
      const refreshToken = await authorizeAndGetRefreshToken();
      await saveDriveToken(refreshToken);
      setDriveReady(true);
      setNeedsSetup(false);
      return true;
    } catch (err) {
      console.error('Drive setup failed:', err);
      throw err;
    }
  };

  return { driveReady, needsSetup, driveLoading, setupDrive, isReady };
};

export default useDrive;
