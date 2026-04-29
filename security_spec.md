# Firebase Security Specification - Dr Plant

## Data Invariants
1. A user profile must match the authenticated user's UID.
2. A scan must belong to the user who created it (`userId` matches `request.auth.uid`).
3. Scans are immutable; once a diagnosis is recorded, it shouldn't be altered by the client.
4. Timestamps (`createdAt`) must be server-generated.

## The "Dirty Dozen" Payloads (Attacks)
1. **Identity Spoofing**: Attempt to create a user profile for a different UID.
2. **Scan Hijacking**: Attempt to read another user's scan history.
3. **Ghost Scan**: Create a scan with a fake `userId`.
4. **Confidence Injection**: Update a scan to change `confidence` to 1.0.
5. **PII Leak**: Read all user emails by querying the `/users` collection without filters.
6. **Large Payload**: Send a 10MB string in the `image` field.
7. **Invalid Severity**: Set severity to "Extreme" (not in enum).
8. **Bypassing Auth**: Attempt to read scans without being signed in.
9. **Backdated Timestamps**: Create a scan with a manual `createdAt` date from 1999.
10. **Shadow Fields**: Create a user with an `isAdmin: true` field.
11. **Relational Break**: Create a scan for a `userId` that doesn't have a profile.
12. **Collection Scraping**: Attempting to list all scans.

## The Test Runner (Logic)
- `users/{userId}`: `allow read, write: if request.auth.uid == userId`
- `scans/{scanId}`: `allow create: if request.auth.uid == request.resource.data.userId`
- `scans/{scanId}`: `allow list: if request.auth.uid == resource.data.userId`
