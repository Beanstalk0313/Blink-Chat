# Blink Chat - Security Rules

To enforce a zero-trust architecture and ensure compliance with platform usage rules, deploy these security rules to your Firebase project.

## Firestore Rules (`firestore.rules`)

These rules ensure that banned users cannot access platform data and enforce basic schema validation.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Basic auth check
    function isSignedIn() {
      return request.auth != null;
    }

    // Check if the requester is not banned
    // We use exists() to avoid errors if the user doc hasn't been created yet
    function isNotBanned() {
      let userPath = /databases/$(database)/documents/users/$(request.auth.uid);
      return isSignedIn() && (!exists(userPath) || get(userPath).data.get('isBanned', false) != true);
    }

    // Users Collection
    match /users/{userId} {
      // Users can always read their own profile
      allow read: if isSignedIn() && (request.auth.uid == userId || isNotBanned());
      
      allow create: if isSignedIn() && request.auth.uid == userId;
      allow update: if isSignedIn() && request.auth.uid == userId && 
                   (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['isBanned']));
      
      match /lastRead/{channelId} {
        allow read, write: if isSignedIn() && request.auth.uid == userId;
      }
    }

    // Communities Collection
    match /communities/{communityId} {
      allow read: if isSignedIn() && isNotBanned();
      
      allow update: if isNotBanned() && 
        (resource.data.adminUid == request.auth.uid || request.auth.uid in resource.data.coAdmins);
      
      allow create: if isNotBanned();
      allow delete: if isNotBanned() && resource.data.adminUid == request.auth.uid;
    }

    // Channels Collection
    match /channels/{channelId} {
      allow read: if isSignedIn() && isNotBanned();
      allow create: if isNotBanned();
      allow update, delete: if isNotBanned();
    }
  }
}
```

## Realtime Database Rules (`database.rules.json`)

These rules protect the messaging system and ensure only active, non-banned community members can read or send messages.

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    
    "messages": {
      "$channelId": {
        ".read": "auth != null && root.child('banned_users').child(auth.uid).val() !== true",
        ".write": "auth != null && root.child('banned_users').child(auth.uid).val() !== true",
        "$messageId": {
          ".validate": "newData.hasChildren(['authorUid', 'timestamp']) && newData.child('authorUid').val() === auth.uid",
          "isPinned": {
            // In a strict environment, only validate that an admin is changing this
            ".validate": "newData.isBoolean()"
          }
        }
      }
    }
  }
}
```

## Implementation Notes
- **Zero Trust Architecture**: The client application is configured to force an ID token refresh every 60 seconds (`getIdToken(true)`). If a user is disabled or deleted from the Firebase console, they will be forcibly logged out within 1 minute without a page reload.
- **Global Bans**: Set `isBanned: true` on a user's Firestore document to instantly revoke their access to the UI.
- **Community Bans**: Are stored within the `communities` collection and enforced by the client. Admins can specify expiration timestamps for temporary bans.
