
**SPACES**

*A Self-Cleaning, Relationally Organised Chat System*

Product Concept Document

Version 1.0  •  June 2026



# **1. The Problem**
Every chat app in use today shares the same fundamental flaw: the longer you use it, the harder it becomes to use. Your main message list — what we call the DM wall — becomes a graveyard of irrelevant conversations mixed in with the people who actually matter to you right now.

WhatsApp, Telegram, Instagram DMs, iMessage — all of them suffer from the same pattern. A message arrives from someone you haven’t spoken to in two years. It lands at the top of your list. You reply. You close the app. They’re still there tomorrow, and the day after, buried under newer conversations but never gone. Over months and years, your DM wall turns into an unmanageable scroll of hundreds of names.

The specific problems this creates:

- Finding a specific person requires scrolling past countless irrelevant conversations or remembering to search by name.
- New important messages get visually lost among dozens of old idle chats.
- There is no meaningful sense of context or relationship — your boss and your cousin appear side by side in the same flat list.
- Existing solutions like archiving or muting are manual, one-at-a-time actions that do not scale. They also do not solve the fundamental problem: the list still grows.
- Folder systems (Telegram, Instagram) help with organisation but require constant manual maintenance and do not auto-clean the main view.

|*The core insight: what people actually want is not more ways to organise clutter — they want the clutter to not exist in the first place. The main wall should always feel fresh, relevant, and under control without any manual effort.*|
| :- |

# **2. The Solution: Spaces**
Spaces is a chat system built around a single governing principle: your main wall is a temporary, active surface — not a permanent archive. Every conversation has a home in a Space. The main wall is just where active conversations temporarily surface, and it cleans itself automatically.

The system has three core components that work together:

**The Main Wall** — your primary view, always clean and current.

**Spaces** — organised homes for all your conversations.

**The Timer System** — the engine that keeps the main wall self-cleaning.

## **2.1  The Main Wall**
The Main Wall is the first screen you see when you open the app. It is designed to only ever show you what is currently relevant. It is not a permanent list of every conversation you have ever had — it is a live, always-fresh surface.

The Main Wall has two sections:

### **Pinned chats**
A small set of people or conversations that you have chosen to keep permanently visible on the Main Wall. These never leave unless you manually unpin them. Pinned chats sit at the very top, above everything else, and their order can be changed by the user at any time by drag-and-drop.

Pinned chats are for people you want instant access to at all times — your closest contacts, your most active conversations. The number of pinned chats is not strictly limited, but the design philosophy encourages keeping this list small so it retains its usefulness.

### **Temporarily surfaced chats**
Any chat that is not pinned will only appear on the Main Wall for a limited time after a message is sent or received. This time limit is called the surface timer, and it is set by the user. Once the timer expires, the chat quietly leaves the Main Wall and returns to its Space.

While a chat is surfaced, the timer countdown is visible directly on the chat row in the Main Wall — for example, “2h left” or “1d left”. This keeps the user informed and in control without being intrusive.

Surfacing happens automatically in two scenarios:

- You receive a new message from someone.
- You send a message to someone.

In both cases, the chat rises to the top of the temporarily surfaced section of the Main Wall and the timer begins. This means your Main Wall always reflects your most recent conversations — and nothing else.

|*Key principle: Nothing is ever deleted or hidden permanently. The Main Wall cleans itself by returning chats to their Spaces — every conversation is still fully accessible, just not cluttering your primary view.*|
| :- |

## **2.2  Spaces**
A Space is a named container where conversations live permanently. Think of Spaces as the organised homes for all your chats. Every chat belongs to at least one Space. When a chat is not surfaced on the Main Wall, it lives quietly in its Space, available whenever you go there.

Spaces can represent anything meaningful to the user. Common examples include:

- Work
- Family
- Friends
- Cousins
- College
- Neighbourhood
- Old colleagues

But the user defines what Spaces mean. There are no pre-set categories. You create Spaces that reflect your actual life and relationships.

### **Each Space is a mini Main Wall**
A Space is not just a passive folder. It is a fully functional view in its own right, with all the same organisational tools as the Main Wall:

- Its own pinned section at the top, with user-controlled ordering.
- Its own search bar that searches only within that Space.
- All chats sorted by most recent message by default.
- Visual indicators showing which chats are also present in other Spaces.

This means that when you open the Work Space, it behaves exactly like a focused Main Wall for your work contacts. You get the same clean, organised experience, scoped to just that group of people.

### **Pinning within Spaces**
Within any Space, you can pin specific chats to the top of that Space. These pins are Space-specific — someone pinned in your Family Space is not automatically pinned in your Cousins Space. This gives you fine-grained control over access within each context.

