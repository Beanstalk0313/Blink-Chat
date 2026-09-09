import { useState } from 'react';
import { f7, Navbar, Page, PageContent, Toggle } from 'framework7-react';
import { createCommunity } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { compressAndConvert } from '../../services/utils';
import MenuButton from '../components/MenuButton';
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

  const handleIconChange = async event => {
    const file = event.target.files[0] || originalFile;
    if (!file) return;
    try {
      if (event.target.files[0]) setOriginalFile(file);
      const compressed = await compressAndConvert(file, 200, zoom);
      setIcon(compressed);
      setIconPreview(compressed);
    } catch (error) {
      f7.dialog.alert(error.message || 'Could not process that image.');
    }
  };

  const handleZoomChange = async event => {
    const nextZoom = parseFloat(event.target.value);
    setZoom(nextZoom);
    if (originalFile) {
      try {
        const compressed = await compressAndConvert(originalFile, 200, nextZoom);
        setIcon(compressed);
        setIconPreview(compressed);
      } catch (error) {
        console.error('Failed to resize community icon:', error);
      }
    }
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await createCommunity(name, description, isPrivate, icon, currentUser.uid, isPrivate ? customInviteCode : null);
      window.location.hash = `#/channels/${result.id}/general/`;
    } catch (err) {
      console.error(err);
      f7.dialog.alert('Failed to create community');
    }
    setLoading(false);
  };

  return (
    <Page className={styles.page}>
      <Navbar backLink="Back" backLinkShowText={false} title="Create community">
        <MenuButton slot="left" />
      </Navbar>
      <PageContent className={styles.content}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.uploadSection}>
            <label className={styles.iconPreview}>
              {iconPreview ? <img src={iconPreview} alt="Preview" /> : <span className="material-symbols-outlined">add_a_photo</span>}
              <input type="file" accept="image/*" onChange={handleIconChange} hidden />
            </label>
            <p className={styles.hint}>UPLOAD ICON</p>
            {originalFile && (
              <div className={styles.zoomRow}>
                <span className="material-symbols-outlined">zoom_out</span>
                <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={handleZoomChange} />
                <span className="material-symbols-outlined">zoom_in</span>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label>COMMUNITY NAME</label>
            <input type="text" value={name} onChange={event => setName(event.target.value)} placeholder="What should we call your community?" required />
          </div>

          <div className={styles.field}>
            <label>DESCRIPTION</label>
            <textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Tell people what your community is about..." />
          </div>

          <div className={styles.toggleRow}>
            <div>
              <strong>PRIVATE COMMUNITY</strong>
              <small>Requires an invite code to join.</small>
            </div>
            <Toggle checked={isPrivate} onToggleChange={value => setIsPrivate(value)} />
          </div>

          {isPrivate && (
            <div className={styles.field}>
              <label>CUSTOM INVITE CODE (OPTIONAL)</label>
              <input type="text" value={customInviteCode} onChange={event => setCustomInviteCode(event.target.value.toUpperCase())} placeholder="e.g. COOL-KIDS-CLUB" />
              <p className={styles.hint}>If left blank, we&apos;ll generate one for you.</p>
            </div>
          )}

          <button type="submit" className={styles.submitBtn} disabled={loading || !name}>
            {loading ? 'Creating...' : 'Create Community'}
          </button>
        </form>
      </PageContent>
    </Page>
  );
}
