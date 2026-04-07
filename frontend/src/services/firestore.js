import { db } from '../config/firebaseConfig'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'

// ─── Google Drive Token (stored in settings/app) ───────────────────────────

/**
 * Get the stored Google Drive refresh token from Firestore.
 */
export const getDriveToken = async () => {
  const docRef = doc(db, 'settings', 'app')
  const snap = await getDoc(docRef)
  if (!snap.exists()) return null
  return snap.data().driveRefreshToken || null
}

/**
 * Save the Google Drive refresh token to Firestore (one-time setup).
 */
export const saveDriveToken = async (refreshToken) => {
  const docRef = doc(db, 'settings', 'app')
  const snap = await getDoc(docRef)

  if (snap.exists()) {
    await updateDoc(docRef, {
      driveRefreshToken: refreshToken,
      updatedAt: serverTimestamp(),
    })
  } else {
    await setDoc(docRef, {
      driveRefreshToken: refreshToken,
      updatedAt: serverTimestamp(),
    })
  }
  return true
}