Pinned chats within a Space can be reordered by drag-and-drop, just like on the Main Wall. This lets you sequence them by importance, frequency of contact, or any other personal preference.

## **2.3  The Timer System**
The timer is the heart of what makes Spaces genuinely different from every other chat organisation system. It is what makes the Main Wall self-cleaning without any ongoing effort from the user.

The timer works as follows:

- When a new message is sent or received, the relevant chat surfaces to the Main Wall.
- A countdown timer begins immediately.
- When the timer reaches zero, the chat silently leaves the Main Wall and returns to its Space.
- The chat, its full history, and all its messages are completely unaffected. Nothing is deleted. The chat simply stops appearing on the Main Wall.

### **User-controlled timer duration**
The duration of the timer is set by the user. It is not a fixed system setting — it is a personal preference that the user configures in their settings. The available options are:

|**Duration**|**Best suited for**|
| :- | :- |
|1 hour|Very active users who want an extremely clean wall at all times|
|6 hours|Users who check their phone regularly throughout the day|
|1 day|The recommended default for most users|
|3 days|Users who check their phone less frequently|
|1 week|Casual users or those managing many low-frequency contacts|
|Custom|Any duration set manually by the user in hours or days|

The timer setting applies globally as a default, but in the future could be overridden per-Space or per-contact for more granular control.

### **Manual override**
At any time, the user can choose to keep a specific chat on the Main Wall permanently — without pinning it. This is done via a ‘Keep on wall’ action on the chat. The chat then behaves like a pinned chat for as long as the user chooses, until they remove it manually.

|*The timer is not a timeout or a penalty. It is a courtesy. It says: this conversation was active, you saw it, now it’s safe to step back without losing it.*|
| :- |

# **3. The Single-Entity Model**
One of the most important design decisions in Spaces is how it handles the relationship between a chat and the Spaces it appears in. The rule is simple and absolute:

|*Every conversation is a single entity. It can appear in multiple Spaces, but it always remains one conversation, with one history, one thread. There are no copies and no duplicates.*|
| :- |

This is best understood through a real example.

## **3.1  The Sibling Example**
You have a sibling. You have two Spaces: Family and Cousins. Your sibling is naturally in your Family Space. But you spend a lot of time in the Cousins Space — planning trips, sharing memories, staying connected with that side of the family. You find it inconvenient to switch to the Family Space every time you want to message your sibling while you are browsing Cousins.

So you add your sibling to the Cousins Space as well. From that point on:

- Your sibling’s chat appears in both Family and Cousins.
- When you tap their name in Cousins, you open the same conversation as when you tap their name in Family.
- Any message sent from either Space goes to the same thread.
- There is no confusion, no split history, no duplication.

This is convenience of access, not duplication of data. The entity — your sibling and your conversation with them — is one thing. The Spaces are just different windows onto the same thing.

## **3.2  The Multi-Space Warning**
Whenever a chat appears in more than one Space, the app displays a soft, non-alarming indicator to keep the user aware. This prevents confusion without creating friction.

The indicator appears in two places:

- On the chat row itself: a small badge reading “2 spaces” or “also in Family” appears next to the contact name.
- At the top of the Space view: a quiet banner reading “Sibling also exists in Family — same chat” appears when you first view that Space.

The warning is informational, not disruptive. It does not require any action from the user. It simply ensures that the user always understands what they are looking at.

When a user tries to add a chat to a Space it is already in, the system asks: “This chat already exists in Family — do you still want to add it to Cousins?” The user can confirm or cancel. If they confirm, the chat shortcut is added. If they cancel, nothing changes.

## **3.3  Timer Behaviour for Multi-Space Chats**
When a chat exists in multiple Spaces and a new message arrives, the chat surfaces to the Main Wall. When the timer expires, the chat leaves the Main Wall and returns to all of its Spaces simultaneously.

There is no concept of a ‘primary’ Space that the chat ‘belongs to’ more than another. The chat is equally present in all its Spaces. The Main Wall is simply a temporary elevated view, and when the timer ends, the chat settles back into all the places it lives — not just one.

# **4. The Unassigned Space**
Not every chat arrives with a known home. Sometimes a stranger messages you. Sometimes a new acquaintance reaches out before you have decided where they belong in your life. These conversations need somewhere to go when the timer expires, even though they have not yet been assigned to a Space.

For this purpose, the system maintains a special holding area called Unassigned.

## **4.1  How Unassigned works**
When a chat has not been assigned to any Space and its surface timer expires on the Main Wall, it moves to the Unassigned area rather than disappearing. This ensures nothing is ever lost. The Unassigned area is always accessible from the Space navigation strip alongside your named Spaces.

The Unassigned area has its own search bar and functions like any other Space. The key difference is that it represents chats that are waiting to be placed rather than chats that have a permanent home.

