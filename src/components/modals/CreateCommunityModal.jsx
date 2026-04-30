import React, { useState } from 'react';
import { createCommunity } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import styles from './CreateCommunityModal.module.css';

export default function CreateCommunityModal({ isOpen, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const { currentUser } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await createCommunity(name, description, isPrivate, '', currentUser.uid);
      alert(`Community created! ${isPrivate ? `Invite code: ${result.inviteCode}` : ''}`);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to create community');
    }
    setLoading(false);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className="text-headline-md">Create a Community</h2>
          <button onClick={onClose} className={styles.closeBtn}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className="text-label-sm">COMMUNITY NAME</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className={styles.input} 
              required 
            />
          </div>
          <div className={styles.inputGroup}>
            <label className="text-label-sm">DESCRIPTION</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              className={styles.input} 
              rows="3" 
            />
          </div>
          <div className={styles.checkboxGroup}>
            <input 
              type="checkbox" 
              id="isPrivate" 
              checked={isPrivate} 
              onChange={(e) => setIsPrivate(e.target.checked)} 
              className={styles.checkbox}
            />
            <label htmlFor="isPrivate" className="text-body-md">Private Community (Requires invite code)</label>
          </div>
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Creating...' : 'Create Community'}
          </button>
        </form>
      </div>
    </div>
  );
}
