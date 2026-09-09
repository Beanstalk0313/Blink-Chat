import { useEffect, useState } from 'react';
import { f7, Navbar, Page, PageContent } from 'framework7-react';
import { useParams } from 'react-router-dom';
import { useAuth, createProfile } from '../../contexts/AuthContext';
import { getUserProfile, updateUserProfile } from '../../services/db';
import { compressAndConvert } from '../../services/utils';
import UserAvatar from '../../components/common/UserAvatar';
import MenuButton from '../components/MenuButton';
import styles from './Profile.module.css';

export default function Profile() {
  const params = useParams();
  const { currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [zoom, setZoom] = useState(1);
  const [originalFile, setOriginalFile] = useState(null);

  const targetUid = params.uid || currentUser?.uid;
  const isOwnProfile = targetUid === currentUser?.uid;

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      if (!targetUid) { setLoading(false); return; }
      setLoading(true);
      try {
        let data = await getUserProfile(targetUid);
        if (!data && isOwnProfile && currentUser?.uid) {
          await createProfile(currentUser, currentUser.displayName, currentUser.email);
          data = await getUserProfile(targetUid);
        }
        if (!cancelled) {
          setProfile(data);
          setEditData(data || {});
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProfile();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUid]);

  const handleAvatarChange = async event => {
    const file = event.target.files[0] || originalFile;
    if (!file) return;
    try {
      if (event.target.files[0]) setOriginalFile(file);
      const compressed = await compressAndConvert(file, 200, zoom);
      setEditData(previous => ({ ...previous, avatarBase64: compressed }));
    } catch (error) {
      f7.dialog.alert(error.message || 'Could not process that image.');
    }
  };

  const handleZoomChange = async event => {
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
        isPrivateProfile: editData.isPrivateProfile ?? profile.isPrivateProfile ?? false,
        // Preserve status so legacy profiles without the field never trip the
        // update rules' string checks on the merged document.
        status: editData.status || profile.status || 'Online'
      };
      await updateUserProfile(currentUser.uid, dataToUpdate);
      setProfile({ ...profile, ...dataToUpdate });
      setIsEditing(false);
      setOriginalFile(null);
      setZoom(1);
    } catch (err) {
      console.error(err);
      f7.dialog.alert('Failed to update profile');
    }
    setLoading(false);
  };

  if (loading) return <Page className={styles.page}><div className={styles.center}><div className={styles.loader} /><p>Loading profile...</p></div></Page>;
  if (!profile) return <Page className={styles.page}><div className={styles.center}><p>Profile not found</p></div></Page>;
  if (profile.isPrivateProfile && !isOwnProfile) return <Page className={styles.page}><div className={styles.center}><p>This profile is private</p></div></Page>;

  return (
    <Page className={styles.page}>
      <Navbar title={isOwnProfile ? 'Your profile' : (profile.displayName || 'Profile')} backLink="Back" backLinkShowText={false}>
        <MenuButton slot="left" />
      </Navbar>
      <PageContent className={styles.content}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.avatarWrap}>
              {(isEditing ? editData.avatarBase64 : profile.avatarBase64)
                ? <img src={isEditing ? editData.avatarBase64 : profile.avatarBase64} alt="Avatar" className={styles.avatar} />
                : <span className={styles.avatarPlaceholder}><UserAvatar user={profile} size="5rem" /></span>}
              {isEditing && (
                <label className={styles.avatarEdit}>
                  <span className="material-symbols-outlined">add_a_photo</span>
                  <input type="file" accept="image/*" onChange={handleAvatarChange} hidden />
                </label>
              )}
            </div>
            <div className={styles.info}>
              {isEditing ? (
                <>
                  <input className={styles.nameInput} type="text" value={editData.displayName || ''} onChange={event => setEditData({ ...editData, displayName: event.target.value })} />
                  {originalFile && (
                    <div className={styles.zoomRow}>
                      <span className="text-label-sm">ZOOM</span>
                      <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={handleZoomChange} />
                    </div>
                  )}
                </>
              ) : (
                <h1>{profile.displayName}</h1>
              )}
              {isOwnProfile && <p>{profile.email}</p>}
            </div>
          </div>

          {isOwnProfile ? (
            <button type="button" className={styles.actionBtn} onClick={() => (isEditing ? handleSave() : setIsEditing(true))}>
              <span className="material-symbols-outlined">{isEditing ? 'save' : 'edit'}</span>
              {isEditing ? 'Save' : 'Edit Profile'}
            </button>
          ) : (
            profile.blockPrivateMessages
              ? <div className={styles.pmBlocked}><span className="material-symbols-outlined">block</span><span>Direct messages disabled</span></div>
              : <button type="button" className={styles.actionBtn} onClick={() => { window.location.hash = `#/messages/?user=${targetUid}`; }}>
                  <span className="material-symbols-outlined">chat</span>Message
                </button>
          )}

          <div className={styles.section}>
            <h2>ABOUT ME</h2>
            {isEditing ? (
              <textarea rows={4} value={editData.aboutMe || ''} onChange={event => setEditData({ ...editData, aboutMe: event.target.value })} placeholder="Write something about yourself..." />
            ) : (
              <p className={styles.bio}>{profile.aboutMe || 'No bio yet.'}</p>
            )}
          </div>

          <div className={styles.stats}>
            <div><strong>{profile.joinedCommunities?.length || 0}</strong><span>COMMUNITIES</span></div>
            <div><strong>{profile.createdAt ? new Date(profile.createdAt).getFullYear() : new Date().getFullYear()}</strong><span>JOINED</span></div>
          </div>
        </div>
      </PageContent>
    </Page>
  );
}
