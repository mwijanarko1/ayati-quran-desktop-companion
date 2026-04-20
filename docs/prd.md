# PRD: Ayati - Quran Desktop Companion

## Feature Scope Only

### Product Summary

Ayati - Quran Desktop Companion is a desktop companion that lets a user capture their current screen and receive a Quran verse, translation, and short reflection related to what they are looking at. The product is meant to create moments of remembrance during normal computer use.

---

## Core Features

### 1. On-Screen Companion

A persistent desktop companion that stays visible while the user works.

**Includes**

* Small floating companion UI
* Always-on-top mode
* Draggable position
* Collapse and expand states
* Clickable primary action button
* Quiet visual presence that does not block work

---

### 2. Screenshot Capture

The user can trigger a screenshot from the companion.

**Includes**

* One-click capture of current screen
* Support for full-screen capture
* Support for active-window capture
* Optional region capture
* Shortcut key trigger
* Capture confirmation state

---

### 3. Scene Understanding

The app analyzes the screenshot and turns it into a concise description of what the user is viewing.

**Includes**

* Screen summary generation
* Detection of broad context such as work, study, communication, shopping, coding, design, media, or planning
* Detection of emotional or spiritual themes such as stress, focus, distraction, beauty, gratitude, patience, risk, excess, or conflict
* Confidence score for inferred themes
* Fallback when the screenshot is unclear

---

### 4. Verse Matching

The app selects a Quran verse relevant to the detected screen context.

**Includes**

* Theme-to-verse matching
* Ranking of possible verses
* Final selection of one primary verse
* Optional rotation between multiple relevant verses
* Protection against random or weak matches
* "Why this verse" explanation in one sentence

---

### 5. Verse Card

The result is shown in a compact card inside the companion.

**Includes**

* Arabic verse text
* Translation
* Surah and ayah reference
* Short reflection text
* "Why this verse" line
* Simple controls for next actions

---

### 6. Tafsir Snippet

The user can expand the result to see a short tafsir-based explanation.

**Includes**

* Short tafsir excerpt
* Expand and collapse behavior
* Clear separation between verse, translation, and tafsir
* Optional "read more" state

---

### 7. Audio Playback

The user can listen to the verse that was returned.

**Includes**

* Play audio button
* Pause and replay controls
* Verse-specific recitation playback
* Mute by default until user taps play

---

### 8. Save and Bookmark

The user can save verses that resonate with them.

**Includes**

* Bookmark verse
* Save to collection
* Remove from bookmarks
* Create named collections
* Add verse to existing collection from the companion

---

### 9. Reflection Notes

The user can attach a short personal note to a verse.

**Includes**

* One-line or short text note
* Save note with bookmarked verse
* Edit note later
* View note from saved history

---

### 10. Reflection History

The app keeps a record of past reflections.

**Includes**

* Recent verse history
* Timestamp for each reflection
* Screenshot summary associated with each verse
* Search by surah, theme, or keyword
* Reopen saved verse cards

---

### 11. Daily Reflection Streak

The product encourages repeat use through a lightweight streak system.

**Includes**

* Daily streak count
* Reflection counted when user views or saves a verse
* Missed-day reset rules
* Simple streak display in companion
* Optional daily goal

---

### 12. Companion Modes

The user can choose how active the companion should be.

**Includes**

* Manual-only mode
* Gentle reminder mode
* Focus mode with fewer interruptions
* Silent mode
* Quick toggle between modes

---

## Relevance Features

### 13. Theme Engine

A controlled internal system maps screen content to spiritual themes.

**Includes**

* Theme taxonomy
* Multiple themes per screenshot
* Primary and secondary themes
* Theme weighting
* Rule-based fallback when AI output is vague

---

### 14. Relevance Feedback

The user can tell the app whether a verse felt relevant.

**Includes**

* Relevant / not relevant feedback
* Save feedback to improve future ranking
* Hide poor matches
* Learn preferred themes over time

---

### 15. Alternative Verse Option

The user can request another verse for the same screenshot.

**Includes**

* "Show another verse" action
* Secondary verse candidates
* Avoid repeating the same verse immediately
* Preserve original result in history

---

## User Experience Features

### 16. Compact and Expanded Views

The companion adapts to different levels of engagement.

**Includes**

* Minimal companion bubble
* Expanded card with verse details
* Full reflection panel for bookmarks, notes, and history
* Smooth transition between states

---

### 17. Global Shortcuts

The app should be usable without breaking workflow.

