# Blink Changelog

Patch notes live here. Edit this file by hand to publish a new "What's new"
entry: add one block at the top (newest first) using this exact format. The
newest block's version IS the app version (both apps show it and open the
What's New screen automatically for everyone when it changes) — no other
file needs touching, though keeping package.json's version in sync is nice:

    ## <version> | <YYYY-MM-DD> | <Title>
    - First note
    - Second note

## 2.9.4 | 2026-11-16 | Messages stay in order, loading screens centred
- Messages are now stamped by the server instead of your device's clock, so a computer whose time is a few minutes off can no longer push one person's replies to the bottom of a conversation. Older messages whose stored time disagrees with their push ID by more than two minutes are ordered by the push ID, which is server-corrected, so existing conversations line up too.
- Conversation ordering and unread badges follow the server too: a private conversation's `updatedAt` and a channel's `lastActivity` are server-stamped, so a skewed clock cannot reshuffle the message list or leave a badge stuck.
- The loading screen (spinner and "Loading Blink…") is centred in the window instead of sitting against the left edge.

## 2.9.3 | 2026-11-16 | Faster game detection, and updates that actually arrive
- Game detection now reads the process list directly from Windows instead of starting a helper program: it takes a few milliseconds, never opens a terminal window, and no longer writes temporary files.
- Window titles are read again, which fixes games that share one executable. Half-Life 2, Portal and Team Fortress 2 all run as `hl2.exe`, so the window title now decides which one is shown (Half-Life 2 is the fallback when the title says nothing). Titles padded with invisible characters, like Call of Duty's, still match.
- The desktop app no longer registers the web app's service worker. That worker was serving the bundle a build first cached, so the desktop app could keep running old code after an update.

## 2.9.2 | 2026-11-15 | Desktop app stability and better game detection
- Fixed the desktop app freezing or crashing a few seconds after the window appeared. The process scan that powers game activity was blocking the UI thread and opening a terminal window; it now runs in the background, hidden, and can't hang.
- Game activity now names the Call of Duty you are actually playing: Modern Warfare III and Modern Warfare II report separately, and the newest title/Warzone reports as "Call of Duty" because they all share `cod.exe`.
- Added a few missing executables (Fortnite's anti-cheat build, Rainbow Six Siege's BattlEye build, WoW Classic) and Roblox is picked up under both of its player executable names.
- The signed-out screen is now centred in the desktop window instead of hugging the left edge.

## 2.9.1 | 2026-11-12 | Find people by name, and block
- Adding a friend now needs the person's exact display name instead of a fuzzy search. Type a partial name and Blink finds nobody; this makes it much harder to trawl for strangers to send requests to.
- Block is here: block from a mini profile, the Friends list, a friend request, or a name lookup. Blocking also ends the friendship and withdraws any pending request, and blocked people appear in their own list on the Friends page where you can unblock them.

## 2.9.0 | 2026-11-12 | Friends, privacy, and game activity
- Friends are here: send a request from a mini profile or the new Friends page, accept or decline it there, and the sidebar shows a count while requests wait. Removing a friend is instant, and blocking someone stops their requests and messages.
- Two new privacy settings replace the old block-private-messages switch: who can send you friend requests (everyone, friends of friends, nobody) and who can send you private messages (everyone, friends of friends, friends only, nobody). Existing profiles that had messages blocked keep them blocked.
- The desktop app now reports the game you are playing on your profile card and under your name in the sidebar: over 180 titles are recognised, including Counter-Strike 2, every recent Call of Duty and Warzone, Delta Force, Portal and Portal 2. Game activity is a setting and only the desktop build can see it.

## 2.8.6 | 2026-11-12 | Slip-throughs, caught
- Deleting the last message of a private conversation no longer leaves its text as the conversation preview in the sidebar and the conversation list. The preview falls back to the message before it, and the conversation stops counting as unread if nothing is left.
- A private message you already read on another device no longer raises a notification when it arrives here: the read marker was being looked up as a per-user object when it is a single number, so the check always passed.
- Typing in a private conversation no longer writes a read marker on every key press. It writes once per burst and once when you leave the conversation, which keeps the marker correct with far fewer database writes.

