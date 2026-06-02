import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User } from '../types';
import { normalizeUserProfile } from '../lib/rbac';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'artifacts', 'hyundai-sales-to-service', 'public', 'data', 'users', firebaseUser.uid);
        
        const unsubDoc = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setUser(normalizeUserProfile({ uid: firebaseUser.uid, ...docSnap.data() }));
          } else {
            console.warn(`useAuth: No user document found for UID ${firebaseUser.uid}`);
            setUser(normalizeUserProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role: 'pending',
              approved: false,
              status: 'pending',
              username: firebaseUser.email || 'User',
              jobTitle: '',
            }));
          }
          setLoading(false);
        }, (error) => {
          console.error(`useAuth Snapshot Error:`, error);
          setUser(normalizeUserProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: 'pending',
            approved: false,
            status: 'pending',
            username: firebaseUser.email || 'User',
            jobTitle: '',
          }));
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