**Includes**

* Shortcut to capture screen
* Shortcut to open companion
* Shortcut to replay last verse
* Shortcut to save current verse

---

### 18. Multi-Monitor Awareness

The app works on setups with more than one display.

**Includes**

* Detect active monitor
* Capture selected monitor
* Move companion between monitors
* Keep overlay visible on chosen screen

---

### 19. Session Awareness

The companion adapts to what the user is doing over time.

**Includes**

* Recognize repeated captures from same context
* Reduce repetition in verse selection
* Detect shift in context across a session
* Offer fresh verses when theme remains the same

---

## Personalization Features

### 20. Preferences

The user can control how the companion behaves.

**Includes**

* Preferred translation
* Preferred reciter
* Show or hide tafsir by default
* Show Arabic only, translation only, or both
* Default capture mode
* Reminder frequency
* Companion size and position

---

### 21. Theme Preferences

The user can shape the style of reflections they receive.

**Includes**

* Prefer calming verses
* Prefer accountability verses
* Prefer hope-focused verses
* Prefer action-oriented reflections
* Balance between gentle and direct tone

---

## Privacy Features

### 22. Private Capture Handling

The app should treat screenshots carefully.

**Includes**

* Clear capture indicator
* User-controlled capture only by default
* No persistent screenshot storage unless user enables it
* Delete screenshot after analysis
* Local record keeps text summary, not image, by default

---

### 23. Sensitive Content Guardrails

The app should avoid awkward or intrusive output.

**Includes**

* Detect sensitive screens
* Allow user to skip analysis
* Suppress saving for private content
* Neutral fallback verse when context is too sensitive or unclear

---

## Failure and Fallback Features

### 24. Low-Confidence Fallback

The app should still return something useful when analysis is weak.

**Includes**

* General remembrance verse fallback
* Generic reflection mode
* Clear message that the screen was hard to interpret
* Option to retry capture

---

### 25. Offline Graceful Behavior

The companion should still behave predictably when services fail.

**Includes**

* Cached verse set
* Cached translations
* Cached last-used preferences
* Retry state for failed analysis
* Basic fallback reflections when live analysis is unavailable

---

## Optional Stretch Features

### 26. Scheduled Reflection Moments

The app can invite remembrance even without capture.

**Includes**

* Time-based reminder to reflect
* Open companion with a verse of the moment
* User can dismiss or save

---

### 27. Ambient Dhikr Mode

The companion can offer passive Quran reminders during work.

**Includes**

* Soft visual reminder state
* Periodic verse prompt without screenshot
* Quiet mode that does not interrupt focus

---

### 28. Share Reflection

The user can export meaningful verses and notes.

**Includes**

* Copy verse card
* Export verse plus note
* Share as image card
* Share collection entry

---

### 29. Context Collections

Saved verses can be grouped by recurring digital contexts.

**Includes**

* Collections like "Work Stress," "Coding," "Late Night Reflection," or "Distraction"
* Auto-suggest collection based on theme
* Manual collection assignment

---

## MVP Feature Set

The MVP should only include:

* On-screen companion
* One-click screenshot capture
* Scene understanding
* Theme detection
* Verse matching
* Verse card with Arabic, translation, and reference
* Short reflection
* Bookmark or save to collection
* Recent history
* Low-confidence fallback
* Preferences for translation and companion position

---

## Post-MVP Feature Set

Build after MVP:

* Tafsir expansion
* Audio playback
* Reflection notes
* Streaks
* Relevance feedback
* Alternative verse option
* Multi-monitor support
* Theme preferences
* Sensitive content guardrails
* Ambient dhikr mode

---

## Not in Scope

* Automatic background screen monitoring
* Full-screen takeover experiences
* Long-form tafsir reader
* Social feed
* Community posting
* Chatbot conversation mode
* General productivity assistant features
* OCR-heavy document analysis as a primary experience

---

## Feature Priority

### Must Have

* On-screen companion
* Screenshot capture
* Scene summary
* Theme detection
* Verse matching
* Verse card
* Save/bookmark
* History
* Preferences
* Fallback flow

### Should Have

* Tafsir snippet
* Audio playback
* Reflection notes
* Relevance feedback
* Alternative verse
* Streaks

### Nice to Have

* Ambient mode
* Scheduled reminders
* Multi-monitor optimization
* Context collections
* Share reflection

I can turn this into a tighter hackathon-style PRD next, with only "user stories" and "acceptance criteria" under each feature.
