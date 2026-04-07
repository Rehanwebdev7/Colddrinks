import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'
import { getFirestore } from 'firebase/firestore'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: 'AIzaSyBGT5d8MrNU69i4e3NCzHY7v3cpzR80tME',
  authDomain: 'noor-coldrinks.firebaseapp.com',
  projectId: 'noor-coldrinks',
  storageBucket: 'noor-coldrinks.firebasestorage.app',
  messagingSenderId: '403777556555',
  appId: '1:403777556555:web:3957ec5e6723d0db337dce',
  measurementId: 'G-3LS5M85BGP'
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const storage = getStorage(app)
export const db = getFirestore(app)

// FCM Messaging - only initialize if browser supports it
export const messagingPromise = isSupported().then(supported => {
  if (supported) return getMessaging(app)
  console.warn('FCM not supported in this browser')
  return null
})

export default app
