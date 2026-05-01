import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { 
  getChannels, 
  subscribeToMessages, 
  sendMessage, 
  updateLastRead, 
  getCommunity,
  togglePinCommunity,
  getCommunityMembers,
  createChannel,
  togglePinMessage
} from '../../services/db';
import { uploadFile } from '../../services/upload';
import UserAvatar from '../common/UserAvatar';
import Modal from '../common/Modal';
import CommunityBannedScreen from '../common/CommunityBannedScreen';
import { useCall } from '../../contexts/CallContext';
import styles from './ChatArea.module.css';

// Simple error boundary to catch and report crashes
class ChatAreaErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: 'white', background: '#2a2a2a', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 className="text-display-md">Something went wrong in the Chat Area</h2>
          <pre style={{ background: '#000', padding: '1rem', borderRadius: '8px', marginTop: '1rem', maxWidth: '100%', overflow: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: '2rem', padding: '1rem 2rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ChatAreaContent = () => {
  const { communityId, channelId } = useParams();
  const { currentUser } = useAuth();
  const { activeCall, startCall, showCall, hideCall } = useCall();
  const { notify } = useNotifications();
  const navigate = useNavigate();
  
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const prevMessagesLength = useRef(0);

  // UI States
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isPinnedMessagesOpen, setIsPinnedMessagesOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [members, setMembers] = useState([]);
  const [pinnedMessages, setPinnedMessages] = useState([]);

  useEffect(() => {
    async function loadCommunityData() {
      if (!communityId) return;
      setLoading(true);
      try {
        const [comm, chans, mems] = await Promise.all([
          getCommunity(communityId).catch(() => null),
          getChannels(communityId).catch(() => []),
          getCommunityMembers(communityId).catch(() => [])
        ]);
        
        setCommunity(comm);
        setChannels(chans || []);
        setMembers(mems || []);

        if (!channelId && chans && chans.length > 0) {
          navigate(`/channels/${communityId}/${chans[0].id}`, { replace: true });
        }
      } catch (err) {
        console.error("Failed to load community:", err);
      } finally {
        setLoading(false);
      }
    }
    loadCommunityData();
  }, [communityId, channelId, navigate]);

  useEffect(() => {
    if (channelId && currentUser?.uid) {
      const unsubscribe = subscribeToMessages(channelId, (msgs) => {
        const sortedMsgs = Array.isArray(msgs) ? msgs : [];
        
        // Handle notifications
        if (sortedMsgs.length > prevMessagesLength.current) {
          const latestMsg = sortedMsgs[sortedMsgs.length - 1];
          if (latestMsg.authorUid !== currentUser.uid && !isMuted) {
            notify(`#${currentChannel?.name || 'chat'}`, latestMsg.text || 'Sent a file');
          }
        }
        prevMessagesLength.current = sortedMsgs.length;

        setMessages(sortedMsgs);
        updateLastRead(currentUser.uid, channelId).catch(() => {});
      });
      return () => unsubscribe();
    }
  }, [channelId, currentUser?.uid, isMuted]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (Array.isArray(messages)) {
      setPinnedMessages(messages.filter(m => m?.isPinned));
    }
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage?.trim() && !isUploading) return;
    if (!channelId || !currentUser?.uid) return;
    
    try {
      await sendMessage(channelId, newMessage, currentUser.uid);
      setNewMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !channelId || !currentUser?.uid) return;
    if (file.size > 100 * 1024 * 1024) return;

    setIsUploading(true);
    try {
      const uploadResult = await uploadFile(file);
      await sendMessage(channelId, `[File Uploaded: ${file.name}]`, currentUser.uid, uploadResult.url, file.name);
    } catch (err) {
      console.error(err);
    }
    setIsUploading(false);
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!newChannelName?.trim() || !communityId) return;
    try {
      await createChannel(communityId, newChannelName);
      setNewChannelName('');
      setIsCreateChannelOpen(false);
      const chans = await getChannels(communityId);
      setChannels(chans || []);
    } catch (err) {
      console.error(err);
    }
  };

  const isAdmin = community?.adminUid === currentUser?.uid || (community?.coAdmins && community.coAdmins.includes(currentUser?.uid));
  const currentChannel = (channels && Array.isArray(channels)) ? (channels.find(c => c.id === channelId) || channels[0]) : null;

  if (loading && !community) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loader}></div>
        <p className="text-display-md">Loading Blink...</p>
      </div>
    );
  }

  if (!community && !loading) {
    return <div className={styles.loadingContainer}><p>Community not found.</p></div>;
  }

  if (community?.bannedUsers && community.bannedUsers[currentUser?.uid]) {
    const expiration = community.bannedUsers[currentUser.uid];
    if (expiration === -1 || expiration > Date.now()) {
      return <CommunityBannedScreen expirationTime={expiration} />;
    }
  }

  return (
    <div className={styles.chatLayout}>
      <div className={styles.innerSidebar}>
        <div className={styles.sidebarHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="text-headline-md" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {community?.name}
            </h2>
            <p className="text-label-sm text-tertiary">
              {community?.description ? `${community.description.substring(0, 24)}...` : 'No description'}
            </p>
          </div>
          <button 
            className={`${styles.pinBtn} ${(currentUser?.profile?.pinnedCommunities || []).includes(communityId) ? styles.pinned : ''}`}
            onClick={async () => {
              try {
                await togglePinCommunity(currentUser.uid, communityId);
              } catch (err) {
                alert(err.message);
              }
            }}
            style={{ opacity: 1 }}
            title="Pin Community"
          >
            <span className="material-symbols-outlined">push_pin</span>
          </button>
          <button 
            className={styles.pinBtn}
            onClick={() => {
              const url = `http://blink.chats.cf/join/${communityId}`;
              navigator.clipboard.writeText(url);
              alert('Community link copied to clipboard!');
            }}
            style={{ opacity: 1 }}
            title="Copy Community Link"
          >
            <span className="material-symbols-outlined">share</span>
          </button>
        </div>

        <div className={styles.channelList}>
          <div className={styles.category}>
            <div className={styles.sectionHeader}>
              <span className="text-label-sm text-tertiary">TEXT CHANNELS</span>
              {isAdmin && (
                <button className={styles.addChannelBtn} onClick={() => setIsCreateChannelOpen(true)}>
                  <span className="material-symbols-outlined">add</span>
                </button>
              )}
            </div>
            {(channels || []).map(channel => (
              <Link 
                key={channel.id}
                to={`/channels/${communityId}/${channel.id}`} 
                className={`${styles.channelItem} ${channelId === channel.id ? styles.active : ''}`}
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: channelId === channel.id ? "'FILL' 1" : "'FILL' 0" }}>tag</span>
                <span className="text-label-md">{channel.name}</span>
                {channelId === channel.id && <div className={styles.activeIndicator}></div>}
              </Link>
            ))}
          </div>
        </div>

        <div className={styles.userStatus}>
          <Link to="/profile" className={styles.userInfo}>
            <div className={styles.avatarWrapper}>
              <UserAvatar user={currentUser?.profile} size="2.5rem" />
              <div className={`${styles.statusDot} ${styles.online}`}></div>
            </div>
            <div className={styles.userDetails}>
              <p className="text-label-md">{currentUser?.profile?.displayName || 'User'}</p>
              <p className="text-label-sm text-tertiary">Online</p>
            </div>
          </Link>
        </div>
      </div>

      <div className={styles.chatCanvas}>
        <header className={styles.chatHeader}>
          <div className={styles.headerTitle}>
            <span className="material-symbols-outlined text-tertiary">tag</span>
            <div>
              <h1 className="text-headline-md">{currentChannel?.name || 'loading...'}</h1>
            </div>
          </div>
          <div className={styles.headerActions}>
            {activeCall ? (
              activeCall.isHidden ? (
                <button className={styles.callPulseBtn} onClick={showCall} title="Return to Call">
                  <span className="material-symbols-outlined">call</span>
                  <span className="text-label-sm">Active Call</span>
                </button>
              ) : (
                <button className={styles.iconBtn} onClick={hideCall} title="Hide Call Window">
                  <span className="material-symbols-outlined">visibility_off</span>
                </button>
              )
            ) : (
              <button className={styles.iconBtn} onClick={() => startCall(communityId)} title="Start Call">
                <span className="material-symbols-outlined">call</span>
              </button>
            )}
            <button 
              className={`${styles.iconBtn} ${isMuted ? styles.active : ''}`} 
              onClick={() => setIsMuted(!isMuted)}
              title="Notifications"
            >
              <span className="material-symbols-outlined">{isMuted ? 'notifications_off' : 'notifications'}</span>
            </button>
            <button 
              className={`${styles.iconBtn} ${isPinnedMessagesOpen ? styles.active : ''}`}
              onClick={() => setIsPinnedMessagesOpen(!isPinnedMessagesOpen)}
              title="Pinned Messages"
            >
              <span className="material-symbols-outlined">push_pin</span>
            </button>
            <button 
              className={`${styles.iconBtn} ${isMemberListOpen ? styles.active : ''}`}
              onClick={() => setIsMemberListOpen(!isMemberListOpen)}
              title="Members"
            >
              <span className="material-symbols-outlined">group</span>
            </button>
            {isAdmin && (
              <Link to={`/community-settings/${communityId}`} className={styles.iconBtn} title="Settings">
                <span className="material-symbols-outlined">settings</span>
              </Link>
            )}
          </div>
        </header>

        <div className={styles.chatContainer}>
          <div className={styles.messagesContainer}>
            <div className={styles.messageList}>
              {(messages || []).map((msg) => {
                if (!msg) return null;
                const isMe = msg.authorUid === currentUser?.uid;
                const author = members.find(m => m.uid === msg.authorUid) || { displayName: msg.authorName || 'User', avatarBase64: msg.authorAvatar };
                const date = msg.timestamp ? new Date(msg.timestamp) : new Date();
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                return (
                  <div key={msg.id} className={`${styles.messageItem} ${isMe ? styles.sent : styles.received}`}>
                    <div className={styles.messageAvatar}>
                      <UserAvatar user={author} size="2.5rem" />
                    </div>
                    <div className={styles.messageContent}>
                      <div className={styles.messageHeader}>
                        <span className="text-label-md" style={{ color: 'var(--color-primary)' }}>
                          {isMe ? 'You' : (author.displayName)}
                        </span>
                        <span className="text-label-sm text-tertiary" style={{ opacity: 0.7 }}>
                          {timeStr}
                        </span>
                        {isAdmin && (
                          <button 
                            className={`${styles.msgPinBtn} ${msg.isPinned ? styles.active : ''}`}
                            onClick={() => togglePinMessage(channelId, msg.id, msg.isPinned)}
                            title={msg.isPinned ? "Unpin Message" : "Pin Message"}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>push_pin</span>
                          </button>
                        )}
                      </div>
                      {msg.text && <div className={styles.messageBubble}>{msg.text}</div>}
                      {msg.fileUrl && (
                        <div className={styles.fileMessage}>
                          <div className={styles.fileCard}>
                            <span className="material-symbols-outlined">description</span>
                            <div className={styles.fileInfo}>
                              <p className="text-label-md">{msg.fileName || 'file'}</p>
                              <a href={msg.fileUrl} target="_blank" rel="noreferrer" className={styles.downloadBtn}>
                                <span className="material-symbols-outlined">download</span>
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
              <form onSubmit={handleSendMessage} className={styles.inputContainer}>
                <label className={styles.inputAction}>
                  <span className="material-symbols-outlined">{isUploading ? 'sync' : 'add_circle'}</span>
                  <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isUploading} />
                </label>
                <input 
                  type="text" 
                  placeholder={isUploading ? "Uploading..." : `Message #${currentChannel?.name || 'general'}...`} 
                  className={styles.textInput} 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  disabled={isUploading}
                />
                <button type="submit" className={styles.inputAction} disabled={!newMessage?.trim() && !isUploading}>
                  <span className="material-symbols-outlined">send</span>
                </button>
              </form>
            </div>
          </div>

          {isMemberListOpen && (
            <aside className={styles.memberListSidebar}>
              <div className={styles.memberSection}>
                <p className="text-label-sm text-tertiary">MEMBERS — {members?.length || 0}</p>
                <div className={styles.memberItems}>
                  {(members || []).map(member => (
                    <div key={member.uid} className={styles.memberItem}>
                      <UserAvatar user={member} size="2rem" />
                      <span className="text-label-md">{member.displayName}</span>
                      <div className={`${styles.statusDot} ${styles.online}`} style={{ position: 'static', marginLeft: 'auto' }}></div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Modals */}
      <Modal 
        isOpen={isCreateChannelOpen} 
        onClose={() => setIsCreateChannelOpen(false)}
        title="Create Channel"
        footer={(
          <>
            <button className={styles.modalCancel} onClick={() => setIsCreateChannelOpen(false)}>Cancel</button>
            <button className={styles.modalConfirm} onClick={handleCreateChannel}>Create</button>
          </>
        )}
      >
        <div className={styles.modalInputGroup}>
          <label className="text-label-md">CHANNEL NAME</label>
          <input 
            type="text" 
            placeholder="e.g. general" 
            value={newChannelName}
            onChange={e => setNewChannelName(e.target.value)}
            className={styles.modalInput}
            autoFocus
          />
        </div>
      </Modal>

      <Modal 
        isOpen={isPinnedMessagesOpen} 
        onClose={() => setIsPinnedMessagesOpen(false)}
        title="Pinned Messages"
        footer={<button className={styles.modalConfirm} onClick={() => setIsPinnedMessagesOpen(false)}>Close</button>}
      >
        <div className={styles.pinnedList}>
          {(pinnedMessages || []).length > 0 ? pinnedMessages.map(msg => (
            <div key={msg.id} className={styles.pinnedMsgItem}>
              <div className={styles.pinnedMsgHeader}>
                <span className="text-label-md">{msg.authorName || 'User'}</span>
                <span className="text-label-sm text-tertiary">{msg.timestamp ? new Date(msg.timestamp).toLocaleDateString() : ''}</span>
              </div>
              <p className="text-body-md">{msg.text}</p>
            </div>
          )) : (
            <p className="text-body-md text-tertiary">No pinned messages yet in this channel.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

const ChatArea = () => (
  <ChatAreaErrorBoundary>
    <ChatAreaContent />
  </ChatAreaErrorBoundary>
);

export default ChatArea;
