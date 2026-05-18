import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', firebaseUser.uid);
        
        // Use onSnapshot for real-time role updates (approval)
        const unsubDoc = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setUser({ uid: firebaseUser.uid, ...docSnap.data() } as User);
          } else {
            console.warn(`useAuth: No user document found for UID ${firebaseUser.uid} at path ${userDocRef.path}. This matches your account but requires a profile document.`);
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email, status: 'pending', role: 'Staff' } as any);
          }
          setLoading(false);
        }, (error) => {
          console.error(`useAuth Snapshot Error for path ${userDocRef.path}:`, error);
          // Fallback user object to avoid being stuck on loader if permissions fail
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email, status: 'pending', role: 'Staff' } as any);
          setLoading(false);
        });

        return () => {
          unsubDoc();
        };
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return { user, loading };
}