## **4.2  Assigning a chat**
From the Unassigned area (or from any chat row), the user can assign a chat to a Space at any time. A folder-plus icon on each chat row in Unassigned provides a quick one-tap action to open the Space selection menu. The user selects one or more Spaces, and the chat is moved there. It will no longer appear in Unassigned.

There is no time pressure to assign a chat. A conversation can live in Unassigned indefinitely. It will surface to the Main Wall whenever a new message arrives, just like any other chat, and it will return to Unassigned when the timer expires.

|*Unassigned is not a dumping ground. It is a thoughtful holding space for relationships you haven’t categorised yet. Nothing in Unassigned is forgotten or deprioritised — it is simply waiting for context.*|
| :- |

# **5. Navigation and User Interface**
## **5.1  The Space Strip**
At the top of the main chat view, a horizontal scrollable strip shows all your Spaces as pills (compact, tap-friendly labels). The active Space is highlighted. Tapping a pill switches to that Space’s view instantly.

The strip always begins with ‘Main wall’ as the first item, followed by user-created Spaces in their defined order, and Unassigned at the end. The order of Spaces in the strip can be customised by the user.

## **5.2  Search**
There are two levels of search in the system:

**Space-level search:** Each Space has its own search bar that searches only within that Space. When you are in the Work Space and search for a name, you only see results from Work. This scoped search is significantly faster and less noisy than a global search, especially in the Spaces where you spend most of your time.

**Global search:** A global search icon is available from the Main Wall top bar. It searches across all Spaces simultaneously and shows results tagged with which Space each chat belongs to. This is for when you need to find someone but cannot remember which Space they are in.

## **5.3  Chat row information**
Each chat row in any view displays:

- Contact avatar with initials.
- Contact name.
- Multi-space badge if the chat appears in more than one Space.
- Preview of the last message.
- Time of last message.
- Timer countdown badge (Main Wall only, for non-pinned chats).
- Unread indicator dot.
- Pin icon if the chat is pinned in the current view.

## **5.4  Bottom Navigation**
The app has four primary navigation items in the bottom bar:

- Chats — the main view showing the Main Wall and Space strip.
- Spaces — a grid overview of all your Spaces for quick access and management.
- Activity — notifications, missed messages, recent activity across all Spaces.
- Profile — user settings, timer preferences, Space management, account.

## **5.5  Pinning and reordering**
Pinning a chat is done by long-pressing on a chat row and selecting ‘Pin to top’. The pin applies to the current view — if you pin from the Main Wall, it is pinned to the Main Wall. If you pin from within a Space, it is pinned to that Space. These pins are independent of each other.

Reordering pinned chats is done by entering edit mode (a small ‘Edit’ button appears in the pinned section header when there are pinned chats). In edit mode, drag handles appear next to each pinned chat and you can drag them into any order. Tap ‘Done’ to save.

# **6. How Spaces Compares to Existing Apps**
Several chat apps have attempted to solve the organisation problem. None of them have solved it the way Spaces does. The table below maps out the key differentiating features:

|**Feature**|**WhatsApp**|**Telegram**|**Instagram DMs**|**Signal**|**Spaces**|
| :- | :- | :- | :- | :- | :- |
|Folders or spaces|No|Yes|Yes (creator accounts)|Basic (desktop only)|Yes|
|Main wall auto-cleans|No|No|No|No|Yes|
|User-set surface timer|No|No|No|No|Yes|
|Per-space search|No|No|No|No|Yes|
|One entity, multi-space|No|No|No|No|Yes|
|Unassigned holding space|No|No|No|No|Yes|
|Pinning within spaces|No|Yes (partial)|No|No|Yes|
|Reorderable pins|No|No|No|No|Yes|
|Designed for personal use|Yes|Partial|No|Yes|Yes|

The most significant gap in the market is the combination of automatic surfacing and automatic return. Every existing app either requires manual archiving (still an action the user must perform) or keeps everything in the main list permanently. Spaces is the only system where the main view manages itself.

# **7. Core User Flows**
## **7.1  Receiving a message from a known contact**
- Message arrives from Rohit, who is in the Friends Space.
- Rohit’s chat surfaces to the top of the Main Wall.
- A timer badge appears: “1d left” (based on user’s timer setting).
- User reads and replies. Conversation continues.
- 24 hours after the last message, the timer expires.
- Rohit’s chat quietly leaves the Main Wall.
- Rohit is now visible again only in the Friends Space, sorted by most recent message.
- The Main Wall is clean. No action required from the user.

