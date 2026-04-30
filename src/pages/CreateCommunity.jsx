import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCommunity } from '../services/db';
import { useAuth } from '../contexts/AuthContext';
import { compressAndConvert } from '../services/utils';
import styles from './CreateCommunity.module.css';

export default function CreateCommunity() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [customInviteCode, setCustomInviteCode] = useState('');
  const [icon, setIcon] = useState(null);
  const [iconPreview, setIconPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [originalFile, setOriginalFile] = useState(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const handleIconChange = async (e) => {
    const file = e.target.files[0] || originalFile;
    if (file) {
      if (e.target.files[0]) setOriginalFile(file);
      const compressed = await compressAndConvert(file, 200, zoom);
      setIcon(compressed);
      setIconPreview(compressed);
    }
  };

  React.useEffect(() => {
    if (originalFile) {
      handleIconChange({ target: { files: [] } });
    }
  }, [zoom]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await createCommunity(
        name, 
        description, 
        isPrivate, 
        icon, 
        currentUser.uid,
        isPrivate ? customInviteCode : null
      );
      navigate(`/channels/${result.id}/general`);
    } catch (err) {
      console.error(err);
      alert('Failed to create community');
    }
    setLoading(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined">arrow_back</span>
          <span>Back</span>
        </button>

        <div className={styles.content}>
          <div className={styles.header}>
            <h1 className="text-display-xl">Create your community</h1>
            <p className="text-body-lg text-tertiary">Give your new community a personality with a name and an icon. You can always change it later.</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.uploadSection}>
              <div className={styles.iconPreview}>
                {iconPreview ? (
                  <img src={iconPreview} alt="Preview" />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: '48px' }}>add_a_photo</span>
                )}
                <input type="file" accept="image/*" onChange={handleIconChange} className={styles.fileInput} />
              </div>
              <p className="text-label-sm">UPLOAD ICON</p>
              
              {originalFile && (
                <div className={styles.zoomControl}>
                  <label className="text-label-sm">ZOOM</label>
                  <input 
                    type="range" 
                    min="1" 
                    max="3" 
                    step="0.1" 
                    value={zoom} 
                    onChange={(e) => setZoom(parseFloat(e.target.value))} 
                  />
                </div>
              )}
            </div>

            <div className={styles.inputGroup}>
              <label className="text-label-md">COMMUNITY NAME</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="What should we call your community?"
                className={styles.input} 
                required 
              />
            </div>

            <div className={styles.inputGroup}>
              <label className="text-label-md">DESCRIPTION</label>
              <textarea 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                placeholder="Tell people what your community is about..."
                className={styles.input} 
                rows="3" 
              />
            </div>

            <div className={styles.toggleGroup}>
              <div className={styles.toggleInfo}>
                <span className="text-label-md">PRIVATE COMMUNITY</span>
                <p className="text-body-md text-tertiary">Requires an invite code to join.</p>
              </div>
              <label className={styles.switch}>
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                <span className={styles.slider}></span>
              </label>
            </div>

            {isPrivate && (
              <div className={styles.inputGroup} style={{ animation: 'fadeIn 0.3s' }}>
                <label className="text-label-md">CUSTOM INVITE CODE (OPTIONAL)</label>
                <input 
                  type="text" 
                  value={customInviteCode} 
                  onChange={(e) => setCustomInviteCode(e.target.value.toUpperCase())} 
                  placeholder="e.g. COOL-KIDS-CLUB"
                  className={styles.input} 
                />
                <p className="text-label-sm text-tertiary" style={{ marginTop: '0.5rem' }}>If left blank, we'll generate one for you.</p>
              </div>
            )}

            <button type="submit" disabled={loading || !name} className={styles.submitBtn}>
              {loading ? 'Creating...' : 'Create Community'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
