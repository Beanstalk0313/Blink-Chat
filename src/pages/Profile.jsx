import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, createProfile } from '../contexts/AuthContext';
import { getUserProfile, updateUserProfile } from '../services/db';
import { compressAndConvert } from '../services/utils';
import styles from './Profile.module.css';

export default function Profile() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [zoom, setZoom] = useState(1);
  const [originalFile, setOriginalFile] = useState(null);
  const [currentYear] = useState(() => new Date().getFullYear());

  const targetUid = uid || currentUser?.uid;
  const isOwnProfile = targetUid === currentUser?.uid;

  // Load once per viewed user. Depending on `currentUser` here re-ran this on
  // every profile snapshot (new object identity), resetting editData and
  // wiping in-progress edits while the user typed.
  useEffect(() => {
    async function loadProfile() {
      if (!targetUid) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        let data = await getUserProfile(targetUid);
        if (!data && isOwnProfile && currentUser?.uid) {
          await createProfile(currentUser, currentUser.displayName, currentUser.email);
          data = await getUserProfile(targetUid);
        }
        setProfile(data);
        setEditData(data || {});
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUid]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0] || originalFile;
    if (file) {
      try {
        if (e.target.files[0]) setOriginalFile(file);
        const compressed = await compressAndConvert(file, 200, zoom);
        setEditData(previous => ({ ...previous, avatarBase64: compressed }));
      } catch (error) {
        console.error('Failed to process avatar:', error);
        alert(error.message || 'Could not process that image.');
      }
    }
  };

  const handleZoomChange = async (event) => {
    const nextZoom = parseFloat(event.target.value);
    setZoom(nextZoom);
    if (originalFile && isEditing) {
      try {
        const compressed = await compressAndConvert(originalFile, 200, nextZoom);
        setEditData(previous => ({ ...previous, avatarBase64: compressed }));
      } catch (error) {
        console.error('Failed to resize avatar:', error);
      }
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const dataToUpdate = {
        displayName: editData.displayName || profile.displayName,
        aboutMe: editData.aboutMe || '',
        avatarBase64: editData.avatarBase64 || profile.avatarBase64 || '',
        isPrivateProfile: editData.isPrivateProfile ?? profile.isPrivateProfile ?? false
      };
      await updateUserProfile(currentUser.uid, dataToUpdate);
      setProfile({ ...profile, ...dataToUpdate });
      setIsEditing(false);
      setOriginalFile(null);
      setZoom(1);
    } catch (err) {
      console.error(err);
      alert('Failed to update profile');
    }
    setLoading(false);
  };

  if (loading) return <div className={styles.loading}>Loading profile...</div>;
  if (!profile && !loading) return <div className={styles.error}>Profile not found</div>;
  if (profile.isPrivateProfile && !isOwnProfile) return <div className={styles.error}>This profile is private</div>;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.avatarWrapper}>
            {(isEditing ? editData.avatarBase64 : profile.avatarBase64) ? (
              <img src={isEditing ? editData.avatarBase64 : profile.avatarBase64} alt="Avatar" className={styles.avatar} />
            ) : (
              <div className={styles.avatarPlaceholder}>
                <span className="material-symbols-outlined">person</span>
              </div>
            )}
            {isEditing && (
              <label className={styles.avatarOverlay}>
                <span className="material-symbols-outlined">add_a_photo</span>
                <input type="file" accept="image/*" onChange={handleAvatarChange} hidden />
              </label>
            )}
          </div>
          <div className={styles.info}>
            {isEditing ? (
              <>
                <div className={styles.editGroup}>
                  <label className="text-label-sm">DISPLAY NAME</label>
                  <input 
                    type="text" 
                    value={editData.displayName} 
                    onChange={(e) => setEditData({ ...editData, displayName: e.target.value })} 
                    className={styles.nameInput}
                  />
                </div>
                {originalFile && (
                  <div className={styles.zoomControl}>
                    <label className="text-label-sm">ZOOM</label>
                    <input 
                      type="range" 
                      min="1" 
                      max="3" 
                      step="0.1" 
                      value={zoom} 
                      onChange={handleZoomChange}
                    />
                  </div>
                )}
              </>
            ) : (
              <h1 className="text-display-xl">{profile.displayName}</h1>
            )}
            {isOwnProfile && <p className="text-body-md text-tertiary">{profile.email}</p>}
          </div>
          {isOwnProfile ? (
            <button className={styles.editBtn} onClick={() => isEditing ? handleSave() : setIsEditing(true)}>
              <span className="material-symbols-outlined">{isEditing ? 'save' : 'edit'}</span>
              <span>{isEditing ? 'Save' : 'Edit Profile'}</span>
            </button>
          ) : (
            profile.blockPrivateMessages ? (
              <div className={styles.pmBlocked}>
                <span className="material-symbols-outlined">block</span>
                <span>Direct messages disabled</span>
              </div>
            ) : (
              <button className={styles.editBtn} onClick={() => navigate(`/messages?user=${targetUid}`)}>
                <span className="material-symbols-outlined">chat</span>
                <span>Message</span>
              </button>
            )
          )}
        </div>

        <div className={styles.body}>
          <div className={styles.section}>
            <h2 className="text-label-md">ABOUT ME</h2>
            {isEditing ? (
              <textarea 
                value={editData.aboutMe} 
                onChange={(e) => setEditData({ ...editData, aboutMe: e.target.value })} 
                className={styles.textarea}
                placeholder="Write something about yourself..."
              />
            ) : (
              <p className="text-body-lg">{profile.aboutMe || 'No bio yet.'}</p>
            )}
          </div>

          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span className="text-headline-md">{profile.joinedCommunities?.length || 0}</span>
              <span className="text-label-sm">COMMUNITIES</span>
            </div>
            <div className={styles.statItem}>
              <span className="text-headline-md">{profile.createdAt ? new Date(profile.createdAt).getFullYear() : currentYear}</span>
              <span className="text-label-sm">JOINED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
