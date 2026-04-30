import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { updateUserProfile } from '../../services/db';
import Modal from './Modal';
import styles from './RulesModal.module.css';

export default function RulesModal() {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(currentUser?.profile && !currentUser.profile.hasAcceptedRules);

  const handleAccept = async () => {
    try {
      await updateUserProfile(currentUser.uid, { hasAcceptedRules: true });
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to accept rules:", err);
    }
  };

  if (!currentUser?.profile || currentUser.profile.hasAcceptedRules || !isOpen) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      title="Welcome to Blink Chat"
      footer={
        <button className={styles.acceptBtn} onClick={handleAccept}>
          I Agree
        </button>
      }
    >
      <div className={styles.rulesContent}>
        <p className="text-body-lg" style={{ marginBottom: '1.5rem' }}>
          Before you join the conversation, please review our community guidelines. Blink is committed to providing a safe, welcoming environment for everyone.
        </p>

        <ol className={styles.rulesList}>
          <li>
            <strong>No Sexually Explicit Content</strong>
            <p>Our users are our top priority. Sending any sexual content of any sort will result in a permanent ban from Blink.</p>
          </li>
          <li>
            <strong>No Cursing</strong>
            <p>Blink is meant to be friendly to people of all ages. Any cursing or foul language will result in a permanent ban from Blink.</p>
          </li>
          <li>
            <strong>No Illegal or Malicious Activities</strong>
            <p>This is a chat platform. Using it for illegal purposes will result in a permanent ban on all involved members, and legal action may be taken against you.</p>
          </li>
          <li>
            <strong>No Racism</strong>
            <p>Let's be honest: Judging people purely by their skin color or ethnicity is unacceptable. If you disagree, just close this tab. We don't want you here.</p>
          </li>
          <li>
            <strong>No Hate Speech</strong>
            <p>Be friendly to others. While playful banter and trash talking friends is allowed, do not speak harshly against others. This will result in a temporary suspension and eventually a permanent ban for repeated offenses.</p>
          </li>
        </ol>

        <div className={styles.noteBox}>
          <span className="material-symbols-outlined text-tertiary">info</span>
          <p className="text-label-sm text-tertiary">
            <strong>Note:</strong> Community admins can set their own rules in place as well. Make sure to follow the rules of individual communities or you may be banned from them. Community rules do not outrank Blink rules, and all channels on Blink must comply with these global rules or may be deleted by Blink administrators.
          </p>
        </div>
      </div>
    </Modal>
  );
}