## **7.2  Receiving a message from a stranger**
- Message arrives from an unknown number.
- The chat surfaces to the Main Wall with a grey timer badge.
- User reads the message, decides whether to reply.
- Timer expires. The chat moves to Unassigned.
- User later visits Unassigned, recognises the person, taps the folder-plus icon, selects ‘Work’.
- The chat is now in the Work Space and will behave like any other chat there going forward.

## **7.3  Adding a sibling to a second Space**
- User is browsing the Cousins Space.
- User long-presses on an empty area or taps the Space settings.
- Selects ‘Add someone to this space’.
- Searches for their sibling’s name.
- System shows a warning: “Sibling already exists in Family — same chat will also appear here. Add anyway?”
- User taps ‘Add’.
- Sibling now appears in both Family and Cousins, showing the ‘also in Family’ badge.
- Tapping from either Space opens the same conversation thread.

## **7.4  Using Keep on wall**
- User is in an ongoing active conversation with Alice.
- User long-presses Alice’s chat row on the Main Wall.
- Selects ‘Keep on wall’.
- The timer badge disappears. Alice’s chat stays on the Main Wall indefinitely.
- When the conversation quiets down, user long-presses again and selects ‘Return to space’.
- Alice’s chat leaves the Main Wall and returns to Work (or wherever she lives).

# **8. Design Principles**
The following principles guided every decision in the Spaces concept. Any future feature or modification should be evaluated against them.

## **8.1  Zero maintenance as the default**
The system should work perfectly for a user who never manually archives, moves, or organises anything. The timer does the work. Organisation happens naturally. A user who does nothing beyond setting their timer once should have a clean, functional inbox indefinitely.

## **8.2  Nothing is ever lost**
Chats leaving the Main Wall is not deletion. Unassigned is not a trash folder. Every conversation, every message, every contact remains completely accessible at all times. The system organises visibility, not data.

## **8.3  One entity, always**
A person is one person. Their conversation is one conversation. The same entity can be accessible from multiple Spaces for convenience, but it never becomes multiple entities. This prevents confusion, prevents split histories, and keeps the data model simple and trustworthy.

## **8.4  Spaces reflect real life**
People naturally think of their contacts in relational clusters: work people, family, friends from school, people from a specific event or period of life. Spaces are designed to mirror this mental model rather than imposing an artificial hierarchy. There are no pre-set categories. Users build the structure that matches their world.

## **8.5  The main wall is a present-tense surface**
The Main Wall is not a history. It is not an archive. It is a live view of what is happening right now in your conversations. If nothing is happening, the Main Wall should be near-empty, showing only your pinned contacts. This is the desired state, not a problem to be solved.

## **8.6  Transparency over surprise**
Every automatic action the system takes is visible to the user. Timer countdowns are shown. Multi-space badges are shown. The ‘already in a space’ warning is shown. The system never moves or changes something without the user being able to see that it happened and understand why.

# **9. Potential Future Directions**
The core concept described in this document is the foundation. The following are natural extensions that could be built on top of it, but are not part of the initial concept:

- Per-contact timer overrides: allow a different timer duration for specific contacts, e.g. keep your manager on the Main Wall for 1 week but a casual acquaintance for only 1 hour.
- Per-Space timer defaults: set a different default timer for each Space, so messages from Work contacts surface for 3 days but messages from old colleagues surface for only 1 day.
- Space notifications control: mute notifications for an entire Space without muting individual contacts.
- Space sharing: share a Space configuration with another user, useful for coordinating around a shared context like a project, event, or family group.
- Smart Space suggestions: the system notices that several of your contacts frequently appear in the same message threads and suggests creating a new Space for them.
- Temporary Spaces: a Space that automatically dissolves after a set date, useful for event-based groupings like a wedding or a conference.

# **10. Summary**
Spaces solves the fundamental problem of chat app clutter by replacing the static, ever-growing message list with a dynamic, self-cleaning main wall backed by a relational space system.

The key innovations are:

- A main wall that automatically returns conversations to their Spaces after a user-defined timer, requiring no manual archiving or organisation.
- Spaces that act as fully functional mini-main-walls with their own search, pins, and reordering — not just passive folders.
- A single-entity model that allows one conversation to be accessible from multiple Spaces without creating duplicates.
- An Unassigned holding space for new contacts, so strangers never clutter the main wall and are never lost.
- Complete transparency: timer countdowns, multi-space badges, and plain-language warnings keep the user always informed of what the system is doing.

No existing app combines these features. The closest competitor, Telegram, has folders and archives but no auto-surfacing timer, no single-entity multi-space model, and no self-cleaning main wall. Spaces represents a genuinely new approach to personal communication management.

|*The goal is simple: open the app, see only what matters right now, find anyone you need instantly, and never spend a single moment cleaning up your inbox. That is what Spaces delivers.*|
| :- |


*End of document — Spaces Product Concept v1.0*
