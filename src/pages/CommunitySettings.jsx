import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getCommunity, 
  updateCommunity, 
  getChannels, 
  createChannel, 
  updateChannel, 
  deleteChannel, 
  getCommunityMembers,
  kickUser,
  banUser
} from '../services/db';
import { compressAndConvert } from '../services/utils';
import UserAvatar from '../components/common/UserAvatar';
import Modal from '../components/common/Modal';
import styles from './CommunitySettings.module.css';

export default function CommunitySettings() {
  const { communityId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('general');
  const [community, setCommunity] = useState(null);
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconBase64, setIconBase64] = useState('');
  const [zoom, setZoom] = useState(1);
  const [originalFile, setOriginalFile] = useState(null);
  
  const [newChannelName, setNewChannelName] = useState('');
  const [editingChannel, setEditingChannel] = useState(null);
  const [editChannelName, setEditChannelName] = useState('');

  // Modal states
  const [modalType, setModalType] = useState(null); // 'kick', 'ban', 'deleteChannel'
  const [selectedTarget, setSelectedTarget] = useState(null);

  useEffect(() => {
    async function loadData() {
      const comm = await getCommunity(communityId);
      if (comm) {
        setCommunity(comm);
        setName(comm.name);
        setDescription(comm.description);
        setIconBase64(comm.iconBase64 || '');
      }
      
      const chans = await getChannels(communityId);
      setChannels(chans);
      
      const mems = await getCommunityMembers(communityId);
      setMembers(mems);
      
      setLoading(false);
    }
    loadData();
  }, [communityId]);

  const handleIconChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setOriginalFile(file);
      const base64 = await compressAndConvert(file, 1);
      setIconBase64(base64);
    }
  };

  const handleZoomChange = async (newZoom) => {
    setZoom(newZoom);
    if (originalFile) {
      const base64 = await compressAndConvert(originalFile, parseFloat(newZoom));
      setIconBase64(base64);
    }
  };

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateCommunity(communityId, { name, description, iconBase64 });
      setModalType('success');
    } catch (err) {
      console.error(err);
      setModalType('error');
    }
    setSaving(false);
  };

  const handleAddChannel = async (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    try {
      await createChannel(communityId, newChannelName);
      setNewChannelName('');
      const chans = await getChannels(communityId);
      setChannels(chans);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRenameChannel = async (id) => {
    if (!editChannelName.trim()) return;
    try {
      await updateChannel(id, { name: editChannelName });
      setChannels(channels.map(c => c.id === id ? { ...c, name: editChannelName } : c));
      setEditingChannel(null);
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDeleteChannel = async () => {
    try {
      await deleteChannel(selectedTarget);
      setChannels(channels.filter(c => c.id !== selectedTarget));
      setModalType(null);
    } catch (err) {
      console.error(err);
    }
  };

  const confirmKick = async () => {
    try {
      await kickUser(communityId, selectedTarget);
      setMembers(members.filter(m => m.uid !== selectedTarget));
      setModalType(null);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className={styles.loading}>Loading settings...</div>;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className="text-label-md">COMMUNITY SETTINGS</h2>
          <p className="text-label-sm text-tertiary">{community?.name}</p>
        </div>
        <nav className={styles.nav}>
          <button 
            className={`${styles.navItem} ${activeTab === 'general' ? styles.active : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <span className="material-symbols-outlined">settings</span>
            General
          </button>
          <button 
            className={`${styles.navItem} ${activeTab === 'channels' ? styles.active : ''}`}
            onClick={() => setActiveTab('channels')}
          >
            <span className="material-symbols-outlined">tag</span>
            Channels
          </button>
          <button 
            className={`${styles.navItem} ${activeTab === 'members' ? styles.active : ''}`}
            onClick={() => setActiveTab('members')}
          >
            <span className="material-symbols-outlined">group</span>
            Members
          </button>
          <div className={styles.divider}></div>
          <button className={styles.navItem} onClick={() => navigate(-1)}>
            <span className="material-symbols-outlined">arrow_back</span>
            Back to Chat
          </button>
        </nav>
      </aside>

      <main className={styles.content}>
        {activeTab === 'general' && (
          <div className={styles.tabContent}>
            <h1 className="text-display-xl">Community Overview</h1>
            <form onSubmit={handleSaveGeneral} className={styles.form}>
              <div className={styles.iconSection}>
                <div className={styles.iconPreview}>
                  {iconBase64 ? <img src={iconBase64} alt="Preview" /> : <div className={styles.iconPlaceholder}>?</div>}
                  <label className={styles.iconUpload}>
                    <span className="material-symbols-outlined">edit</span>
                    <input type="file" onChange={handleIconChange} style={{ display: 'none' }} />
                  </label>
                </div>
                <div className={styles.iconInfo}>
                  <p className="text-label-md">Community Icon</p>
                  <p className="text-label-sm text-tertiary">Recommended size: 512x512px</p>
                  {originalFile && (
                    <div className={styles.zoomControl}>
                      <span className="material-symbols-outlined">zoom_out</span>
                      <input 
                        type="range" 
                        min="1" 
                        max="3" 
                        step="0.1" 
                        value={zoom} 
                        onChange={(e) => handleZoomChange(e.target.value)} 
                      />
                      <span className="material-symbols-outlined">zoom_in</span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label className="text-label-md">COMMUNITY NAME</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} />
              </div>

              <div className={styles.inputGroup}>
                <label className="text-label-md">DESCRIPTION</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} />
              </div>

              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'channels' && (
          <div className={styles.tabContent}>
            <h1 className="text-display-xl">Manage Channels</h1>
            <form onSubmit={handleAddChannel} className={styles.addChannelForm}>
              <input 
                type="text" 
                placeholder="New channel name..." 
                value={newChannelName}
                onChange={e => setNewChannelName(e.target.value)}
              />
              <button type="submit">Add Channel</button>
            </form>

            <div className={styles.channelList}>
              {channels.map(chan => (
                <div key={chan.id} className={styles.channelItem}>
                  <div className={styles.channelInfo}>
                    <span className="material-symbols-outlined">tag</span>
                    {editingChannel === chan.id ? (
                      <input 
                        type="text" 
                        value={editChannelName} 
                        onChange={e => setEditChannelName(e.target.value)}
                        onBlur={() => handleRenameChannel(chan.id)}
                        onKeyDown={e => e.key === 'Enter' && handleRenameChannel(chan.id)}
                        autoFocus
                        className={styles.editChannelInput}
                      />
                    ) : (
                      <p className="text-body-md">{chan.name}</p>
                    )}
                  </div>
                  <div className={styles.channelActions}>
                    <button className={styles.actionBtn} onClick={() => {
                      setEditingChannel(chan.id);
                      setEditChannelName(chan.name);
                    }}>
                      <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>edit</span>
                    </button>
                    <button className={styles.actionBtn} onClick={() => {
                      setSelectedTarget(chan.id);
                      setModalType('deleteChannel');
                    }}>
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className={styles.tabContent}>
            <h1 className="text-display-xl">Member List</h1>
            <p className="text-body-md text-tertiary" style={{ marginBottom: '2rem' }}>{members.length} Members</p>
            
            <div className={styles.memberList}>
              {members.map(member => (
                <div key={member.uid} className={styles.memberItem}>
                  <div className={styles.memberInfo}>
                    <UserAvatar user={member} size="2.5rem" />
                    <div>
                      <p className="text-label-md">{member.displayName}</p>
                      <p className="text-label-sm text-tertiary">
                        {member.uid === community?.adminUid ? 'Owner' : 'Member'}
                      </p>
                    </div>
                  </div>
                  {member.uid !== community?.adminUid && (
                    <div className={styles.memberActions}>
                      <button 
                        className={styles.promoteBtn} 
                        onClick={() => {
                          const isCoAdmin = community.coAdmins?.includes(member.uid);
                          const newCoAdmins = isCoAdmin 
                            ? community.coAdmins.filter(id => id !== member.uid)
                            : [...(community.coAdmins || []), member.uid];
                          updateCommunity(communityId, { coAdmins: newCoAdmins });
                          setCommunity({ ...community, coAdmins: newCoAdmins });
                        }}
                      >
                        {community.coAdmins?.includes(member.uid) ? 'Demote' : 'Promote'}
                      </button>
                      <button className={styles.kickBtn} onClick={() => {
                        setSelectedTarget(member.uid);
                        setModalType('kick');
                      }}>Kick</button>
                      <button className={styles.banBtn} onClick={() => {
                        setSelectedTarget(member.uid);
                        setModalType('ban');
                      }}>Ban</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Custom Modals */}
      <Modal 
        isOpen={modalType === 'kick'} 
        onClose={() => setModalType(null)}
        title="Confirm Kick"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>
            <button className={styles.modalConfirm} onClick={confirmKick}>Kick User</button>
          </>
        )}
      >
        <p className="text-body-md">Are you sure you want to kick this member? They will be able to rejoin with an invite link.</p>
      </Modal>

      <Modal 
        isOpen={modalType === 'deleteChannel'} 
        onClose={() => setModalType(null)}
        title="Delete Channel"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setModalType(null)}>Cancel</button>
            <button className={styles.modalConfirm} style={{ backgroundColor: 'var(--color-error)' }} onClick={confirmDeleteChannel}>Delete</button>
          </>
        )}
      >
        <p className="text-body-md">This will permanently remove the channel and all its messages. This action cannot be undone.</p>
      </Modal>

      <Modal 
        isOpen={modalType === 'success'} 
        onClose={() => setModalType(null)}
        title="Success"
        footer={<button className={styles.modalConfirm} onClick={() => setModalType(null)}>Done</button>}
      >
        <p className="text-body-md">Settings updated successfully!</p>
      </Modal>
    </div>
  );
}
