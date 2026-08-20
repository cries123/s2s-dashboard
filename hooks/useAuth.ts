import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User } from '../types';
import { normalizeUserProfile } from '../lib/rbac';
import { isPreviewMode } from '../lib/previewMode';
import { PREVIEW_USER } from '../lib/previewFixtures';

export function useAuth() {
  const [user, setUser] = useState<User | null>(isPreviewMode ? PREVIEW_USER : null);
  const [loading, setLoading] = useState(!isPreviewMode);
  const profileUnsubRef = useRef<(() => void) | null>(null);

  const clearProfileListener = useCallback(() => {
    profileUnsubRef.current?.();
    profileUnsubRef.current = null;
  }, []);

  useEffect(() => {
    if (isPreviewMode) return;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      clearProfileListener();

      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const userDocRef = doc(
        db,
        'artifacts',
        'hyundai-sales-to-service',
        'public',
        'data',
        'users',
        firebaseUser.uid
      );

      profileUnsubRef.current = onSnapshot(
        userDocRef,
        (docSnap) => {
          if (auth.currentUser?.uid !== firebaseUser.uid) return;

          if (docSnap.exists()) {
            setUser(normalizeUserProfile({ uid: firebaseUser.uid, ...docSnap.data() }));
          } else {
            setUser(
              normalizeUserProfile({
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                role: 'pending',
                approved: false,
                status: 'pending',
                username: firebaseUser.email || 'User',
                jobTitle: '',
              })
            );
          }
          setLoading(false);
        },
        (error) => {
          console.error('useAuth Snapshot Error:', error);
          if (auth.currentUser?.uid !== firebaseUser.uid) return;
          setUser(
            normalizeUserProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role: 'pending',
              approved: false,
              status: 'pending',
              username: firebaseUser.email || 'User',
              jobTitle: '',
            })
          );
          setLoading(false);
        }
      );
    });

    return () => {
      clearProfileListener();
      unsubscribeAuth();
    };
  }, [clearProfileListener]);

  const logout = useCallback(async () => {
    clearProfileListener();
    setUser(null);
    setLoading(false);
    await signOut(auth);
  }, [clearProfileListener]);

  return { user, loading, logout };
}
