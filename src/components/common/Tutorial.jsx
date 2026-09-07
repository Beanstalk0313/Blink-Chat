import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { updateUserProfile } from '../../services/db';
import { readStoredValue, writeStoredValue } from '../../services/utils';
import styles from './Tutorial.module.css';

const tutorialCompletedKey = uid => `blink-tutorial-completed:${uid}`;

const Tutorial = () => {
  const { currentUser } = useAuth();
  const [step, setStep] = useState(0);
  const [dismissedUid, setDismissedUid] = useState(null);
  const profile = currentUser?.profile;
  const hasLoadedTutorialStatus = Boolean(
    profile && Object.prototype.hasOwnProperty.call(profile, 'hasSeenTutorial')
  );
  const localTutorialCompleted = currentUser?.uid
    ? readStoredValue(tutorialCompletedKey(currentUser.uid)) === 'true'
    : false;

  useEffect(() => {
    if (currentUser?.uid && hasLoadedTutorialStatus && profile.hasSeenTutorial === true) {
      writeStoredValue(tutorialCompletedKey(currentUser.uid), 'true');
    }
  }, [currentUser?.uid, hasLoadedTutorialStatus, profile?.hasSeenTutorial]);

  const isVisible = Boolean(
    currentUser?.uid
      && hasLoadedTutorialStatus
      && profile.hasSeenTutorial === false
      && !localTutorialCompleted
      && dismissedUid !== currentUser.uid
  );

  const steps = [
    {
      title: "Welcome to Blink!",
      content: "The future of real-time communication. Let's show you around.",
      target: null, // Center
      icon: "waving_hand"
    },
    {
      title: "Your Command Center",
      content: "This sidebar is where you'll find your pinned communities and navigate the app.",
      target: "sidebar",
      icon: "side_navigation"
    },
    {
      title: "Discover New Spaces",
      content: "Browse and join public communities in the Discover section.",
      target: "discover",
      icon: "explore"
    },
    {
      title: "Make it Yours",
      content: "Customize your profile, avatar, and bio to express yourself.",
      target: "profile",
      icon: "person"
    },
    {
      title: "All Caught Up",
      content: "Your home dashboard shows unread messages and recommendations. You're ready to go!",
      target: "home",
      icon: "auto_awesome"
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      completeTutorial();
    }
  };

  const completeTutorial = async () => {
    const uid = currentUser.uid;
    writeStoredValue(tutorialCompletedKey(uid), 'true');
    setDismissedUid(uid);
    try {
      await updateUserProfile(uid, { hasSeenTutorial: true });
    } catch (err) {
      console.error("Failed to update tutorial status:", err);
    }
  };

  if (!isVisible) return null;

  const currentStep = steps[step];

  return (
    <div className={`${styles.overlay} ${currentStep.target ? styles.hasTarget : ''}`}>
      <div className={`${styles.popover} ${currentStep.target ? styles[currentStep.target] : styles.center}`}>
        <div className={styles.progress}>
          <div className={styles.progressBar} style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
        
        <div className={styles.content}>
          <span className={`material-symbols-outlined ${styles.icon}`}>{currentStep.icon}</span>
          <h2 className="text-headline-sm">{currentStep.title}</h2>
          <p className="text-body-md text-tertiary">{currentStep.content}</p>
        </div>

        <div className={styles.footer}>
          <button className={styles.skipBtn} onClick={completeTutorial}>Skip</button>
          <button className={styles.nextBtn} onClick={handleNext}>
            {step === steps.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
        
        {currentStep.target && <div className={styles.arrow} />}
      </div>
    </div>
  );
};

export default Tutorial;