## 2.8.5 | 2026-11-12 | See who messaged you
- The Private Messages row in the sidebar now shows the profile picture of everyone with an unread private message, one face per person and newest first, so you can tell who is waiting without opening the list. With the sidebar collapsed, the newest sender's picture sits on the corner of the message icon, and hovering the row names everyone.

## 2.8.4 | 2026-11-12 | Bluer Blink dots
- The three dots of the Blink logo and the browser/app favicon now use the deeper `#2563eb` blue instead of the pale `#adc6ff`, so they match the accent colour used across the app.

## 2.8.3 | 2026-11-12 | Private messages and read markers, fixed
- Starting a private conversation with someone new works again. The per-conversation record was never created, because the database rules only let a member read a conversation, so the "does it exist yet?" check was itself denied. New conversations are now created directly, and an existing conversation is still never touched.
- You can no longer type into a community you have not joined: the channel shows "Join this community to send messages" instead of accepting a message that could not be posted properly.
- Channel read markers are written once at a time per channel. Opening a channel used to fire overlapping writes at the same read record, which the backend rejected and retried, and could leave the unread dot stuck.
- Your own messages no longer count as unread: sending advances that channel's read marker, so a message you just wrote can't leave an unread dot behind (for example on another device, or after switching tabs).
- The private message list no longer breaks when one conversation in it is stale or unreadable; that row is skipped.

## 2.8.2 | 2026-11-12 | Darker rails, deeper blue
- Swapped the chrome tones: the navigation rail and every sidebar (channels, messages, settings) now wear the app's dark background colour, while the page behind the panels is the lighter, bluer surface. The rail reads as the darkest layer instead of another grey card.
- The three chrome tones are rebuilt as one calm slate family: a near-black navigation rail, a slightly lighter page behind the panels, and a content pane one step lighter again. They share a single blue cast, so the layers are obvious without the pane jumping out or going grey.
- The current-screen indicator is now the deeper Blink blue (#2563eb), with its glow matched to it, so the active screen stands out against the lighter page.

## 2.8.1 | 2026-11-12 | Blink Blue is back
- The signature Blink blue is the brand colour again: buttons, the active community/channel row, links, mentions, unread badges and glows are vivid blue instead of pale periwinkle, and filled controls keep light text like they always did.
- Every surface carries a faint cool cast now, so the app reads blue-black rather than neutral grey — the glass panels, bubbles and cards included.
- The old pale periwinkle is still there as the second accent, so theme gradients run Blink blue into periwinkle.
- Switch knobs are theme-aware too (they were hard-coded white, which disappears on a light theme).

## 2.8.0 | 2026-11-12 | Glassy chat back, plus accessibility controls
- Messages are glassy again. Bubbles, file and poll cards, the channel canvas and the channel sidebar keep their translucency, so the themed background glow shows through instead of the flat grey the theme rewrite left behind.
- Appearance now has real accessibility controls: Reduced motion turns off animations and transitions across Blink (and follows your system setting the first time), and High contrast strengthens text, borders and surface separation. Both are remembered on this device and saved to your profile.
- Fixed the neutral colour tokens (hairlines, hover and pressed states) starting out empty until the app booted, which could make borders invisible on the first paint.

## 2.7.0 | 2026-11-12 | A theme now paints the whole app
- Themes finally cover everything. A theme is now just three colours — a primary, an accent and a background — and every other colour in the app (each surface layer, hairlines, muted text, hover and press washes, mention and selection tints, glows, glass panels, shadows, error and success states) is mixed from them. Nothing can be left behind, and a new theme needs no custom CSS at all.
- That reaches the places themes used to miss: message bubbles, code blocks, modals and menus, form fields, login and error screens, banners, drag previews, voice-call frames, the toasts and the mobile browser bar colour.
- Mono is monochrome at last. It used to keep Blink's blue brand colour, so only the background changed; its primary and accent are now greys, which desaturates buttons, the active channel row, mentions, focus rings and glows too.
- Ocean, Forest and Sunset are repainted the same way, so each one is consistent from the page background to the smallest badge.

## 2.6.0 | 2026-11-12 | Live games, reads that clear, and a mobile tidy-up
- Games, polls, reactions and edits now appear the moment they happen. They used to wait for you to leave the channel and come back, because an update that only changed a game board looked "identical" to the previous message.
- Read state is reliable again: opening a channel marks it read straight away, and incoming messages that are on screen can no longer be skipped, so the unread dot in the sidebar clears when you have actually read the channel.
- Replies to you now count as mentions: they ping you with the notification sound and add a number to the unread badge, not just a dot. A reply that arrives in the same batch as other messages is no longer dropped.
- Notification sounds are reliable now: one preloaded audio element is reused (and unblocked on your first tap) instead of a brand-new audio object per notification, which browsers often refuse to play.
- The collapsed sidebar keeps its unread markers: a dot on a community icon for ordinary activity, and a number only when you have unread @mentions or replies.
- Your profile page fits a phone properly — stacked header, smaller avatar, and names/emails that wrap instead of being cut off.
- Mini profiles open above the chat as a floating card, so clicking an avatar no longer nudges the message row out of alignment.
- The members panel is opaque on mobile, so messages no longer show through it.
- Private Messages no longer shows a members panel — there is only one other person in a direct conversation.
- Removed the "Back to Blink" link from What's New.
- Blink Native is gone: one web app, one codebase, and the Framework7 build and its dependencies have been removed.

## 2.5.1 | 2026-10-07 | Native dark theme: chats you can actually read
- Fixed the biggest visual bug in Blink Native: in dark mode every message you received was painted in the background colour, so conversations looked like loose text on a black page with only your own replies in bubbles. Framework7 builds its Material palette from a token it mismaps, and we now correct it, which also brings back the composer field, text inputs, segmented controls and toggle rails that were invisible for the same reason.
- Your own messages are now a proper chat bubble too. They were being filled with a near-white colour that made every reply the brightest thing on screen; they now use the matching mid-tone bubble with light text, the way iMessage and Google Messages do it.
- On iPhone, your messages and every filled button were white text on a pale periwinkle — about 1.8:1, which is barely readable. iOS now uses real system blue underneath that white text, so sent messages look like iMessage again while Android keeps its own accent.

## 2.5.0 | 2026-10-07 | Blink Native rebuilt on Framework7
- Blink Native is rebuilt from the ground up on Framework7: every screen, bar, button, list, sheet, popup and panel is a Framework7 component, and the app no longer carries a hand-written UI kit of its own.
- The two platform looks now come straight from Framework7's own themes — iMessage-style translucent bars and bubbles on iOS, Google Messages-style surfaces on Android.
- The channel drawer marks the channel you are in the way Discord does, with a pill row in the theme colour, and both drawers are real Framework7 panels opened from the hamburger menu.
- Sign-in, the community guidelines, the tour, message actions, attachment sheets and search are Framework7's login screen, popups and sheets.
- Voice channels open in a Framework7 popup that keeps the call running when you hide it.
- Fixed a layout bug where the app root never received a height, which stopped pages from filling the screen or scrolling properly.
- Chat reads properly again: messages group the way Framework7 groups them, the composer keeps its input row intact, and the unread badge no longer knocks the bottom-bar icon out of line.
- Both drawers now open from the same side, and every pushed screen — settings, profiles, creating or joining a community — has a working back button.

## 2.4.6 | 2026-09-09 | Native UI: iOS liquid glass rewritten from Framework7's glass tokens
- iOS now drives its entire glass language off Framework7's own glass tokens (--f7-glass-bg-color, --f7-glass-shadow, --f7-glass-shadow-thumb, --f7-bars-bg-color, --f7-bars-translucent-blur). One tinted dark-glass token now controls the translucent navbar, dialogs, action sheets, popovers, push sheets, toasts, notifications, calendar/picker modals, search input, composer textarea, and login screen, so the whole app shares one coherent dark liquid-glass material instead of a mix of near-white iOS glass and hand-rolled dark rectangles.
- The iOS navbar is now a real translucent bar with a frosted inner pill (backdrop blur + the F7 glass shadow with a warm inner rim highlight), sitting below the status bar and floating over the page. The old flat 'strip the glass' rules that were killing the bar's blur on iOS are removed.
- iOS glass surfaces use large iOS corner radii (24-28px), Blink's dark surface tint, and the app's blue accent on primary/strong buttons and selected states.
- Android deliberately stays opaque and solid (no frosted bars, no backdrop blur) so it reads as a native Android dark header, not a broken iOS port - Roboto, Material ripple on buttons, Material surface tokens, and its own message layout while still reading as Blink's blue/gray chat.
- iOS message column no longer drifts rightward on notched or landscape devices: both received and sent messages now use a fixed symmetric inset and F7's per-message margins are reset so Blink's own grouping spacing owns vertical rhythm.
- iOS message bubbles no longer render the SVG tail mask, so short messages stop leaving awkward empty space and the bubbles stay consistently rounded.
- Every message now shows its sender avatar in both iOS and Android (F7's default "hide later siblings' avatars" rule was removed).
## 2.4.2 | 2026-09-09 | Chat order matches displayed times
- Fixed messages appearing out of order (web and native) when a device's push ID and timestamp disagreed: chat and private messages now sort by their displayed timestamp, with the push ID breaking same-millisecond ties.

## 2.4.1 | 2026-09-09 | Native fixes: taps, layout & private messages
- iOS chat no longer drifts right on notched devices, and grouped messages keep breathing room between avatars.
- Toggle switches now flip on a simple tap; dragging still works.
- Role badges got proper icons for every preset (crowns, shields, stars — not scribbles).
- Creating a new private message no longer throws a permissions error.
- Community settings: back button returns to the channel you were viewing, the Channels tab is properly laid out, and the duplicate “Community Theme” header is gone.
- Minimizing a voice call from full screen drops to the bottom corner instead of the top.
- Sidebar profile row aligns with the other menu rows; members & contacts sheets animate closed.
- iOS theme now uses SF-style system fonts and Android uses Roboto.

## 2.4.0 | 2026-09-09 | Native polish: Framework7 everywhere & smarter reads
- Native chat now groups messages like iMessage — consecutive messages from the same sender pack together with one timestamp per run and the tapered bubble tail on the last message of each run (iOS and Android).
- The iOS navbar's glass "bubble" around the profile picture (and other navbar controls) is gone — the avatar is a plain, tappable picture again.
- Every menu and button in Blink Native now uses Framework7 components: sidebar rows, composer, message actions, sheets, login, settings, community management and more all get Framework7's native ripple and press feedback.
- Unread badges on the native sidebar: numbered badges for unread mentions, dots for activity, updated live — the same logic regular Blink uses, including marking a channel read the moment you interact with it.
- The MiroTalk call window actually appears on top now when you join a voice channel.
- Members panel is a proper modal with quick DM and profile buttons.
- Pinned messages refresh without reloading, and games handle challenges with accept/decline plus real win/lose/draw logic.

## 2.3.0 | 2026-09-08 | Role badges, games & announcement channels
- Role badges: names in chat now show role colors, and roles can pick a badge icon from a large built-in preset list (no uploads, nothing to moderate).
- Built-in games: play Tic-Tac-Toe, Connect Four, Checkers, and Chess right inside any chat. Tap the game button in the composer to start — everything syncs in real time and works on Blink Native too.
- Announcement channels: a one-tap preset that creates a channel locked for everyone except moderators.
- What's New now ships to the web app as well, and both apps read these notes from this file.

## 1.0.0 | 2026-09-06 | The Native Initiative
- New native mobile experience built with Framework7 with automatic iOS/Android styling.
- Simple changelog: you now see this screen whenever Blink ships a new version.
- Everything you already use — communities, channels, private messages, voice, and settings — works the same.
